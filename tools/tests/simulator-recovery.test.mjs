import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  completeRecovery,
  recoveryScenario,
  verifyRecoveryHistory,
} from '../../local/demo/recovery.mjs';

const base = {
  schemaVersion: 1,
  identityFile: 'identities.json',
  deviceId: 'demo-device',
  target: { transport: 'tcp', host: 'tcp-ingestion', port: 55027 },
  record: {
    timestampMs: '1800000000000',
    latitudeE7: 427000000,
    longitudeE7: 233000000,
  },
};
const expected = {
  tenantId: 'tenant-fixture',
  assetId: 'asset-fixture',
  deviceId: 'device-fixture',
  record: base.record,
  timestamps: ['1000', '2000', '3000'],
};
function history() {
  return {
    next_after: null,
    changes: expected.timestamps.map((time) => ({
      tenant_id: expected.tenantId,
      asset_id: expected.assetId,
      property_id: 'position.latitude',
      property_version: 1,
      binding_id: 'device-fixture-latitude',
      binding_revision: '1',
      event_at_ms: time,
      event_time_basis: 'device_recorded',
      value: { kind: 'integer', value: '427000000' },
      interpretation: `v1.${time}`,
      source: {
        device_asset_id: expected.deviceId,
        endpoint_id: 'main',
        signal_id: 'gps.latitude_e7',
        protocol_package_id: 'vendor.teltonika',
        protocol_package_version: 'simulator-demo-1',
        device_recorded_at_ms: time,
        message_id: `message-${time}`,
      },
    })),
  };
}

test('offline recovery inputs freeze three source captures and use bounded private state', () => {
  const scenario = recoveryScenario(base);
  assert.equal(scenario.config.connectionPolicy, 'persistent-compliant-peer');
  assert.equal(scenario.config.identityFile, 'identities.json');
  assert.equal(scenario.config.playback.maxRecords, 1);
  assert.equal(scenario.config.playback.timingProfile, 'accelerated');
  assert.equal(scenario.config.playback.offlineUntilMs, 2000);
  assert.equal(scenario.scenario.clockOffsetMs, 0);
  assert.equal(scenario.scenario.driftPpm, 0);
  assert.equal(scenario.timestamps.length, 3);
  assert.throws(() =>
    recoveryScenario({ ...base, record: { ...base.record, timestampMs: '-1' } }),
  );
  assert.throws(() =>
    recoveryScenario({ ...base, record: { ...base.record, latitudeE7: 900000001 } }),
  );
});

test('recovered history preserves chronological source evidence and permits retransmission duplicates', () => {
  assert.equal(verifyRecoveryHistory(history(), expected, 'latitude'), 3);
  const duplicated = history();
  duplicated.changes.splice(1, 0, structuredClone(duplicated.changes[0]));
  assert.equal(verifyRecoveryHistory(duplicated, expected, 'latitude'), 4);
  for (const mutate of [
    (h) => {
      h.changes.reverse();
    },
    (h) => {
      h.changes.pop();
    },
    (h) => {
      h.next_after = 'incomplete';
    },
    (h) => {
      h.changes[0].tenant_id = 'foreign';
    },
    (h) => {
      h.changes[0].source.device_asset_id = 'foreign';
    },
    (h) => {
      h.changes[0].event_time_basis = 'received';
    },
    (h) => {
      h.changes[0].value.value = '0';
    },
    (h) => {
      h.changes[0].source.device_recorded_at_ms = '0';
    },
    (h) => {
      h.changes[0].source.protocol_package_version = 'sample';
    },
  ]) {
    const value = history();
    mutate(value);
    assert.throws(() => verifyRecoveryHistory(value, expected, 'latitude'));
  }
});

test('recovery acceptance refuses missing checkpoint retention, incomplete history or cleanup', () => {
  const evidence = {
    captured: 3,
    acknowledged: 3,
    pendingRetained: true,
    identityRetained: true,
    inputsRetained: true,
    history: true,
    completedResume: true,
  };
  const base = {
    checks: ['retained-restart', 'owned-reset', 'unrelated-resources-retained'],
  };
  assert.equal(completeRecovery(base, evidence).length, 3);
  for (const key of [
    'pendingRetained',
    'identityRetained',
    'inputsRetained',
    'history',
    'completedResume',
  ])
    assert.throws(() => completeRecovery(base, { ...evidence, [key]: false }));
  assert.throws(() => completeRecovery(base, { ...evidence, acknowledged: 2 }));
  assert.throws(() => completeRecovery({ checks: [] }, evidence));
});
