import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { initializeDemoSeed, loadDemoSeed, reconcileDemoSeed } from '../demo-seed.mjs';

const artifact = Buffer.from([0, 97, 115, 109, 13, 0, 1, 0]);
const identityFingerprint = createHash('sha256')
  .update('controlled test authority')
  .digest('hex');
function fixture(t, deviceCount = 1) {
  const directory = mkdtempSync(join(tmpdir(), 'fleetiq-seed-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  initializeDemoSeed(directory, {
    actorId: 'test-operator',
    identityFingerprint,
    artifact,
    deviceCount,
  });
  return directory;
}

// A small server model, with independent first-write receipts and mutable read state.
function server() {
  const resources = new Map(),
    commands = new Map();
  let clock = 100;
  const request = async (path, { method = 'GET', body, wasm = false } = {}) => {
    const url = new URL(path, 'https://local.test'),
      p = url.pathname;
    const reply = (status, body) => ({ status, body });
    if (p === '/api/v1/auth/session') return reply(200, { actor_id: 'test-operator' });
    if (method === 'GET') {
      if (p === '/api/v1/admin/tenants')
        return reply(200, {
          tenants: [...resources.values()].filter((v) => v.state === 'active'),
          next_after: null,
        });
      return reply(resources.has(p) ? 200 : 404, resources.get(p) ?? null);
    }
    const signature = JSON.stringify(body);
    const commandKey = `${p}/${body?.change_id ?? body?.provisioning_id ?? body?.world ?? body?.id ?? ''}`;
    if (commands.has(commandKey)) {
      const old = commands.get(commandKey);
      return old.signature === signature
        ? reply(200, {
            ...old.receipt,
            outcome:
              old.outcome === 'published' ? 'already_published' : 'already_registered',
          })
        : reply(409, null);
    }
    const tenant = p.split('/')[4];
    let target = p,
      value = body;
    let receipt = { registered_by: 'test-operator', recorded_at_ms: clock++ },
      outcome = 'registered';
    if (p === '/api/v1/admin/tenants') {
      target = `tenant:${body.tenant_id}`;
      value = { tenant_id: body.tenant_id, state: 'active' };
      resources.set(`/api/v1/tenants/${body.tenant_id}/actors/test-operator/grants`, {
        grants: ['access.manage', 'metadata.manage', 'metadata.read'].map((action) => ({
          action,
        })),
        next_after: null,
      });
      receipt = {};
    } else if (p.endsWith('/access-changes')) {
      const grants = resources.get(p.replace('/access-changes', '/grants'));
      grants.grants.push({ action: body.action });
      grants.grants.sort((a, b) => a.action.localeCompare(b.action));
      value = null;
    } else if (p.endsWith('/properties') || p.endsWith('/asset-types')) {
      target = `${p}/${body.id}/versions/${body.version}`;
      receipt = {};
      outcome = 'published';
    } else if (p.endsWith('/assets')) {
      target = `${p}/${body.id}`;
      value = { ...body, tenant_id: tenant };
    } else if (p.endsWith('/device'))
      value = { ...body, tenant_id: tenant, asset_id: p.split('/')[6] };
    else if (wasm) {
      value = {
        package_id: p.split('/').at(-3),
        package_version: p.split('/').at(-1),
        artifact_sha256: createHash('sha256')
          .update(Uint8Array.from(body))
          .digest('hex'),
        artifact_size_bytes: body.length,
      };
      receipt = value;
    } else if (p.endsWith('/admissions')) {
      value = null;
      receipt = {
        release: resources.get(p.slice(0, -11)),
        world: body.world,
        policy_version: 1,
        actor_id: 'test-operator',
        admitted_at_ms: clock++,
      };
    } else if (p.includes('/protocol-routes/')) {
      value = {
        device_asset_id: p.split('/')[6],
        channel_id: p.split('/')[8],
        revision: 1,
        selection: body.selection,
        actor_id: 'test-operator',
        policy_version: 1,
        recorded_at_ms: clock++,
      };
      receipt = value;
    } else if (p.includes('/signal-bindings/')) {
      value = {
        ...body,
        id: p.split('/')[6],
        tenant_id: tenant,
        revision: '1',
        recorded_at_ms: clock++,
      };
      receipt = {
        recorded_by: 'test-operator',
        recorded_at_ms: value.recorded_at_ms,
        id: value.id,
        revision: '1',
      };
    }
    if (value !== null) {
      if (resources.has(target)) return reply(409, null);
      resources.set(target, structuredClone(value));
    }
    commands.set(commandKey, { signature, receipt, outcome });
    return reply(201, { ...receipt, outcome });
  };
  return { request, resources, commands };
}

