import { randomUUID } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { root } from './process.mjs';
import { catalogue } from './verification-catalogue.mjs';

/** A successful shell step alone cannot attest that the verifier actually ran. */
export function completedReceipt(receipt, group, head) {
  return (
    Object.hasOwn(catalogue, group) &&
    receipt.schemaVersion === 1 &&
    receipt.group === group &&
    receipt.outcome === 'passed' &&
    /^[a-f0-9]{40,64}$/u.test(receipt.head ?? '') &&
    receipt.head === head &&
    /^[a-f0-9]{64}$/u.test(receipt.sourceBefore ?? '') &&
    receipt.sourceBefore === receipt.sourceAfter &&
    Array.isArray(receipt.checks) &&
    receipt.checks.length === catalogue[group].length &&
    catalogue[group].every(
      (name, index) =>
        receipt.checks[index]?.name === name &&
        receipt.checks[index]?.outcome === 'passed',
    )
  );
}

/** Always write metadata-only job evidence, even when prerequisites prevented verification. */
export function recordJob(
  group,
  status,
  head,
  directory = resolve(root, '.verification'),
) {
  if (!Object.hasOwn(catalogue, group))
    throw new Error('Unknown CI verification group');
  mkdirSync(directory, { recursive: true });
  const receipts = readdirSync(directory).filter((file) =>
    new RegExp(`^${group}-[a-f0-9-]+\\.json$`, 'u').test(file),
  );
  const verified = receipts.some((file) => {
    try {
      return completedReceipt(
        JSON.parse(readFileSync(resolve(directory, file), 'utf8')),
        group,
        head,
      );
    } catch {
      return false;
    }
  });
  const passed = status === 'success' && verified;
  const summary = {
    schemaVersion: 1,
    group: `ci-${group}`,
    outcome: passed ? 'passed' : 'incomplete',
    jobStatus: ['success', 'failure', 'cancelled'].includes(status)
      ? status
      : 'unknown',
    verification: verified ? 'passed' : 'not-completed',
    finished: new Date().toISOString(),
  };
  writeFileSync(
    resolve(directory, `ci-${group}-${randomUUID()}.json`),
    `${JSON.stringify(summary, null, 2)}\n`,
  );
  return passed;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (
    !recordJob(process.argv[2], process.env.FLEETIQ_CI_STATUS, process.env.GITHUB_SHA)
  ) {
    console.error(
      'CI verification incomplete: inspect earlier prerequisite/check failures; no acceptance pass.',
    );
    process.exitCode = 1;
  }
}
