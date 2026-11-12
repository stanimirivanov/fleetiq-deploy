import assert from 'node:assert/strict';
import { createHash, randomInt, randomUUID } from 'node:crypto';
import {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { resolve } from 'node:path';

export const demoSeedFailurePhases = Object.freeze(
  [
    'preflight',
    'tenant',
    'grant',
    'property',
    'type',
    'asset',
    'device',
    'package',
    'admission',
    'route',
    'binding',
  ].flatMap((phase) =>
    ['', '-read', '-compare', '-write', '-receipt', '-verify', '-persist'].map(
      (boundary) => `${phase}${boundary}`,
    ),
  ),
);

const hash = (value) => createHash('sha256').update(value).digest('hex');
const digest = (value) => hash(JSON.stringify(value));
function privatePath(path, directory = false) {
  const stat = lstatSync(path);
  assert(realpathSync(path) === resolve(path) && stat.uid === process.getuid());
  assert(
    directory
      ? stat.isDirectory()
      : stat.isFile() && stat.nlink === 1 && stat.size <= 131072,
  );
  assert.equal(stat.mode & 0o777, directory ? 0o700 : 0o600);
  return path;
}
function artifactIdentity(artifact) {
  assert(
    Buffer.isBuffer(artifact) && artifact.length >= 8 && artifact.length <= 8388608,
  );
  assert.equal(artifact.readUInt32LE(0), 0x6d736100);
  assert.equal(artifact.readUInt32LE(4), 0x1000d);
  return { sha256: hash(artifact), size: artifact.length };
}

/** Flush then atomically replace only this owned journal; a torn write cannot become a checkpoint. */
function save(directory, state) {
  const parent = privatePath(resolve(directory, 'seed'), true);
  const temporary = resolve(parent, `pending-${randomUUID()}`);
  const fd = openSync(temporary, 'wx', 0o600);
  try {
    writeFileSync(fd, `${JSON.stringify(state)}\n`);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(temporary, resolve(parent, 'journal.json'));
  const folder = openSync(parent, 'r');
  try {
    fsyncSync(folder);
  } finally {
    closeSync(folder);
  }
}

/** Persist generated identities and the exact request-plan digest before any network mutation. */
export function initializeDemoSeed(
  directory,
  { actorId, identityFingerprint, artifact, deviceCount = 1 },
) {
  privatePath(directory, true);
  if (existsSync(resolve(directory, 'seed'))) {
    const retained = loadDemoSeed(directory, { identityFingerprint, artifact });
    if (retained.actorId !== actorId || retained.devices.length !== deviceCount)
      throw new Error('Demo seed state invalid');
    return retained;
  }
  assert(/^[A-Za-z0-9_.-]{1,128}$/u.test(actorId));
  assert(/^[a-f0-9]{64}$/u.test(identityFingerprint));
  assert(Number.isInteger(deviceCount) && deviceCount >= 1 && deviceCount <= 2);
  const owner = randomUUID();
  const state = {
    schemaVersion: 1,
    owner,
    actorId,
    identityFingerprint,
    artifact: artifactIdentity(artifact),
    tenantId: `demo-${owner}`,
    devices: Array.from({ length: deviceCount }, (_, i) => ({
      deviceId: `device-${owner}-${i}`,
      assetId: `asset-${owner}-${i}`,
      imei:
        String(randomInt(1, 10)) +
        Array.from({ length: 14 }, () => randomInt(0, 10)).join(''),
    })),
    intentDigest: null,
    progress: [],
  };
  state.intentDigest = intents(state, artifact);
  state.progress = plan(state, artifact).map(() => ({
    attempted: false,
    receipt: null,
  }));
  mkdirSync(resolve(directory, 'seed'), { mode: 0o700 });
  save(directory, state);
  return loadDemoSeed(directory, { identityFingerprint, artifact });
}

/** Reconstruct request identities from a closed private schema, never from stored URLs or executable input. */
export function loadDemoSeed(directory, { identityFingerprint, artifact }) {
  try {
    privatePath(directory, true);
    privatePath(resolve(directory, 'seed'), true);
    const state = JSON.parse(
      readFileSync(privatePath(resolve(directory, 'seed/journal.json'))),
    );
    assert.deepEqual(Object.keys(state).sort(), [
      'actorId',
      'artifact',
      'devices',
      'identityFingerprint',
      'intentDigest',
      'owner',
      'progress',
      'schemaVersion',
      'tenantId',
    ]);
    assert.equal(state.schemaVersion, 1);
    assert.match(
      state.owner,
      /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u,
    );
    assert.match(state.actorId, /^[A-Za-z0-9_.-]{1,128}$/u);
    assert.match(state.identityFingerprint, /^[a-f0-9]{64}$/u);
    assert.equal(state.identityFingerprint, identityFingerprint);
    assert.deepEqual(state.artifact, artifactIdentity(artifact));
    assert.equal(state.tenantId, `demo-${state.owner}`);
    assert(state.devices.length >= 1 && state.devices.length <= 2);
    for (const [i, d] of state.devices.entries()) {
      assert.deepEqual(Object.keys(d).sort(), ['assetId', 'deviceId', 'imei']);
      assert.equal(d.assetId, `asset-${state.owner}-${i}`);
      assert.equal(d.deviceId, `device-${state.owner}-${i}`);
      assert.match(d.imei, /^[1-9][0-9]{14}$/u);
    }
    assert.equal(new Set(state.devices.map((d) => d.imei)).size, state.devices.length);
    assert.equal(state.intentDigest, intents(state, artifact));
    assert.equal(state.progress.length, plan(state, artifact).length);
    for (const entry of state.progress) {
      assert.deepEqual(Object.keys(entry).sort(), ['attempted', 'receipt']);
      assert.equal(typeof entry.attempted, 'boolean');
      assert(
        entry.receipt === null ||
          (entry.attempted && /^[a-f0-9]{64}$/u.test(entry.receipt)),
      );
    }
    return state;
  } catch {
    throw new Error('Demo seed state invalid');
  }
}

/** Version-one dependency order is part of the journal contract; changes must never silently migrate pending work. */
function plan(state, artifact) {
  const tenant = `/api/v1/tenants/${state.tenantId}`,
    steps = [];
  const add = (kind, path, method, body, read, expected) =>
    steps.push({ kind, path, method, body, read, expected });
  add(
    'tenant',
    '/api/v1/admin/tenants',
    'POST',
    {
      provisioning_id: state.owner,
      tenant_id: state.tenantId,
      initial_administrator_actor_id: state.actorId,
    },
    null,
    { tenant_id: state.tenantId, state: 'active' },
  );
  for (const action of ['telemetry.read', 'protocol.manage'])
    add(
      'grant',
      `${tenant}/actors/${state.actorId}/access-changes`,
      'POST',
      { change_id: `${state.owner}-${action}`, kind: 'grant', action },
      `${tenant}/actors/${state.actorId}/grants`,
      null,
    );
  const properties = ['latitude', 'longitude'].map((axis) => ({
    id: `position.${axis}`,
    version: 1,
  }));
  for (const property of properties) {
    const body = {
      ...property,
      name: property.id,
      value_kind: 'integer',
      canonical_unit: null,
    };
    add(
      'property',
      `${tenant}/properties`,
      'POST',
      body,
      `${tenant}/properties/${property.id}/versions/1`,
      body,
    );
  }
  const type = {
    id: 'demo-equipment',
    version: 1,
    name: 'Synthetic demo equipment',
    supported_properties: properties,
  };
  add(
    'type',
    `${tenant}/asset-types`,
    'POST',
    type,
    `${tenant}/asset-types/${type.id}/versions/1`,
    type,
  );
  const pkg = `${tenant}/protocol-packages/vendor.teltonika/versions/simulator-demo-1`;
  const release = {
    package_id: 'vendor.teltonika',
    package_version: 'simulator-demo-1',
    artifact_sha256: state.artifact.sha256,
    artifact_size_bytes: state.artifact.size,
  };
  add('package', pkg, 'PUT', artifact, pkg, release);
  for (const world of ['runtime-v1', 'identity-v1'])
    add('admission', `${pkg}/admissions`, 'POST', { world }, null, {
      release,
      world,
      policy_version: 1,
      actor_id: state.actorId,
    });
  for (const device of state.devices) {
    for (const [id, identifiers] of [
      [device.deviceId, [{ kind: 'imei', authority: null, value: device.imei }]],
      [device.assetId, []],
    ]) {
      const body = {
        id,
        name: id,
        asset_type: { id: type.id, version: 1 },
        external_identifiers: identifiers,
      };
      add('asset', `${tenant}/assets`, 'POST', body, `${tenant}/assets/${id}`, {
        ...body,
        tenant_id: state.tenantId,
      });
    }
    const path = `${tenant}/assets/${device.deviceId}`;
    const capability = {
      endpoints: [{ id: 'main', kind: 'native.avl', name: 'Synthetic GPS telemetry' }],
    };
    add('device', `${path}/device`, 'POST', capability, `${path}/device`, {
      ...capability,
      tenant_id: state.tenantId,
      asset_id: device.deviceId,
    });
    const selection = {
      package_id: release.package_id,
      package_version: release.package_version,
      world: 'identity-v1',
    };
    add(
      'route',
      `${path}/protocol-routes/teltonika-tcp`,
      'PUT',
      { expected_revision: 0, selection },
      `${path}/protocol-routes/teltonika-tcp`,
      {
        device_asset_id: device.deviceId,
        channel_id: 'teltonika-tcp',
        revision: 1,
        selection,
        actor_id: state.actorId,
        policy_version: 1,
      },
    );
    for (const axis of ['latitude', 'longitude']) {
      const id = `${device.deviceId}-${axis}`,
        path = `${tenant}/signal-bindings/${id}/revisions/1`;
      const body = {
        source: {
          device_asset_id: device.deviceId,
          endpoint_id: 'main',
          signal_id: `gps.${axis}_e7`,
        },
        target: {
          asset_id: device.assetId,
          property: { id: `position.${axis}`, version: 1 },
        },
        effective_interval: { start_ms: 0, end_ms: null },
      };
      add('binding', path, 'POST', body, path, {
        ...body,
        id,
        tenant_id: state.tenantId,
        revision: '1',
      });
    }
  }
  return steps;
}

function intents(state, artifact) {
  return digest(
    plan(state, artifact).map((step) => ({
      ...step,
      body: step.kind === 'package' ? state.artifact : step.body,
    })),
  );
}

function equalFields(actual, expected) {
  assert(actual && typeof actual === 'object');
  for (const [key, value] of Object.entries(expected))
    assert.deepEqual(actual[key], value);
}
async function read(step, state, request) {
  // Admission has no GET: its documented idempotent POST rechecks current policy.
  if (step.kind === 'admission') return null;
  if (step.kind === 'tenant') {
    let after = '';
    for (let page = 0; page < 100; page++) {
      const result = await request(
        `/api/v1/admin/tenants?limit=100${after ? `&after=${encodeURIComponent(after)}` : ''}`,
      );
      assert.equal(result.status, 200);
      const match = result.body.tenants.find((v) => v.tenant_id === state.tenantId);
      if (match) return match;
      if (result.body.next_after === null) return null;
      assert(
        typeof result.body.next_after === 'string' && result.body.next_after > after,
      );
      after = result.body.next_after;
    }
    throw new Error('Catalogue exceeds bound');
  }
  const result = await request(step.read);
  assert([200, 404].includes(result.status));
  if (step.kind === 'grant') {
    assert.equal(result.status, 200);
    assert.equal(result.body.next_after, null);
    return result.body.grants.some((v) => v.action === step.body.action) ? {} : null;
  }
  if (step.kind === 'binding')
    assert.equal(
      (await request(step.read.replace('/revisions/1', '/revisions/2'))).status,
      404,
    );
  return result.status === 404 ? null : result.body;
}

/** Revalidate every remote fact, persist pending intent, then replay only the exact idempotent command. */
export async function reconcileDemoSeed(
  directory,
  { identityFingerprint, artifact, request },
) {
  let index = -1,
    phase = 'preflight';
  try {
    artifactIdentity(artifact);
    artifact = Buffer.from(artifact);
    const state = loadDemoSeed(directory, { identityFingerprint, artifact });
    const session = await request('/api/v1/auth/session');
    assert.equal(session.status, 200);
    assert.equal(session.body.actor_id, state.actorId);
    for (const [i, step] of plan(state, artifact).entries()) {
      index = i;
      phase = `${step.kind}-read`;
      const progress = state.progress[i],
        existing = await read(step, state, request);
      phase = `${step.kind}-compare`;
      if (existing !== null) {
        assert(progress.attempted, 'Foreign state');
        equalFields(existing, step.expected ?? {});
      } else if (step.kind !== 'admission')
        assert.equal(progress.receipt, null, 'Retained state missing');
      if (!progress.attempted) {
        progress.attempted = true;
        save(directory, state);
      }
      phase = `${step.kind}-write`;
      const result = await request(step.path, {
        method: step.method,
        body: step.body,
        wasm: step.kind === 'package',
      });
      assert([200, 201].includes(result.status));
      phase = `${step.kind}-receipt`;
      // Retry outcomes differ; the remaining original receipt fields must stay identical.
      const { outcome, ...receipt } = result.body;
      if (['property', 'type'].includes(step.kind))
        assert(['published', 'already_published'].includes(outcome));
      if (['asset', 'device'].includes(step.kind))
        assert.equal(receipt.registered_by, state.actorId);
      if (step.kind === 'binding') assert.equal(receipt.recorded_by, state.actorId);
      if (['route', 'package', 'admission'].includes(step.kind))
        equalFields(receipt, step.expected);
      phase = `${step.kind}-verify`;
      if (step.kind !== 'admission')
        equalFields(await read(step, state, request), step.expected ?? {});
      phase = `${step.kind}-persist`;
      const fingerprint = digest(receipt);
      if (progress.receipt !== null)
        assert.equal(progress.receipt, fingerprint, 'Original receipt changed');
      else {
        progress.receipt = fingerprint;
        save(directory, state);
      }
    }
    return state;
  } catch {
    throw Object.assign(
      new Error(
        `Demo seed reconciliation failed at step ${index < 0 ? 'preflight' : index + 1}`,
      ),
      { phase },
    );
  }
}
