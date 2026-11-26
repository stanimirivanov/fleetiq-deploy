import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const fingerprint = 'a'.repeat(64);
const turn = {
  databaseOid: 17253,
  turn: '1'.repeat(64),
  fingerprint,
  accepted: true,
  decoded: false,
  sequence: 2,
  checkpoint: 1,
  status: 'pending',
  generation: 1,
  attempts: 1,
  leaseUntilMs: 45_000,
  paused: false,
  policyOne: true,
};
const foreign = {
  ...turn,
  turn: '2'.repeat(64),
  fingerprint: 'b'.repeat(64),
  leaseUntilMs: 5_000,
};
const qualified = [
  { ...turn, sampledAtMs: 15_001 },
  { ...turn, sampledAtMs: 17_000 },
  { ...turn, sampledAtMs: 45_502, generation: 2, attempts: 2, leaseUntilMs: 75_501 },
  { ...turn, sampledAtMs: 47_500, generation: 2, attempts: 2, leaseUntilMs: 75_501 },
  {
    ...turn,
    sampledAtMs: 75_753,
    generation: 3,
    attempts: 3,
    leaseUntilMs: 105_752,
    status: 'completed',
    decoded: true,
    checkpoint: 2,
  },
  { ...foreign, sampledAtMs: 20_000 },
  { ...foreign, sampledAtMs: 75_754 },
];

function verify(samples) {
  const result = spawnSync(
    'jq',
    [
      '-se',
      '--arg',
      'executionSha',
      fingerprint,
      '-f',
      'operations/minimal-demo-workers/qualify-replay.jq',
    ],
    {
      encoding: 'utf8',
      input: samples.map((sample) => JSON.stringify(sample)).join('\n'),
      timeout: 5_000,
    },
  );
  assert.ifError(result.error);
  return result;
}

test('the replay receipt requires durable interruption, exact progress and incompatible isolation', () => {
  const good = verify(qualified);
  assert.equal(good.status, 0, good.stderr);
  assert.equal(JSON.parse(good.stdout).outcome, 'passed');
  for (const [index, update, reason] of [
    [1, { databaseOid: 1277 }, /ingestion interruption/u],
    [2, { generation: 1 }, /replay attempt/u],
    [3, { leaseUntilMs: 12_000 }, /replay attempt/u],
    [4, { decoded: false }, /advance the exact checkpoint/u],
    [4, { sampledAtMs: 74_000 }, /lease expiry/u],
    [5, { paused: true }, /incompatible/u],
    [6, { generation: 2 }, /incompatible/u],
  ]) {
    const changed = structuredClone(qualified);
    Object.assign(changed[index], update);
    const result = verify(changed);
    assert.equal(result.status, 5);
    assert.match(result.stderr, reason);
  }
});
