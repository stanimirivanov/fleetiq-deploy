import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

function invoke(t, { version, failCleanup = false }) {
  const directory = mkdtempSync(join(tmpdir(), 'fleetiq-probe-cli-test-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const request = join(directory, 'request');
  const kubeconfig = join(directory, 'kubeconfig');
  const calls = join(directory, 'calls');
  const patch = join(directory, 'cleanup-test.mjs');
  const role = (name, index) => [
    name,
    {
      name: `network-probe-${name}`,
      podUid: `00000000-0000-0000-0000-00000000000${index}`,
      probeImage: `registry.invalid/probe@sha256:${'a'.repeat(64)}`,
      imageId: `sha256:${'b'.repeat(64)}`,
    },
  ];
  writeFileSync(
    request,
    JSON.stringify({
      selection: {
        consumer: 'fleetiq',
        simulatorAttempt: 'demo-launch-0123456789abcdef01234567',
        issuerAddress: '172.18.0.9',
      },
      target: {
        name: 'fleetiq-local',
        workerUid: '00000000-0000-0000-0000-000000000000',
        namespaceUids: Object.fromEntries(
          ['apps', 'data', 'foreign', 'support', 'system'].map((name) => [
            name,
            '00000000-0000-0000-0000-000000000000',
          ]),
        ),
      },
      candidate: `sha256:${'c'.repeat(64)}`,
      phase: 'ingestion',
      probes: Object.fromEntries(
        ['simulator', 'other', 'foreign', 'foreign-listener'].map(role),
      ),
    }),
    { mode: 0o600 },
  );
  writeFileSync(kubeconfig, '{}', { mode: 0o600 });
  const kubectl = join(directory, 'kubectl');
  writeFileSync(
    kubectl,
    `#!${process.execPath}
const { appendFileSync } = require('node:fs');
const args = process.argv.slice(2);
appendFileSync(${JSON.stringify(calls)}, JSON.stringify(args) + '\\n');
console.log(JSON.stringify(args[0] === 'version' ? { clientVersion: { gitVersion: ${JSON.stringify(version)} } } : {}));
`,
  );
  chmodSync(kubectl, 0o700);
  writeFileSync(
    patch,
    `
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
const remove = fs.rmSync;
fs.rmSync = (path, options) => {
  remove(path, options);
  if (String(path).includes('fleetiq-minimal-network-kube-'))
    throw new Error('private deletion diagnostic');
};
syncBuiltinESMExports();
`,
  );
  const result = spawnSync(
    process.execPath,
    [
      ...(failCleanup ? ['--import', patch] : []),
      'tools/manifests/minimal-demo-probe-cli.mjs',
      '--execute',
      '--confirm-target',
      'fleetiq-local',
      '--request',
      request,
      '--kubeconfig',
      kubeconfig,
    ],
    {
      env: { ...process.env, PATH: `${directory}:${process.env.PATH}` },
      encoding: 'utf8',
      timeout: 10000,
    },
  );
  return {
    ...result,
    calls: (() => {
      try {
        return readFileSync(calls, 'utf8').trim().split('\n').map(JSON.parse);
      } catch {
        return [];
      }
    })(),
  };
}

test('the CLI rejects an unpinned kubectl client before any configured command', (t) => {
  const result = invoke(t, { version: 'v1.35.1' });
  assert.equal(result.status, 1);
  assert.deepEqual(
    result.calls,
    [['version', '--client', '-o', 'json']],
    result.stderr,
  );
  assert.match(result.stderr, /pinned Kubernetes client/);
});

test('a kubectl cache cleanup failure is recorded and keeps diagnostics private', (t) => {
  const result = invoke(t, { version: 'v1.35.0', failCleanup: true });
  assert.equal(result.status, 1);
  const receipt = JSON.parse(result.stdout);
  assert.equal(receipt.kubectlVersion, 'v1.35.0');
  assert.equal(receipt.outcome, 'failed');
  assert.deepEqual(receipt.checks.at(-1), {
    name: 'private-cache-cleanup',
    outcome: 'failed',
  });
  assert.match(receipt.reason, /cache cleanup failed/);
  assert.doesNotMatch(result.stdout + result.stderr, /private deletion diagnostic/);
});
