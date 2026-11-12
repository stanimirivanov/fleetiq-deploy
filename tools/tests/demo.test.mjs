import assert from 'node:assert/strict';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  demoInputFingerprint,
  parseDemoArguments,
  runDemoLifecycle,
  validateDemoModel,
  validateDemoOwner,
  validateDemoParents,
  validateSimulatorImage,
} from '../demo.mjs';
import { demoFailureDiagnostic } from '../demo-qualification.mjs';
import { lock, validateLock } from '../policy.mjs';
import { root } from '../process.mjs';

const pin = {
  repository: 'https://github.com/stanimirivanov/fleetiq-simulator',
  commit: 'a'.repeat(40),
  sourceSha256: 'b'.repeat(64),
  image: `ghcr.io/stanimirivanov/fleetiq-simulator@sha256:${'c'.repeat(64)}`,
};
function metadata() {
  return {
    Id: `sha256:${'d'.repeat(64)}`,
    RepoDigests: [pin.image],
    Os: 'linux',
    Architecture: 'amd64',
    Config: {
      User: '65532:65532',
      Entrypoint: ['/usr/local/bin/node', '/app/dist/cli.js'],
      Labels: {
        'org.opencontainers.image.source': pin.repository,
        'org.opencontainers.image.revision': pin.commit,
        'com.fleetiq.source.sha256': pin.sourceSha256,
      },
    },
  };
}

test('demo admits only the published simulator digest and exact reviewed source/runtime', () => {
  assert.equal(validateSimulatorImage(pin, metadata()), metadata().Id);
  for (const change of [
    (value) => {
      value.RepoDigests = [];
    },
    (value) => {
      value.Config.User = '0';
    },
    (value) => {
      value.Architecture = 'arm64';
    },
    (value) => {
      value.Config.Labels['org.opencontainers.image.revision'] = 'e'.repeat(40);
    },
    (value) => {
      value.Config.Labels['com.fleetiq.source.sha256'] = 'f'.repeat(64);
    },
  ]) {
    const value = metadata();
    change(value);
    assert.throws(
      () => validateSimulatorImage(pin, value),
      /Demo simulator artifact invalid/,
    );
  }
});

test('demo never sends until authenticated provisioning and pipeline readiness succeed', async () => {
  let provisioned = false,
    ready = false,
    sent = false;
  const operations = {
    owned: () => {},
    infrastructure: async () => {},
    provision: async () => {
      provisioned = true;
    },
    pipeline: async () => {
      assert(provisioned);
      ready = true;
    },
    simulate: async () => {
      assert(provisioned && ready);
      sent = true;
    },
    down: () => {},
    reset: () => {},
  };
  await runDemoLifecycle('up', operations);
  assert(sent);
  sent = false;
  await assert.rejects(
    runDemoLifecycle('up', {
      ...operations,
      provision: async () => {
        throw new Error('unavailable');
      },
    }),
  );
  assert(!sent);
});

test('foreign ownership prevents every lifecycle mutation, including reset', async () => {
  for (const command of ['up', 'down', 'reset']) {
    let mutated = false;
    const mutation = () => {
      mutated = true;
    };
    await assert.rejects(
      runDemoLifecycle(command, {
        owned: () => {
          throw new Error('foreign owner/context');
        },
        infrastructure: mutation,
        provision: mutation,
        pipeline: mutation,
        simulate: mutation,
        down: mutation,
        reset: mutation,
      }),
      /foreign/,
    );
    assert(!mutated);
  }
});

