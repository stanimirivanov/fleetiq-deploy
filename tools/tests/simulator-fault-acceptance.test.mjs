import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  completeFaults,
  verifyFaultHistory,
  verifyFaultReceipt,
  verifyFleet,
} from '../../local/demo/fault-acceptance.mjs';
import { initializeDemo } from '../demo.mjs';

test('fault receipts reject missing/extra/private fields and success on deliberately invalid traffic', () => {
  const value = {
    status: 'faults-completed',
    packets: 9,
    acknowledged: 4,
    denied: 3,
    disconnected: 2,
  };
  assert.doesNotThrow(() => verifyFaultReceipt(value, false));
  for (const v of [
    { ...value, denied: 2 },
    { ...value, acknowledged: 5 },
    { ...value, identity: 'private-canary' },
    {},
  ])
    assert.throws(() => verifyFaultReceipt(v, false));
  assert.doesNotThrow(() =>
    verifyFaultReceipt(
      {
        status: 'faults-completed',
        packets: 12,
        acknowledged: 0,
        denied: 0,
        disconnected: 12,
      },
      true,
    ),
  );
});
function fleet() {
  return {
    status: 'fleet-completed',
    metrics: {
      capturedRecords: 6,
      simulatedLossRecords: 0,
      attempts: 6,
      retryAttempts: 0,
      possibleDuplicateRecords: 0,
      acknowledgedRecords: 6,
      overflows: 0,
      queuedRecords: 0,
      queuedBytes: 0,
      peakQueuedRecords: 6,
      peakQueuedBytes: 1024,
      peakSessions: 2,
      sessionFailures: {
        'login-refused': 0,
        'login-timeout': 0,
        'ack-timeout': 0,
        'ack-count': 0,
        'unexpected-reply': 0,
        'connection-closed': 0,
      },
      ackLatencyMs: {
        upperBounds: [10, 50, 250, 1000, 5000, 60000],
        counts: [0, 0, 6, 0, 0, 0, 0],
      },
      peakRssBytes: 50000000,
      sampledPeakOpenFds: 24,
      cpuUserUs: 100000,
      cpuSystemUs: 10000,
      exhaustedRecords: 0,
      undeliveredRecords: 0,
    },
  };
}
test('fleet acceptance requires real resource observations, two slots and complete bounded queues', () => {
  assert.doesNotThrow(() => verifyFleet(fleet(), 6, 2));
  for (const [key, value] of Object.entries({
    acknowledgedRecords: 5,
    peakSessions: 1,
    peakQueuedBytes: 65537,
    peakRssBytes: 268435457,
    sampledPeakOpenFds: 65,
    cpuUserUs: 5000001,
    queuedRecords: 1,
    privateLabel: 1,
  })) {
    const f = fleet();
    f.metrics[key] = value;
    assert.throws(() => verifyFleet(f, 6, 2));
  }
  const f = fleet();
  delete f.metrics.cpuSystemUs;
  assert.throws(() => verifyFleet(f, 6, 2));
});
test('no-output control rejects any forbidden timestamp before trusting source evidence', () => {
  const expected = { required: ['1'], allowed: ['1', '4'] };
  assert.throws(() =>
    verifyFaultHistory({ changes: [{ event_at_ms: '3' }] }, expected, 'latitude'),
  );
  assert.throws(() => verifyFaultHistory({ changes: [] }, expected, 'latitude'));
});
test('fault acceptance refuses missing neighbor, diagnostics, history or owned cleanup', () => {
  const evidence = {
    fleet: true,
    faults: true,
    storm: true,
    neighbor: true,
    diagnostics: true,
    history: true,
  };
  const base = { checks: ['owned-reset', 'unrelated-resources-retained'] };
  assert.equal(completeFaults(base, evidence).length, 4);
  for (const key of Object.keys(evidence))
    assert.throws(() => completeFaults(base, { ...evidence, [key]: false }));
  assert.throws(() => completeFaults({ checks: [] }, evidence));
});
test('qualification device count is rejected before any installation mutation', () => {
  assert.throws(
    () => initializeDemo('unused', 'default', '/missing', 3),
    /Invalid qualification device count/,
  );
});

