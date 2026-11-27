import assert from 'node:assert/strict';
import test from 'node:test';
import { manifestTools } from '../manifests/toolchain.mjs';
import { CommandFailure } from '../process.mjs';

const { jq } = manifestTools();

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
  return jq(
    [
      '-se',
      '--arg',
      'executionSha',
      fingerprint,
      '-f',
      'operations/minimal-demo-workers/qualify-replay.jq',
    ],
    {
      input: samples.map((sample) => JSON.stringify(sample)).join('\n'),
      timeout: 5_000,
    },
  );
}

test('the replay receipt requires durable interruption, exact progress and incompatible isolation', () => {
  assert.equal(JSON.parse(verify(qualified)).outcome, 'passed');
  for (const [index, update, reason] of [
    [1, { databaseOid: 1277 }, 'database changed at ingestion interruption'],
    [2, { generation: 1 }, 'replay generation did not advance'],
    [
      2,
      { sampledAtMs: 44_999 },
      'first replay claim observed before ingestion lease expiry',
    ],
    [3, { leaseUntilMs: 12_000 }, 'lease changed across replay interruption'],
    [4, { decoded: false }, 'completed turn is missing a decoded marker'],
    [4, { sampledAtMs: 74_000 }, 'completion observed before replay lease expiry'],
    [5, { paused: true }, 'incompatible turn was ineligible before replay'],
    [6, { generation: 2 }, 'incompatible turn changed during replay'],
  ]) {
    const changed = structuredClone(qualified);
    Object.assign(changed[index], update);
    assert.throws(
      () => verify(changed),
      (error) => error instanceof CommandFailure && error.exitCode === 5,
      reason,
    );
  }
});

test('sampling after expiry cannot hide a replacement claim made before expiry', () => {
  const changed = structuredClone(qualified);
  // Both samples of generation 2 retain the same deadline, but it was
  // minted 1 ms before the ingestion lease expired.
  changed[2].leaseUntilMs = 74_999;
  changed[3].leaseUntilMs = 74_999;
  assert.throws(
    () => verify(changed),
    (error) => error instanceof CommandFailure && error.exitCode === 5,
  );
});
