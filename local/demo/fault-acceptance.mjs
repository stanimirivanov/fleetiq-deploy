import assert from 'node:assert/strict';
import { verifyRecoveryHistory } from './recovery.mjs';

/** Closed receipts cannot turn extra/private labels or a positive invalid-frame ACK into acceptance. */
export function verifyFaultReceipt(value, storm) {
  assert.deepEqual(value, {
    status: 'faults-completed',
    packets: storm ? 12 : 9,
    acknowledged: storm ? 0 : 4,
    denied: storm ? 0 : 3,
    disconnected: storm ? 12 : 2,
  });
}

/** Enforce the declared producer workload envelope, not a server capacity or unsampled FD claim. */
export function verifyFleet(value, records, slots) {
  assert.deepEqual(Object.keys(value).sort(), ['metrics', 'status']);
  assert.equal(value.status, 'fleet-completed');
  const m = value.metrics;
  const keys =
    'capturedRecords simulatedLossRecords attempts retryAttempts possibleDuplicateRecords acknowledgedRecords overflows queuedRecords queuedBytes peakQueuedRecords peakQueuedBytes peakSessions peakRssBytes sampledPeakOpenFds cpuUserUs cpuSystemUs exhaustedRecords undeliveredRecords'.split(
      ' ',
    );
  assert.deepEqual(
    Object.keys(m).sort(),
    [...keys, 'sessionFailures', 'ackLatencyMs'].sort(),
  );
  for (const key of keys) assert(Number.isSafeInteger(m[key]) && m[key] >= 0);
  for (const key of [
    'simulatedLossRecords',
    'overflows',
    'queuedRecords',
    'queuedBytes',
    'exhaustedRecords',
    'undeliveredRecords',
  ])
    assert.equal(m[key], 0);
  for (const key of ['capturedRecords', 'acknowledgedRecords', 'peakQueuedRecords'])
    assert.equal(m[key], records);
  assert.equal(m.peakSessions, slots);
  assert(
    m.attempts >= records && m.attempts <= records * 3 && m.retryAttempts <= m.attempts,
  );
  assert(m.peakQueuedBytes > 0 && m.peakQueuedBytes <= 65536);
  assert(m.peakRssBytes > 0 && m.peakRssBytes <= 268435456);
  assert(m.sampledPeakOpenFds > 0 && m.sampledPeakOpenFds <= 64);
  assert(m.cpuUserUs + m.cpuSystemUs > 0 && m.cpuUserUs + m.cpuSystemUs <= 5000000);
  assert.deepEqual(
    Object.keys(m.sessionFailures).sort(),
    [
      'login-refused',
      'login-timeout',
      'ack-timeout',
      'ack-count',
      'unexpected-reply',
      'connection-closed',
    ].sort(),
  );
  for (const v of Object.values(m.sessionFailures))
    assert(Number.isSafeInteger(v) && v >= 0);
  assert.deepEqual(Object.keys(m.ackLatencyMs).sort(), ['counts', 'upperBounds']);
  assert.deepEqual(m.ackLatencyMs.upperBounds, [10, 50, 250, 1000, 5000, 60000]);
  assert.equal(m.ackLatencyMs.counts.length, 7);
  for (const v of m.ackLatencyMs.counts) assert(Number.isSafeInteger(v) && v >= 0);
  assert.equal(
    m.ackLatencyMs.counts.reduce((a, b) => a + b, 0),
    records,
  );
  return {
    peakQueuedBytes: m.peakQueuedBytes,
    peakRssBytes: m.peakRssBytes,
    sampledPeakOpenFds: m.sampledPeakOpenFds,
    cpuUserUs: m.cpuUserUs,
    cpuSystemUs: m.cpuSystemUs,
    peakSessions: m.peakSessions,
  };
}

/** Required valid timestamps must exist; optional ACK-uncertain output is permitted, forbidden fault output is not. */
export function verifyFaultHistory(history, expected, axis) {
  const times = [...new Set(history.changes.map((row) => row.event_at_ms))];
  assert(times.every((time) => expected.allowed.includes(time)));
  assert(expected.required.every((time) => times.includes(time)));
  return verifyRecoveryHistory(history, { ...expected, timestamps: times }, axis);
}

