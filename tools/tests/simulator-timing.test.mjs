import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  completeTiming,
  establishedSocket,
  timingScenario,
  verifyTiming,
} from '../simulator-timing-evidence.mjs';

const base = {
  deviceId: 'fixture',
  target: { transport: 'tcp', host: 'tcp-ingestion', port: 55027 },
  record: {
    timestampMs: '1800000000000',
    latitudeE7: 427000000,
    longitudeE7: 233000000,
  },
};
function samples(mode) {
  const end = mode === 'idle' ? 40000 : 320000;
  return Array.from({ length: end / 1000 + 1 }, (_, i) => ({
    atMs: i * 1000,
    socket:
      mode === 'idle'
        ? i < 16
          ? 'first'
          : i < 21
            ? null
            : i < 36
              ? 'second'
              : null
        : i < 301
          ? 'first'
          : 'second',
  }));
}
test('timing scenarios freeze real source captures without heartbeat or accelerated clocks', () => {
  for (const [mode, count, interval] of [
    ['idle', 3, 20000],
    ['lifetime', 33, 10000],
  ]) {
    const fixture = timingScenario(base, mode);
    assert.equal(fixture.config.playback.timingProfile, 'real-time');
    assert.equal(fixture.config.playback.intervalMs, interval);
    assert.equal(fixture.config.playback.sendIntervalMs, 1000);
    assert.deepEqual(fixture.config.playback.on, []);
    assert.equal(fixture.timestamps.length, count);
    assert.equal(
      BigInt(fixture.timestamps.at(-1)) - BigInt(fixture.timestamps[0]),
      BigInt((count - 1) * interval),
    );
    assert(fixture.config.retry.totalDeadlineMs > (count - 1) * interval);
  }
  assert.throws(() => timingScenario(base, 'shortened'));
});
test('real timing acceptance rejects short runs, early reconnects, missing observations and missing ACKs', () => {
  for (const mode of ['idle', 'lifetime']) {
    const evidence = {
      samples: samples(mode),
      elapsedMs: mode === 'idle' ? 40500 : 320500,
      acknowledged: mode === 'idle' ? 3 : 33,
    };
    assert.equal(verifyTiming(mode, evidence).connections, 2);
    assert.throws(() => verifyTiming(mode, { ...evidence, elapsedMs: 14000 }));
    assert.throws(() =>
      verifyTiming(mode, { ...evidence, acknowledged: evidence.acknowledged - 1 }),
    );
    assert.throws(() =>
      verifyTiming(mode, {
        ...evidence,
        samples: evidence.samples.filter((_, i) => i % 10 === 0),
      }),
    );
    assert.throws(() =>
      verifyTiming(mode, {
        ...evidence,
        samples: evidence.samples.map((s) => ({ ...s, socket: 'first' })),
      }),
    );
    const premature = structuredClone(evidence);
    premature.samples[10].socket = 'early';
    assert.throws(() => verifyTiming(mode, premature));
  }
});
test('socket admission extracts only one established connection to the exact ingestion port', () => {
  const line = (state, inode, port = 'D6F3') =>
    `0: 0100007F:1234 0200007F:${port} ${state} 0:0 00:0 0 1000 0 ${inode}`;
  assert.equal(establishedSocket(line('01', '123')), '0100007F:1234/123');
  assert.equal(establishedSocket(line('08', '123')), null);
  assert.equal(establishedSocket(line('01', '123', '0050')), null);
  assert.throws(() => establishedSocket(`${line('01', '123')}\n${line('01', '456')}`));
});
test('timing evidence cannot pass before installed history and owned lifecycle cleanup', () => {
  const evidence = {
    idle: { elapsedMs: 40500, connections: 2 },
    lifetime: { elapsedMs: 320500, connections: 2 },
    history: true,
  };
  const base = {
    checks: ['owned-reset', 'unrelated-resources-retained', 'retained-restart'],
  };
  assert.equal(completeTiming(base, evidence).length, 2);
  assert.throws(() => completeTiming({ checks: [] }, evidence));
  assert.throws(() => completeTiming(base, { ...evidence, history: false }));
  assert.throws(() => completeTiming(base, { ...evidence, lifetime: undefined }));
});