test('retained lifecycle identity binds owner, context, daemon, seed, artifact and published simulator', () => {
  const owner = { id: 'owner', context: 'local', daemonId: 'daemon' };
  const site = { owner, docker: 'local' };
  const seed = {
    owner: 'seed-owner',
    identityFingerprint: 'identity',
    artifact: { sha256: 'artifact' },
  };
  const state = {
    schemaVersion: 1,
    owner: 'owner',
    context: 'local',
    daemonId: 'daemon',
    seedOwner: 'seed-owner',
    identityFingerprint: 'identity',
    artifactSha256: 'artifact',
    simulator: pin.image,
    inputsSha256: 'inputs',
  };
  assert.doesNotThrow(() => validateDemoOwner(state, site, seed, pin, 'inputs'));
  for (const key of [
    'owner',
    'context',
    'daemonId',
    'seedOwner',
    'identityFingerprint',
    'artifactSha256',
    'simulator',
    'inputsSha256',
  ]) {
    assert.throws(
      () =>
        validateDemoOwner({ ...state, [key]: 'foreign' }, site, seed, pin, 'inputs'),
      /Demo ownership invalid/,
    );
  }
});

test('ordinary down cannot call reset or alter retained provisioning state', async () => {
  const state = { identity: 'retained', database: 'retained', journal: 'retained' };
  let stopped = false;
  await runDemoLifecycle('down', {
    owned: () => {},
    down: () => {
      stopped = true;
    },
    reset: () => {
      state.database = 'deleted';
    },
  });
  assert(stopped);
  assert.deepEqual(state, {
    identity: 'retained',
    database: 'retained',
    journal: 'retained',
  });
});

test('artifact lock rejects mutable or foreign simulator pins while retaining exact producer identity', () => {
  const value = { ...structuredClone(lock), simulator: pin };
  assert.doesNotThrow(() => validateLock(value));
  for (const change of [
    { ...pin, image: 'ghcr.io/stanimirivanov/fleetiq-simulator:latest' },
    { ...pin, commit: 'main' },
    { ...pin, sourceSha256: '' },
    { ...pin, repository: 'https://github.com/foreign/repo' },
  ])
    assert.throws(() => validateLock({ ...value, simulator: change }));
});

function policyFixture() {
  const fixture = JSON.parse(
    readFileSync(
      new URL('./fixtures/demo-rendered.json', import.meta.url),
      'utf8',
    ).replaceAll('/fixture-repository', root.replace(/\/$/u, '')),
  );
  const baseline = fixture.baseline;
  const model = {
    ...structuredClone(baseline),
    services: { ...structuredClone(baseline.services), ...fixture.overlay.services },
    secrets: fixture.overlay.secrets,
  };
  model.services['demo-issuer'].image = pin.image;
  model.services['demo-issuer'].entrypoint[0] = '/usr/local/bin/node';
  for (const role of ['demo-issuer', 'simulator'])
    model.services[role].user = `${process.getuid()}:${process.getgid()}`;
  return {
    model,
    site: {
      baseline,
      path: '/tmp/demo-fixture',
      project: 'fixture',
      owner: { id: 'fixture' },
    },
  };
}

test('demo overlay preserves the validated installation while forbidding privilege, exposure, auth and mount drift', () => {
  const { model, site } = policyFixture();
  assert.doesNotThrow(() => validateDemoModel(model, site, pin));
  for (const change of [
    (value) => {
      value.services.backend.environment.FLEETIQ_WORKLOAD_TOKENS = 'unexpected';
    },
    (value) => {
      value.services.edge.volumes[0].source = '/unrelated/file';
    },
    (value) => {
      value.services['replay-worker'].command = ['other-command'];
    },
    (value) => {
      value.services.simulator.volumes[0].source = '/unrelated/private';
    },
    (value) => {
      value.services['demo-issuer'].volumes[3].read_only = false;
    },
    (value) => {
      value.services.backend.user = '0';
    },
    (value) => {
      value.services.simulator.ports = [{ host_ip: '127.0.0.1', published: '55027' }];
    },
  ]) {
    const invalid = structuredClone(model);
    change(invalid);
    assert.throws(() => validateDemoModel(invalid, site, pin));
  }
});

test('real demo lifecycle is required by Docker and acceptance verification', async () => {
  const { catalogue } = await import('../verification-catalogue.mjs');
  assert(catalogue.docker.includes('demo-lifecycle'));
  assert(catalogue.acceptance.includes('demo-lifecycle'));
});

