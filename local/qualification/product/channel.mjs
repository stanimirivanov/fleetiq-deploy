import assert from 'node:assert/strict';
import {
  existsSync,
  lstatSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { requiredChecks } from './contract.mjs';
export const phases = [
  'setup-ready',
  'workers-started',
  'initial-visible',
  'restart-complete',
  'complete',
  'failed',
];
/** Public control metadata only; separate from cookies, secrets, URLs and bodies. */
export function writePhase(directory, phase, checks = []) {
  assert(phases.includes(phase));
  assert(checks.length <= 32 && checks.every((v) => requiredChecks.includes(v)));
  const path = `${directory}/${phase}.json`;
  assert(!existsSync(path), 'Phase cannot be overwritten');
  const staging = `${path}.tmp`;
  writeFileSync(staging, JSON.stringify({ schemaVersion: 1, phase, checks }), {
    flag: 'wx',
    mode: 0o644,
  });
  renameSync(staging, path);
}
export function readPhase(directory, phase) {
  assert(phases.includes(phase));
  const path = `${directory}/${phase}.json`;
  if (!existsSync(path)) return null;
  const stat = lstatSync(path);
  assert(
    stat.isFile() && !stat.isSymbolicLink() && stat.size < 8192,
    'Invalid phase file',
  );
  const value = JSON.parse(readFileSync(path, 'utf8'));
  assert.deepEqual(Object.keys(value).sort(), ['checks', 'phase', 'schemaVersion']);
  assert(
    value.schemaVersion === 1 &&
      value.phase === phase &&
      Array.isArray(value.checks) &&
      value.checks.length <= 32 &&
      value.checks.every((v) => requiredChecks.includes(v)),
    'Invalid public evidence',
  );
  return value;
}
export async function waitPhase(directory, phase, seconds = 240) {
  const until = Date.now() + seconds * 1000;
  do {
    if (readPhase(directory, 'failed'))
      throw new Error(
        `Installed scenario failed before ${phase}; no browser acceptance`,
      );
    const value = readPhase(directory, phase);
    if (value) return value;
    await delay(1000);
  } while (Date.now() < until);
  throw new Error(
    `Installed scenario timed out before ${phase}; no browser acceptance`,
  );
}
