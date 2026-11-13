import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  completeSimulator,
  verifyMapCoordinates,
  verifySimulatorReading,
} from '../../local/demo/evidence.mjs';
import { expectedWorkflow } from '../ci.mjs';
import { demoFailureDiagnostic } from '../demo-qualification.mjs';
import { CommandFailure } from '../process.mjs';
import { rejectedLogin } from '../simulator-qualification.mjs';
import { catalogue } from '../verification-catalogue.mjs';

const expected = {
  tenantId: 'tenant-fixture',
  assetId: 'asset-fixture',
  deviceId: 'device-fixture',
  record: { timestampMs: '1000', latitudeE7: 427000000, longitudeE7: 233000000 },
};
function evidence() {
  const change = {
    tenant_id: expected.tenantId,
    asset_id: expected.assetId,
    property_id: 'position.latitude',
    property_version: 1,
    binding_id: 'device-fixture-latitude',
    binding_revision: '1',
    interpretation: 'v1.aa',
    event_at_ms: '1000',
    event_time_basis: 'device_recorded',
    value: { kind: 'integer', value: '427000000' },
    source: {
      device_asset_id: expected.deviceId,
      endpoint_id: 'main',
      signal_id: 'gps.latitude_e7',
      protocol_package_id: 'vendor.teltonika',
      protocol_package_version: 'simulator-demo-1',
      message_id: 'message-fixture',
      device_recorded_at_ms: '1000',
    },
  };
  return {
    snapshot: { pending: false, items: [{ freshness: 'fresh', change }] },
    history: { changes: [structuredClone(change)], next_after: null },
    provenance: structuredClone(change),
  };
}
test('exact simulator evidence rejects missing, stale, substituted or incorrectly bound readings', () => {
  assert.doesNotThrow(() => verifySimulatorReading(evidence(), expected, 'latitude'));
  for (const mutate of [
    (e) => {
      e.snapshot.items = [];
    },
    (e) => {
      e.snapshot.pending = true;
    },
    (e) => {
      e.snapshot.items[0].change.event_at_ms = '999';
    },
    (e) => {
      e.snapshot.items[0].change.binding_revision = '2';
    },
    (e) => {
      e.snapshot.items[0].change.source.device_asset_id = 'sample-device';
    },
    (e) => {
      e.provenance.source.protocol_package_version = 'sample';
    },
    (e) => {
      e.history.changes.push(structuredClone(e.history.changes[0]));
    },
  ]) {
    const e = evidence();
    mutate(e);
    assert.throws(() => verifySimulatorReading(e, expected, 'latitude'));
  }
});
test('acceptance requires actual ACK, real map/Inspect, identity rejection, unchanged storage and owned cleanup', () => {
  const base = {
    checks: ['real-producer-ack', 'owned-reset', 'unrelated-resources-retained'],
  };
  const browser = {
    checks: ['durable-projection', 'selected-map-point', 'matching-inspect'],
    accepted: '2',
  };
  const result = completeSimulator(base, browser, browser, true);
  assert.deepEqual(result, [
    'wire-ack',
    'durable-projection',
    'selected-map-point',
    'matching-inspect',
    'wrong-identity-rejected',
    'accepted-data-unchanged',
    'owned-cleanup',
  ]);
  for (const mutation of [
    () => completeSimulator({ ...base, checks: [] }, browser, browser, true),
    () => completeSimulator(base, { ...browser, checks: [] }, browser, true),
    () => completeSimulator(base, browser, { ...browser, accepted: '3' }, true),
    () => completeSimulator(base, browser, browser, false),
  ])
    assert.throws(mutation);
});

test('the canonical simulator gate and CI receipt cannot disappear behind a successful job', () => {
  const manifest = JSON.parse(
    readFileSync(new URL('../../package.json', import.meta.url)),
  );
  assert.equal(
    manifest.scripts['qualify:simulator'],
    'node tools/verify.mjs simulator',
  );
  assert.deepEqual(catalogue.simulator, ['toolchain', 'policy', 'installed-simulator']);
  assert(catalogue.acceptance.includes('installed-simulator'));
  assert(expectedWorkflow.includes('run: pnpm qualify:simulator'));
  assert(expectedWorkflow.includes('run: node tools/ci-evidence.mjs simulator'));
});

test('simulator browser failure diagnostics expose fixed phases but never private child output', () => {
  assert.equal(
    demoFailureDiagnostic(new Error('Simulator browser qualification failed: map')),
    'simulator-browser-map',
  );
  assert.equal(
    demoFailureDiagnostic(
      new Error('Simulator browser qualification failed: private-canary'),
    ),
    'unexpected',
  );
});

test('map diagnostics distinguish renderer readiness, selection and owned resources', () => {
  for (const phase of [
    'map-ready',
    'map-list',
    'map-point',
    'map-coordinate',
    'map-resources',
  ])
    assert.equal(
      demoFailureDiagnostic(
        new Error(`Simulator browser qualification failed: ${phase}`),
      ),
      `simulator-browser-${phase}`,
    );
});

test('map display matches exact E7 coordinates independent of trailing decimal zeros', () => {
  verifyMapCoordinates('42.7000000, 23.3000000', expected.record);
  verifyMapCoordinates('42.7, 23.3', expected.record);
  for (const text of [
    '42.7000001, 23.3000000',
    '42.7000000, 23.3000001',
    'Sample position',
    '42.7, NaN',
  ])
    assert.throws(() => verifyMapCoordinates(text, expected.record));
});

test('identity rejection requires the simulator exit and exact category, not Compose status text', () => {
  const failure = new CommandFailure('docker/run', { status: 3 }, 'command-failed');
  assert(rejectedLogin(failure, 'Container fixture Created\nlogin-refused\n'));
  for (const text of ['login-timeout\n', 'prefix-login-refused', 'login-refused-extra'])
    assert(!rejectedLogin(failure, text));
  assert(!rejectedLogin(new Error('login-refused'), 'login-refused\n'));
  assert(
    !rejectedLogin(
      new CommandFailure('docker/run', { status: 1 }, 'command-failed'),
      'login-refused\n',
    ),
  );
});

test('the pinned platform rejects unknown identity claims by closing before acceptance', () => {
  const failure = new CommandFailure('docker/run', { status: 3 }, 'command-failed');
  assert(rejectedLogin(failure, 'Container fixture Created\nconnection-closed\n'));
  assert(!rejectedLogin(failure, 'login-timeout\n'));
  assert(!rejectedLogin(failure, 'ack-timeout\n'));
});