/** Persisted live turns must complete; rejected input never reaches enqueue and cannot create replay poison evidence. */
export function verifyFaultDiagnostics(value) {
  assert.deepEqual(
    Object.keys(value).sort(),
    [
      'observed_at_ms',
      'connection_liveness',
      'worker_liveness',
      'coverage',
      'frames',
      'sources',
    ].sort(),
  );
  assert.equal(value.connection_liveness, 'not_observed');
  assert.equal(value.worker_liveness, 'not_observed');
  assert.deepEqual(
    Object.keys(value.coverage).sort(),
    [
      'frame_limit',
      'output_limit_per_frame',
      'source_limit',
      'frames_truncated',
      'observations_truncated',
      'sources_truncated',
    ].sort(),
  );
  for (const source of value.sources) {
    assert.deepEqual(
      Object.keys(source).sort(),
      ['package_id', 'package_version', 'endpoint_id', 'signal_id'].sort(),
    );
    assert.equal(source.package_id, 'vendor.teltonika');
    assert.equal(source.package_version, 'simulator-demo-1');
    assert.equal(source.endpoint_id, 'main');
  }
  for (const key of ['frames_truncated', 'observations_truncated', 'sources_truncated'])
    assert.equal(value.coverage[key], false);
  assert(Array.isArray(value.frames) && value.frames.length > 0);
  for (const frame of value.frames) {
    assert.deepEqual(
      Object.keys(frame).sort(),
      [
        'message_id',
        'package_id',
        'package_version',
        'received_at_ms',
        'processing',
        'observation_count',
      ].sort(),
    );
    assert.equal(frame.package_id, 'vendor.teltonika');
    assert.equal(frame.package_version, 'simulator-demo-1');
    assert.equal(frame.processing, 'decoded');
    assert(
      Number.isSafeInteger(frame.observation_count) && frame.observation_count >= 0,
    );
  }
  return value.frames.filter((frame) => frame.observation_count > 0).length;
}

/** Fault results become acceptance only after independent neighbor/history/diagnostic checks and parent cleanup. */
export function completeFaults(base, evidence) {
  for (const name of ['owned-reset', 'unrelated-resources-retained'])
    assert(base.checks.includes(name));
  for (const name of ['fleet', 'faults', 'storm', 'neighbor', 'diagnostics', 'history'])
    assert.equal(evidence[name], true);
  return [
    'installed-fault-denial',
    'bounded-two-session-fleet',
    'healthy-neighbor-during-reconnects',
    'redacted-ingestion-diagnostics',
  ];
}

/** Untrusted stderr may identify only a reviewed simulator failure class; it never becomes evidence text. */
export function faultFailureCategory(text) {
  const category = text.trim();
  return [
    'invalid-run-config',
    'invalid-record',
    'invalid-faults',
    'invalid-input-file',
    'invalid-identity-file',
    'input-unavailable',
    'invalid-session',
    'login-refused',
    'ack-count',
    'unexpected-reply',
    'connection-closed',
    'login-timeout',
    'ack-timeout',
    'run-timeout',
    'disconnect-timeout',
    'fault-accepted',
    'internal-error',
    'invalid-json',
    'input-too-large',
  ].includes(category)
    ? category
    : 'unclassified';
}

/** Compare measured snapshots: only registered handshakes and permitted valid data turns may add durable frames. */
export function verifyFaultDelta(
  before,
  after,
  { handshakes, minDecoded, maxDecoded },
) {
  for (const value of [
    before.frames,
    before.decodedFrames,
    after.frames,
    after.decodedFrames,
    handshakes,
    minDecoded,
    maxDecoded,
  ])
    assert(Number.isSafeInteger(value) && value >= 0);
  assert(minDecoded <= maxDecoded);
  const decoded = after.decodedFrames - before.decodedFrames;
  assert(decoded >= minDecoded && decoded <= maxDecoded);
  assert.equal(after.frames - before.frames, handshakes + decoded);
}