test('live diagnostics require decoded persisted turns and reject raw fields or incomplete coverage', async () => {
  const { verifyFaultDiagnostics } = await import(
    '../../local/demo/fault-acceptance.mjs'
  );
  const value = {
    observed_at_ms: 1,
    connection_liveness: 'not_observed',
    worker_liveness: 'not_observed',
    coverage: {
      frame_limit: 64,
      output_limit_per_frame: 64,
      source_limit: 128,
      frames_truncated: false,
      observations_truncated: false,
      sources_truncated: false,
    },
    frames: [
      {
        message_id: 'opaque',
        package_id: 'vendor.teltonika',
        package_version: 'simulator-demo-1',
        received_at_ms: 1,
        processing: 'decoded',
        observation_count: 0,
      },
    ],
    sources: [],
  };
  assert.equal(verifyFaultDiagnostics(value), 0);
  for (const processing of ['poisoned', 'accepted', 'queued', 'leased', 'expired'])
    assert.throws(() =>
      verifyFaultDiagnostics({
        ...value,
        frames: [{ ...value.frames[0], processing }],
      }),
    );
  assert.throws(() =>
    verifyFaultDiagnostics({
      ...value,
      frames: [{ ...value.frames[0], observation_count: null }],
    }),
  );
  assert.throws(() =>
    verifyFaultDiagnostics({
      ...value,
      coverage: { ...value.coverage, private: 'canary' },
    }),
  );
  assert.throws(() =>
    verifyFaultDiagnostics({ ...value, sources: [{ payload: 'canary' }] }),
  );
  assert.throws(() => verifyFaultDiagnostics({ ...value, frames: [] }));
});

test('healthy diagnostic snapshots can prove overflow made no contact on either device', async () => {
  const { verifyFaultDiagnostics } = await import(
    '../../local/demo/fault-acceptance.mjs'
  );
  const value = {
    observed_at_ms: 1,
    connection_liveness: 'not_observed',
    worker_liveness: 'not_observed',
    coverage: {
      frame_limit: 64,
      output_limit_per_frame: 64,
      source_limit: 128,
      frames_truncated: false,
      observations_truncated: false,
      sources_truncated: false,
    },
    frames: [
      {
        message_id: 'opaque',
        package_id: 'vendor.teltonika',
        package_version: 'simulator-demo-1',
        received_at_ms: 1,
        processing: 'decoded',
        observation_count: 2,
      },
    ],
    sources: [],
  };
  assert.equal(verifyFaultDiagnostics(value), 1);
});

test('native fault failures project only fixed categories and suppress arbitrary stderr', async () => {
  const { faultFailureCategory } = await import(
    '../../local/demo/fault-acceptance.mjs'
  );
  assert.equal(faultFailureCategory('invalid-run-config\n'), 'invalid-run-config');
  assert.equal(faultFailureCategory('private-identity-canary'), 'unclassified');
});

test('durable live fault deltas allow only known handshakes and optional valid after-write acceptance', async () => {
  const { verifyFaultDelta } = await import('../../local/demo/fault-acceptance.mjs');
  const before = { frames: 10, decodedFrames: 4 };
  const expected = { handshakes: 8, minDecoded: 4, maxDecoded: 5 };
  verifyFaultDelta(before, { frames: 22, decodedFrames: 8 }, expected);
  verifyFaultDelta(before, { frames: 23, decodedFrames: 9 }, expected);
  for (const after of [
    { frames: 21, decodedFrames: 8 },
    { frames: 24, decodedFrames: 8 },
    { frames: 22, decodedFrames: 9 },
    { frames: 21, decodedFrames: 7 },
    { frames: 24, decodedFrames: 10 },
  ])
    assert.throws(() => verifyFaultDelta(before, after, expected));
  verifyFaultDelta(
    before,
    { frames: 22, decodedFrames: 4 },
    { handshakes: 12, minDecoded: 0, maxDecoded: 0 },
  );
  assert.throws(() =>
    verifyFaultDelta(
      before,
      { frames: 23, decodedFrames: 5 },
      { handshakes: 12, minDecoded: 0, maxDecoded: 0 },
    ),
  );
});