test('owned metadata replays preserve original receipts, distinct devices and revision one', async (t) => {
  const directory = fixture(t, 2),
    remote = server();
  await reconcileDemoSeed(directory, {
    identityFingerprint,
    artifact,
    request: remote.request,
  });
  const first = readFileSync(join(directory, 'seed/journal.json'));
  const commands = remote.commands.size;
  await reconcileDemoSeed(directory, {
    identityFingerprint,
    artifact,
    request: remote.request,
  });
  assert.equal(readFileSync(join(directory, 'seed/journal.json')).equals(first), true);
  assert.equal(remote.commands.size, commands);
  const routes = [...remote.resources.entries()].filter(([p]) =>
    p.includes('/protocol-routes/'),
  );
  assert.equal(routes.length, 2);
  assert(routes.every(([, v]) => v.revision === 1));
  const state = loadDemoSeed(directory, { identityFingerprint, artifact });
  assert(new Set(state.devices.map((v) => v.imei)).size === 2);
});

test('lost responses before and after every mutation resume the same recorded intent', async (t) => {
  const baseline = fixture(t),
    reference = server();
  await reconcileDemoSeed(baseline, {
    identityFingerprint,
    artifact,
    request: reference.request,
  });
  const writes = reference.commands.size;
  assert(writes >= 15);
  for (const afterCommit of [false, true])
    for (let failed = 0; failed < writes; failed++) {
      const directory = fixture(t),
        remote = server();
      let ordinal = 0;
      const interrupted = async (path, options = {}) => {
        if (options.method && options.method !== 'GET' && ordinal++ === failed) {
          if (afterCommit) await remote.request(path, options);
          throw new Error('Private response deliberately lost');
        }
        return remote.request(path, options);
      };
      await assert.rejects(
        reconcileDemoSeed(directory, {
          identityFingerprint,
          artifact,
          request: interrupted,
        }),
        /Demo seed reconciliation failed/,
      );
      await reconcileDemoSeed(directory, {
        identityFingerprint,
        artifact,
        request: remote.request,
      });
      assert.equal(remote.commands.size, writes);
      assert(
        [...remote.resources.entries()]
          .filter(([p]) => p.includes('/protocol-routes/'))
          .every(([, v]) => v.revision === 1),
      );
    }
});

test('foreign resources, route or binding drift, identity/artifact changes and unsafe journals refuse', async (t) => {
  const directory = fixture(t),
    remote = server();
  const state = loadDemoSeed(directory, { identityFingerprint, artifact });
  remote.resources.set(`tenant:${state.tenantId}`, {
    tenant_id: state.tenantId,
    state: 'active',
  });
  await assert.rejects(
    reconcileDemoSeed(directory, {
      identityFingerprint,
      artifact,
      request: remote.request,
    }),
    /Demo seed reconciliation failed/,
  );
  assert.equal(remote.commands.size, 0);
  remote.resources.clear();
  await reconcileDemoSeed(directory, {
    identityFingerprint,
    artifact,
    request: remote.request,
  });
  const [path, route] = [...remote.resources.entries()].find(([p]) =>
    p.includes('/protocol-routes/'),
  );
  remote.resources.set(path, { ...route, revision: 2 });
  await assert.rejects(
    reconcileDemoSeed(directory, {
      identityFingerprint,
      artifact,
      request: remote.request,
    }),
    /Demo seed reconciliation failed/,
  );
  remote.resources.set(path, route);
  const [bindingPath, binding] = [...remote.resources.entries()].find(([p]) =>
    p.includes('/signal-bindings/'),
  );
  remote.resources.set(bindingPath.replace('/revisions/1', '/revisions/2'), {
    ...binding,
    revision: '2',
  });
  await assert.rejects(
    reconcileDemoSeed(directory, {
      identityFingerprint,
      artifact,
      request: remote.request,
    }),
    /Demo seed reconciliation failed/,
  );
  assert.throws(
    () => loadDemoSeed(directory, { identityFingerprint: 'a'.repeat(64), artifact }),
    /Demo seed state invalid/,
  );
  assert.throws(
    () =>
      loadDemoSeed(directory, {
        identityFingerprint,
        artifact: Buffer.concat([artifact, Buffer.from([1])]),
      }),
    /Demo seed state invalid/,
  );
  chmodSync(join(directory, 'seed/journal.json'), 0o644);
  assert.throws(
    () => loadDemoSeed(directory, { identityFingerprint, artifact }),
    /Demo seed state invalid/,
  );
  chmodSync(join(directory, 'seed/journal.json'), 0o600);
  writeFileSync(join(directory, 'seed/journal.json'), '{}');
  assert.throws(
    () =>
      initializeDemoSeed(directory, {
        actorId: 'test-operator',
        identityFingerprint,
        artifact,
      }),
    /Demo seed state invalid/,
  );
});

