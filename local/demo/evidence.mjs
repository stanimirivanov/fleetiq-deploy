import assert from 'node:assert/strict';

/** Compare real current/history/provenance to the sealed record, never to sample UI constants. */
export function verifySimulatorReading(
  { snapshot, history, provenance },
  expected,
  axis,
) {
  assert(['latitude', 'longitude'].includes(axis));
  assert.equal(snapshot.pending, false);
  assert.equal(snapshot.items.length, 1);
  const change = snapshot.items[0].change;
  for (const [key, value] of Object.entries({
    tenant_id: expected.tenantId,
    asset_id: expected.assetId,
    property_id: `position.${axis}`,
    property_version: 1,
    binding_id: `${expected.deviceId}-${axis}`,
    binding_revision: '1',
    event_at_ms: expected.record.timestampMs,
    event_time_basis: 'device_recorded',
  }))
    assert.equal(change[key], value);
  assert.deepEqual(change.value, {
    kind: 'integer',
    value: String(expected.record[`${axis}E7`]),
  });
  for (const [key, value] of Object.entries({
    device_asset_id: expected.deviceId,
    endpoint_id: 'main',
    signal_id: `gps.${axis}_e7`,
    protocol_package_id: 'vendor.teltonika',
    protocol_package_version: 'simulator-demo-1',
    device_recorded_at_ms: expected.record.timestampMs,
  }))
    assert.equal(change.source[key], value);
  assert(typeof change.interpretation === 'string' && change.interpretation.length > 0);
  assert(
    typeof change.source.message_id === 'string' && change.source.message_id.length > 0,
  );
  assert.deepEqual(history.changes, [change]);
  assert.equal(history.next_after, null);
  assert.deepEqual(provenance, change);
}

/** A successful shell step cannot replace any browser, rejection, retention or cleanup witness. */
export function completeSimulator(base, before, after, rejected) {
  for (const check of [
    'real-producer-ack',
    'owned-reset',
    'unrelated-resources-retained',
  ])
    assert(base.checks.includes(check));
  for (const evidence of [before, after]) {
    assert.deepEqual(Object.keys(evidence).sort(), ['accepted', 'checks']);
    assert.deepEqual(evidence.checks, [
      'durable-projection',
      'selected-map-point',
      'matching-inspect',
    ]);
    assert(/^[1-9][0-9]*$/.test(evidence.accepted));
    assert(BigInt(evidence.accepted) <= 2n);
  }
  assert.equal(rejected, true);
  assert.equal(after.accepted, before.accepted);
  return [
    'wire-ack',
    'durable-projection',
    'selected-map-point',
    'matching-inspect',
    'wrong-identity-rejected',
    'accepted-data-unchanged',
    'owned-cleanup',
  ];
}

/** Decimal display scale may vary; compare the exact E7 integer without rounding. */
export function verifyMapCoordinates(text, record) {
  assert(typeof text === 'string' && text.length < 128);
  const pair = /^(-?[0-9]+(?:\.[0-9]+)?),\s*(-?[0-9]+(?:\.[0-9]+)?)$/u.exec(
    text.trim(),
  );
  assert(pair);
  const scaled = (value) => {
    const [whole, fraction = ''] = value.split('.');
    assert(/^0*$/u.test(fraction.slice(7)));
    return (
      (value.startsWith('-') ? -1n : 1n) *
      (BigInt(whole.replace('-', '')) * 10000000n +
        BigInt(fraction.padEnd(7, '0').slice(0, 7)))
    );
  };
  assert.equal(scaled(pair[1]), BigInt(record.latitudeE7));
  assert.equal(scaled(pair[2]), BigInt(record.longitudeE7));
}
