import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test from 'node:test';
import { capture } from '../process.mjs';
import {
  collectServiceDiagnostics,
  diagnosticSummary,
  failureCategory,
  serviceDiagnostic,
} from '../product/diagnostics.mjs';
import { browserBuildPolicy, inputs } from '../product/policy.mjs';

const project = 'product-0123456789abcdef',
  owner = '01234567-89ab-cdef-0123-456789abcdef';
const container = 'a'.repeat(64);
function resource(overrides = {}) {
  return {
    Config: {
      Labels: {
        'com.docker.compose.project': project,
        'com.fleetiq.deploy.owner': owner,
        'com.docker.compose.service': 'issuer',
      },
    },
    State: {
      Status: 'exited',
      ExitCode: 1,
      OOMKilled: false,
      Health: {
        Status: 'unhealthy',
        FailingStreak: 3,
        Log: [{ ExitCode: 1, Output: 'private health diagnostic' }],
      },
    },
    ...overrides,
  };
}
test('browser Dockerfile has a valid immutable default matching the canonical input', () => {
  browserBuildPolicy();
  browserBuildPolicy(`ARG BROWSER_IMAGE=${inputs.browser}\nFROM \${BROWSER_IMAGE}\n`);
  for (const value of [
    '',
    'browser:latest',
    inputs.browser.replace('sha256:', 'sha256:00'),
  ])
    assert.throws(() =>
      browserBuildPolicy(`ARG BROWSER_IMAGE=${value}\nFROM \${BROWSER_IMAGE}\n`),
    );
  assert.throws(() =>
    browserBuildPolicy(`ARG BROWSER_IMAGE\nFROM \${BROWSER_IMAGE}\n`),
  );
  assert.throws(() =>
    browserBuildPolicy(`ARG BROWSER_IMAGE=${inputs.browser}\nFROM wrong\n`),
  );
});
test('real stdout and stderr capture stays private and failed commands do not attach output', () => {
  const marker = randomBytes(32).toString('hex');
  const output = capture(process.execPath, [
    '-e',
    `process.stdout.write('public');process.stderr.write('${marker}')`,
  ]);
  assert.equal(output.stdout, 'public');
  assert.equal(output.stderr, marker);
  let failure;
  try {
    capture(process.execPath, [
      '-e',
      `process.stderr.write('${marker}');process.exit(7)`,
    ]);
  } catch (error) {
    failure = error;
  }
  assert(failure);
  assert(!JSON.stringify(failure).includes(marker));
  assert(!failure.message.includes(marker));
});
test('service state and known categories are visible while logs, health output and environment never escape', () => {
  const marker = randomBytes(32).toString('hex');
  const state = resource();
  state.Config.Env = [`PRIVATE_VALUE=${marker}`];
  state.State.Error = marker;
  state.State.Health.Log[0].Output = marker;
  const diagnostic = serviceDiagnostic(
    state,
    { stdout: marker, stderr: `ERR_MODULE_NOT_FOUND ${marker}` },
    { project, owner },
  );
  assert.deepEqual(diagnostic, {
    service: 'issuer',
    state: 'exited',
    exitCode: 1,
    oomKilled: false,
    health: 'unhealthy',
    failingStreak: 3,
    healthExitCode: 1,
    category: 'module-resolution',
  });
  const summary = diagnosticSummary({ services: [diagnostic] });
  assert(summary.includes('issuer: exited'));
  assert(!JSON.stringify(diagnostic).includes(marker));
  assert(!summary.includes(marker));
});
test('OOM state takes precedence and unknown or malformed metadata cannot become arbitrary output', () => {
  const state = resource();
  state.State = {
    Status: 'private-value',
    ExitCode: 'private-value',
    OOMKilled: true,
    Health: { Status: 'private-value', FailingStreak: 'private-value' },
  };
  const value = serviceDiagnostic(
    state,
    { stdout: '', stderr: '' },
    { project, owner },
  );
  assert.equal(value.category, 'out-of-memory');
  assert.equal(value.state, 'unknown');
  assert.equal(value.health, 'none');
  assert.equal(value.exitCode, null);
  assert.equal(value.failingStreak, null);
  for (const text of ['', randomBytes(32).toString('hex')])
    assert.equal(failureCategory(text), 'unclassified');
  for (const [text, category] of [
    ['EACCES', 'permission-denied'],
    ['EROFS', 'read-only-filesystem'],
    ['OIDC provider is unavailable or misconfigured', 'oidc-discovery'],
    ['ERR_TLS_CERT_ALTNAME_INVALID', 'tls-trust'],
  ])
    assert.equal(failureCategory(text), category);
});
test('collector reads only owned known services before cleanup and captures stderr categories', () => {
  const operations = [];
  const result = collectServiceDiagnostics({
    project,
    owner,
    command: (args) => {
      operations.push(args[0]);
      return args[0] === 'ps' ? container : JSON.stringify([resource()]);
    },
    capture: (args) => {
      assert.deepEqual(args, ['logs', '--tail', '40', container]);
      operations.push('logs');
      return { stdout: '', stderr: 'read-only file system' };
    },
  });
  assert.equal(result.outcome, 'available');
  assert.equal(result.services[0].category, 'read-only-filesystem');
  assert.deepEqual(operations, ['ps', 'inspect', 'logs']);
});
test('foreign identities, unknown roles, inspect failures and oversized output remain incomplete and cannot leak or trigger log reads', () => {
  const marker = randomBytes(32).toString('hex');
  for (const change of [
    (v) => {
      v.Config.Labels['com.fleetiq.deploy.owner'] = marker;
    },
    (v) => {
      v.Config.Labels['com.docker.compose.service'] = marker;
    },
  ]) {
    const value = resource();
    change(value);
    let logs = 0;
    const result = collectServiceDiagnostics({
      project,
      owner,
      command: (args) => (args[0] === 'ps' ? container : JSON.stringify([value])),
      capture: () => {
        logs++;
        throw new Error(marker);
      },
    });
    assert.equal(result.outcome, 'incomplete');
    assert.equal(logs, 0);
    assert(!JSON.stringify(result).includes(marker));
  }
  const failed = collectServiceDiagnostics({
    project,
    owner,
    command: () => {
      throw new Error(marker);
    },
    capture: () => {
      throw new Error(marker);
    },
  });
  assert.equal(failed.outcome, 'incomplete');
  assert(!JSON.stringify(failed).includes(marker));
  const logFailure = collectServiceDiagnostics({
    project,
    owner,
    command: (args) => (args[0] === 'ps' ? container : JSON.stringify([resource()])),
    capture: () => {
      throw new Error(marker);
    },
  });
  assert.equal(logFailure.outcome, 'incomplete');
  assert.equal(logFailure.services.length, 1);
  assert(!JSON.stringify(logFailure).includes(marker));
});