test('input seal distinguishes file boundaries even when concatenated bytes are identical', () => {
  const path = mkdtempSync(join(tmpdir(), 'demo-input-seal-'));
  try {
    mkdirSync(join(path, 'demo-inputs'), { mode: 0o700 });
    const config = '{"schemaVersion":1}\n',
      identities = `${JSON.stringify({ alias: '3'.repeat(15) })}\n`;
    writeFileSync(join(path, 'demo-inputs/config.json'), config, { mode: 0o600 });
    writeFileSync(join(path, 'demo-inputs/identities.json'), identities, {
      mode: 0o600,
    });
    const before = demoInputFingerprint(path);
    writeFileSync(join(path, 'demo-inputs/config.json'), config.slice(0, -1));
    writeFileSync(join(path, 'demo-inputs/identities.json'), `\n${identities}`);
    assert.equal(config + identities, `${config.slice(0, -1)}\n${identities}`);
    assert.notEqual(demoInputFingerprint(path), before);
  } finally {
    rmSync(path, { recursive: true, force: true });
  }
});

test('demo namespace rejects linked parents before any state can be created outside its owner', () => {
  const path = mkdtempSync(join(tmpdir(), 'demo-parents-'));
  try {
    mkdirSync(join(path, '.local'), { mode: 0o775 });
    assert.doesNotThrow(() => validateDemoParents(path));
    mkdirSync(join(path, 'unrelated'), { mode: 0o700 });
    symlinkSync(join(path, 'unrelated'), join(path, '.local/instances'));
    assert.throws(() => validateDemoParents(path), /Demo namespace invalid/);
  } finally {
    rmSync(path, { recursive: true, force: true });
  }
});

test('lifecycle failure diagnostics expose reviewed locations rather than private assertion text', () => {
  const failure = new Error('private subject and credential');
  failure.stack =
    'Error: private subject and credential\n at method (file:///private/location/tools/demo.mjs:321:9)';
  assert.equal(demoFailureDiagnostic(failure), 'unexpected@demo.mjs:321');
  assert.equal(demoFailureDiagnostic({ message: 'private' }), 'unexpected');
});

test('demo reset requires an explicit matching owned-instance confirmation', () => {
  assert.deepEqual(
    parseDemoArguments([
      'demo-reset',
      'simulator-demo',
      '--confirm-owned-instance',
      'simulator-demo',
    ]),
    {
      command: 'reset',
      name: 'simulator-demo',
      artifactPath: undefined,
    },
  );
  for (const args of [
    ['demo-reset', 'simulator-demo'],
    ['demo-reset', 'simulator-demo', '--confirm-owned-instance', 'other'],
    ['demo-reset', '--confirm-owned-instance', '--confirm-owned-instance'],
    ['demo-up', 'simulator-demo', 'unexpected'],
    ['demo-init', 'simulator-demo'],
    ['demo-reset'],
  ])
    assert.throws(() => parseDemoArguments(args));
  assert.equal(
    parseDemoArguments(['demo-init', 'simulator-demo', '/private/component.wasm'])
      .artifactPath,
    '/private/component.wasm',
  );
  assert.equal(parseDemoArguments(['demo-down', 'simulator-demo']).command, 'down');
});

test('demo argument errors never echo an invalid name, confirmation or component path', () => {
  for (const args of [
    ['demo-reset', 'simulator-demo', '--confirm-owned-instance', 'private-canary'],
    ['demo-up', '/private-canary'],
    ['demo-init', 'simulator-demo', '/private-canary', 'extra'],
    ['demo-down', 'simulator-demo', ''],
  ]) {
    assert.throws(
      () => parseDemoArguments(args),
      (error) => {
        assert(!error.message.includes('private-canary'));
        assert.match(error.message, /^Invalid demo arguments; use /);
        return true;
      },
    );
  }
});
