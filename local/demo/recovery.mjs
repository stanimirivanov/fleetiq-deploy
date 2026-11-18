import assert from 'node:assert/strict';

/** Original stationary fixture: its clock advances; no heartbeat or extra trigger records are generated. */
export function recoveryScenario(base) {
  assert.match(base.record.timestampMs, /^(?:0|[1-9][0-9]*)$/u);
  for (const [axis, limit] of [
    ['latitude', 900000000],
    ['longitude', 1800000000],
  ])
    assert(
      Number.isInteger(base.record[`${axis}E7`]) &&
        Math.abs(base.record[`${axis}E7`]) <= limit,
    );
  const start = BigInt(base.record.timestampMs) - 2000000n;
  assert(start >= 0n);
  return {
    timestamps: [0, 1000, 2000].map((offset) => String(start + BigInt(offset))),
    config: {
      schemaVersion: 1,
      identityFile: 'identities.json',
      deviceId: base.deviceId,
      target: base.target,
      connectionPolicy: 'persistent-compliant-peer',
      retry: { maxAttempts: 1, ackDeadlineMs: 1000, totalDeadlineMs: 15000 },
      playback: {
        routeFile: 'route.json',
        scenarioFile: 'scenario.json',
        profileFile: 'profile.json',
        stateDirectory: 'private-state',
        intervalMs: 1000,
        sendIntervalMs: 1000,
        on: [],
        offlineUntilMs: 2000,
        timingProfile: 'accelerated',
        maxRecords: 1,
        maxFrameBytes: 1280,
        maxQueuedRecords: 1000,
        maxQueuedBytes: 16777216,
        maxAgeMs: 86400000,
      },
    },
    route: {
      type: 'LineString',
      coordinates: [
        [base.record.longitudeE7 / 1e7, base.record.latitudeE7 / 1e7],
        [base.record.longitudeE7 / 1e7 + 0.001, base.record.latitudeE7 / 1e7 + 0.001],
      ],
    },
    profile: {
      schemaVersion: 1,
      id: 'fmb920-docs-v1',
      io: Object.fromEntries(
        [
          ['ignition', 239, 1],
          ['movement', 240, 1],
          ['gsm', 21, 1],
          ['externalVoltage', 66, 2],
          ['batteryVoltage', 67, 2],
          ['odometer', 16, 4],
          ['fuelUsed', 12, 4],
        ].map(([name, id, width]) => [name, { id, width }]),
      ),
    },
    scenario: {
      schemaVersion: 1,
      profile: 'fmb920-docs-v1',
      seed: 'installed-offline-recovery-v1',
      startTimeMs: String(start),
      clockOffsetMs: 0,
      driftPpm: 0,
      loop: false,
      phases: [{ durationMs: 2000, speedMmPerSecond: 0, ignition: true, gpsFix: true }],
    },
  };
}

/** Verifies every bounded hot-history row and source timestamp; duplicates cannot hide missing captures. */
export function verifyRecoveryHistory(history, expected, axis) {
  assert(['latitude', 'longitude'].includes(axis));
  assert.equal(history.next_after, null);
  assert(
    Array.isArray(history.changes) &&
      history.changes.length > 0 &&
      history.changes.length <= 100,
  );
  const allowed = new Set(expected.timestamps);
  const observed = new Set();
  let previous = -1n;
  for (const row of history.changes) {
    assert(allowed.has(row.event_at_ms));
    assert(BigInt(row.event_at_ms) >= previous);
    previous = BigInt(row.event_at_ms);
    observed.add(row.event_at_ms);
    for (const [key, value] of Object.entries({
      tenant_id: expected.tenantId,
      asset_id: expected.assetId,
      property_id: `position.${axis}`,
      property_version: 1,
      binding_id: `${expected.deviceId}-${axis}`,
      binding_revision: '1',
      event_time_basis: 'device_recorded',
    }))
      assert.equal(row[key], value);
    assert.deepEqual(row.value, {
      kind: 'integer',
      value: String(expected.record[`${axis}E7`]),
    });
    for (const [key, value] of Object.entries({
      device_asset_id: expected.deviceId,
      endpoint_id: 'main',
      signal_id: `gps.${axis}_e7`,
      protocol_package_id: 'vendor.teltonika',
      protocol_package_version: 'simulator-demo-1',
      device_recorded_at_ms: row.event_at_ms,
    }))
      assert.equal(row.source[key], value);
    assert(typeof row.interpretation === 'string' && row.interpretation.length > 0);
    assert(
      typeof row.source.message_id === 'string' && row.source.message_id.length > 0,
    );
  }
  assert.deepEqual([...observed], expected.timestamps);
  return history.changes.length;
}

/** A retained queue and source history cannot pass without parent-owned lifecycle cleanup. */
export function completeRecovery(base, evidence) {
  for (const check of [
    'retained-restart',
    'owned-reset',
    'unrelated-resources-retained',
  ])
    assert(base.checks.includes(check));
  assert.equal(evidence.captured, 3);
  assert.equal(evidence.acknowledged, 3);
  for (const value of [
    evidence.pendingRetained,
    evidence.identityRetained,
    evidence.inputsRetained,
    evidence.history,
    evidence.completedResume,
  ])
    assert.equal(value, true);
  return ['offline-backlog', 'retained-checkpoint', 'recovered-source-history'];
}
