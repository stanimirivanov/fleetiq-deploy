import assert from 'node:assert/strict';
import { recoveryScenario } from '../local/demo/recovery.mjs';

/** Real periodic source captures straddle production deadlines; no synthetic keepalive captures are added. */
export function timingScenario(base, mode) {
  assert(['idle', 'lifetime'].includes(mode));
  const interval = mode === 'idle' ? 20000 : 10000;
  const duration = mode === 'idle' ? 40000 : 320000;
  const offset = mode === 'idle' ? 4000000n : 5000000n;
  const fixture = recoveryScenario(base);
  const start = BigInt(base.record.timestampMs) - offset;
  assert(start >= 0n);
  fixture.timestamps = Array.from({ length: duration / interval + 1 }, (_, i) =>
    String(start + BigInt(i * interval)),
  );
  Object.assign(fixture.config.retry, {
    maxAttempts: 3,
    totalDeadlineMs: duration + 60000,
  });
  Object.assign(fixture.config.playback, {
    timingProfile: 'real-time',
    intervalMs: interval,
    // The first send is at this tick; empty ticks never open a socket or invent captures.
    sendIntervalMs: 1000,
    offlineUntilMs: 0,
  });
  fixture.scenario.startTimeMs = String(start);
  fixture.scenario.seed = `installed-${mode}-recovery-v1`;
  fixture.scenario.phases[0].durationMs = duration;
  return fixture;
}

/** Read only the producer namespace's established ingestion socket; multiple connections fail closed. */
export function establishedSocket(text) {
  const sockets = text
    .split('\n')
    .map((line) => line.trim().split(/\s+/u))
    .filter((row) => row[2]?.endsWith(':D6F3') && row[3] === '01');
  assert(sockets.length <= 1);
  if (sockets.length === 0) return null;
  assert(/^[0-9]+$/u.test(sockets[0][9]) && sockets[0][9] !== '0');
  return `${sockets[0][1]}/${sockets[0][9]}`;
}

/** Elapsed time alone is insufficient: reject early churn, unseen boundaries and accelerated playback. */
export function verifyTiming(mode, { samples, elapsedMs, acknowledged }) {
  assert(['idle', 'lifetime'].includes(mode));
  const duration = mode === 'idle' ? 40000 : 320000;
  assert(
    Number.isFinite(elapsedMs) &&
      elapsedMs >= duration &&
      elapsedMs <= duration + 60000,
  );
  assert.equal(acknowledged, mode === 'idle' ? 3 : 33);
  assert(Array.isArray(samples) && samples.length > 2 && samples.length < 500);
  let previous = 0;
  for (const sample of samples) {
    assert(
      Number.isFinite(sample.atMs) &&
        sample.atMs >= previous &&
        sample.atMs - previous <= 5000 &&
        sample.atMs <= elapsedMs,
    );
    assert(
      sample.socket === null ||
        (typeof sample.socket === 'string' && sample.socket.length > 0),
    );
    previous = sample.atMs;
  }
  assert(elapsedMs - previous <= 5000);
  const first = samples.find((sample) => sample.socket !== null);
  assert(first && first.atMs <= 5000);
  const retired = samples.find(
    (sample) => sample.atMs > first.atMs && sample.socket !== first.socket,
  );
  assert(retired);
  const replacement = samples.find(
    (sample) =>
      sample.atMs >= retired.atMs &&
      sample.socket !== null &&
      sample.socket !== first.socket,
  );
  assert(replacement);
  const connections = new Set(
    samples.filter((sample) => sample.socket !== null).map((sample) => sample.socket),
  ).size;
  assert(connections >= 2 && connections <= (mode === 'idle' ? 3 : 2));
  if (mode === 'idle') {
    assert(retired.socket === null && retired.atMs > 15000 && retired.atMs < 20000);
    assert(replacement.atMs >= 20000 && replacement.atMs <= 30000);
  } else {
    assert(retired.atMs >= 295000 && retired.atMs <= 310000);
    const prior = samples.filter((sample) => sample.atMs < retired.atMs).at(-1);
    assert(prior.atMs - first.atMs >= 290000);
    assert(replacement.atMs > 300000 && replacement.atMs <= 315000);
  }
  assert(
    samples
      .filter((sample) => sample.atMs > retired.atMs)
      .every((sample) => sample.socket !== first.socket),
  );
  return { elapsedMs, connections };
}

/** Parent-owned reset and unrelated-resource survival remain mandatory after both real-time cases. */
export function completeTiming(base, evidence) {
  for (const check of [
    'retained-restart',
    'owned-reset',
    'unrelated-resources-retained',
  ])
    assert(base.checks.includes(check));
  assert.equal(evidence.history, true);
  for (const [mode, minimum] of [
    ['idle', 40000],
    ['lifetime', 320000],
  ]) {
    assert(evidence[mode]?.elapsedMs >= minimum);
    assert(evidence[mode]?.connections >= 2);
  }
  return ['real-idle-recovery', 'real-lifetime-recovery'];
}
