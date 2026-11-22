import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstatSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { root, run } from '../process.mjs';
import { qualifyMinimalNetwork } from './minimal-demo-probe.mjs';

function privateFile(value, maxBytes) {
  assert(
    typeof value === 'string' && value === resolve(value),
    'Select an absolute private path',
  );
  const stat = lstatSync(value);
  assert(
    stat.isFile() &&
      realpathSync(value) === value &&
      stat.nlink === 1 &&
      stat.uid === process.getuid() &&
      (stat.mode & 0o077) === 0 &&
      stat.size > 0 &&
      stat.size <= maxBytes,
    'Use a bounded owned private file',
  );
  return value;
}

function sourceIdentity() {
  const hash = createHash('sha256');
  for (const file of [
    'minimal-demo-fixtures.mjs',
    'minimal-demo-network.mjs',
    'minimal-demo-probe-cli.mjs',
    'minimal-demo-probe.mjs',
    'minimal-demo-render.mjs',
    'tools.lock.json',
  ]) {
    hash.update(file);
    hash.update('\0');
    hash.update(readFileSync(join(root, 'tools/manifests', file)));
    hash.update('\0');
  }
  return {
    commit: run('git', ['rev-parse', 'HEAD'], { timeout: 4_000 }),
    fingerprint: `sha256:${hash.digest('hex')}`,
  };
}

function main() {
  const { values } = parseArgs({
    options: {
      execute: { type: 'boolean' },
      'confirm-target': { type: 'string' },
      kubeconfig: { type: 'string' },
      request: { type: 'string' },
    },
  });
  assert(
    values.execute && values['confirm-target'],
    'Installed probe needs explicit execution and target confirmation',
  );
  const request = JSON.parse(
    readFileSync(privateFile(values.request, 32 * 1024), 'utf8'),
  );
  assert(
    typeof request.target?.name === 'string' &&
      request.target.name === values['confirm-target'],
    'Target confirmation differs',
  );
  const kubeconfig = privateFile(values.kubeconfig, 1024 * 1024);
  const source = sourceIdentity();
  const cache = mkdtempSync(join(tmpdir(), 'fleetiq-minimal-network-kube-'));
  const started = performance.now();
  try {
    const kube = (args) => {
      const remaining = Math.floor(300_000 - (performance.now() - started));
      if (remaining <= 0) throw new Error('Probe deadline expired');
      return run(
        'kubectl',
        [
          '--kubeconfig',
          kubeconfig,
          '--context',
          `kind-${request.target.name}`,
          '--cache-dir',
          cache,
          '--request-timeout=7s',
          ...args,
        ],
        { timeout: Math.min(8_000, remaining) },
      );
    };
    const receipt = qualifyMinimalNetwork(request, { kube, source });
    try {
      assert.deepEqual(sourceIdentity(), source);
    } catch {
      receipt.outcome = 'failed';
      receipt.reason = 'source identity changed or became unavailable during probe';
    }
    receipt.elapsedMilliseconds = Math.round(performance.now() - started);
    console.log(JSON.stringify(receipt, null, 2));
    if (receipt.outcome !== 'passed') process.exitCode = 1;
  } finally {
    rmSync(cache, { recursive: true, force: true });
  }
}

try {
  main();
} catch {
  console.error(
    'Minimal-demo network probe did not execute or produce a receipt. Verify explicit target confirmation, private inputs and pinned source.',
  );
  process.exitCode = 1;
}