test('reinitialization cannot silently change the actor or number of private devices', (t) => {
  const directory = fixture(t);
  assert.throws(
    () =>
      initializeDemoSeed(directory, {
        actorId: 'another-operator',
        identityFingerprint,
        artifact,
      }),
    /Demo seed state invalid/,
  );
  assert.throws(
    () =>
      initializeDemoSeed(directory, {
        actorId: 'test-operator',
        identityFingerprint,
        artifact,
        deviceCount: 2,
      }),
    /Demo seed state invalid/,
  );
});

test('a killed seeder resumes after a remote commit without a local receipt', {
  timeout: 10000,
}, async (t) => {
  const directory = fixture(t),
    remote = server();
  const module = new URL('../demo-seed.mjs', import.meta.url).href;
  const child = spawn(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `
    import { reconcileDemoSeed } from ${JSON.stringify(module)};
    process.once('message', async ({directory,identityFingerprint,artifact}) => {
      await reconcileDemoSeed(directory, {identityFingerprint,artifact:Buffer.from(artifact),
        request:(path,options) => new Promise(resolve => {
          process.once('message',resolve); process.send({path,options});
        }) });
    });
  `,
    ],
    { stdio: ['ignore', 'ignore', 'ignore', 'ipc'] },
  );
  t.after(() => {
    if (child.exitCode === null) child.kill('SIGKILL');
  });
  child.on('message', async ({ path, options }) => {
    const result = await remote.request(path, options);
    if (options?.method === 'POST') child.kill('SIGKILL');
    else child.send(result);
  });
  const exited = once(child, 'exit');
  child.send({ directory, identityFingerprint, artifact: [...artifact] });
  assert.equal((await exited)[1], 'SIGKILL');
  assert.equal(remote.commands.size, 1);
  await reconcileDemoSeed(directory, {
    identityFingerprint,
    artifact,
    request: remote.request,
  });
  assert(
    loadDemoSeed(directory, { identityFingerprint, artifact }).progress.every(
      (p) => p.receipt !== null,
    ),
  );
});

test('the browser seed transport refuses another origin before sending private input', async () => {
  const { demoSeedRequest } = await import('../../local/demo/seed.mjs');
  const page = {
    url: () => 'https://outside.invalid',
    evaluate: () => assert.fail('No request may escape the canonical origin'),
  };
  await assert.rejects(
    demoSeedRequest(page, '/api/v1/auth/session'),
    /Demo seed API unavailable/,
  );
});

test('registration receipts must belong to the authenticated owner, including assets and capabilities', async (t) => {
  for (const suffix of ['/assets', '/device']) {
    const directory = fixture(t),
      remote = server();
    await assert.rejects(
      reconcileDemoSeed(directory, {
        identityFingerprint,
        artifact,
        request: async (path, options) => {
          const response = await remote.request(path, options);
          return options?.method === 'POST' && path.endsWith(suffix)
            ? {
                ...response,
                body: { ...response.body, registered_by: 'another-operator' },
              }
            : response;
        },
      }),
      /Demo seed reconciliation failed/,
    );
  }
});

test('safe failure categories distinguish the exact read/write boundary', async (t) => {
  const directory = fixture(t),
    remote = server();
  await assert.rejects(
    reconcileDemoSeed(directory, {
      identityFingerprint,
      artifact,
      request: (path, options) =>
        options?.method === 'POST' && path.endsWith('/properties')
          ? Promise.resolve({ status: 403, body: null })
          : remote.request(path, options),
    }),
    (error) => error.phase === 'property-write',
  );
});

test('command failures print a fixed reviewed phase and never private details', async () => {
  const { demoSeedFailureMessage } = await import('../../local/demo/seed.mjs');
  const marker = 'private-input-must-not-escape';
  assert(
    !demoSeedFailureMessage(
      Object.assign(new Error(marker), { phase: marker }),
    ).includes(marker),
  );
  assert(demoSeedFailureMessage({ phase: 'route-write' }).includes('route-write'));
});
