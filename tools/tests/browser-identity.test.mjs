import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { api, packagePath } from '../../local/qualification/product/api.mjs';
import {
  apiOperation,
  formatApiFailure,
  parseApiFailure,
} from '../../local/qualification/product/api-failure.mjs';
import {
  browserFailure,
  browserUiCause,
  formatBrowserFailure,
  parseBrowserFailure,
} from '../../local/qualification/product/browser-failure.mjs';
import {
  callbackUri,
  interactionCsp,
} from '../../local/qualification/product/oidc-contract.mjs';
import { context } from '../installation.mjs';
import { root } from '../process.mjs';
import { diagnosticSummary, serviceDiagnostic } from '../product/diagnostics.mjs';
import { issuerBrowserPolicy } from '../product/policy.mjs';

test('issuer CSP permits only same-origin submission and the registered cross-origin callback', () => {
  issuerBrowserPolicy();
  assert.equal(callbackUri, 'https://fleet.test:8443/api/v1/auth/callback');
  const source = readFileSync(
    resolve(root, 'local/qualification/product/issuer.mjs'),
    'utf8',
  );
  assert(source.includes('redirect_uris: [callbackUri]'));
  assert(source.includes("'Content-Security-Policy': interactionCsp"));
  for (const value of [
    "default-src 'none'; form-action 'self'; base-uri 'none'",
    interactionCsp.replace(callbackUri, '*'),
    interactionCsp.replace(callbackUri, 'https:'),
    interactionCsp.replace(callbackUri, 'https://unregistered.test/callback'),
    interactionCsp.replace("default-src 'none'", "default-src 'unsafe-inline'"),
    interactionCsp.replace("base-uri 'none'", "base-uri 'self'"),
    `${interactionCsp}; form-action *`,
  ])
    assert.throws(() => issuerBrowserPolicy(value));
  assert.throws(() =>
    issuerBrowserPolicy(interactionCsp, 'https://unregistered.test/callback'),
  );
});
test('browser failures retain only fixed steps and causes, never URLs, OAuth parameters or assertions', () => {
  const marker = randomBytes(32).toString('hex');
  const error = new Error(
    `https://issuer.test:9443/authorize?code=${marker}&state=${marker}`,
  );
  error.name = 'TimeoutError';
  const record = browserFailure('callback', error, true);
  assert.deepEqual(record, { step: 'callback', cause: 'content-security-policy' });
  const line = formatBrowserFailure(record);
  assert(!line.includes(marker));
  assert(!line.includes('https:'));
  assert.deepEqual(parseBrowserFailure(`${marker}\n${line}\r\n${marker}`), record);
  assert.deepEqual(browserFailure(marker, error), {
    step: 'unknown',
    cause: 'timeout',
  });
  assert.throws(() => formatBrowserFailure({ step: marker, cause: 'timeout' }));
  assert.throws(() => formatBrowserFailure({ step: 'callback', cause: marker }));
  assert.equal(
    parseBrowserFailure('FleetIQ browser failure: step=callback; cause=unreviewed'),
    undefined,
  );
  assert.equal(
    parseBrowserFailure(`FleetIQ browser failure: step=${marker}; cause=timeout`),
    undefined,
  );
  assert.equal(parseBrowserFailure(`${line}; private=${marker}`), undefined);
  assert.equal(
    browserFailure('browser-launch', new Error('Target page closed')).cause,
    'browser-closed',
  );
  assert.equal(
    browserFailure('application', new Error('net::ERR_CERT_AUTHORITY_INVALID')).cause,
    'certificate-trust',
  );
});
test('owned browser diagnostics report the exact safe action without provider details', () => {
  const marker = randomBytes(32).toString('hex');
  const resource = {
    Config: {
      Labels: {
        'com.docker.compose.project': 'product-test',
        'com.fleetiq.deploy.owner': 'owner',
        'com.docker.compose.service': 'browser',
      },
    },
    State: { Status: 'exited', ExitCode: 1, OOMKilled: false },
  };
  const record = serviceDiagnostic(
    resource,
    {
      stdout: marker,
      stderr: `${marker}\n${formatBrowserFailure({ step: 'callback', cause: 'content-security-policy' })}`,
    },
    { project: 'product-test', owner: 'owner' },
  );
  assert.deepEqual(record.browserFailure, {
    step: 'callback',
    cause: 'content-security-policy',
  });
  const summary = diagnosticSummary({ services: [record] });
  assert(summary.includes('browser-step=callback'));
  assert(summary.includes('browser-cause=content-security-policy'));
  assert(!JSON.stringify(record).includes(marker));
  assert(!summary.includes(marker));
});

test('local browser verification checks the Linux Docker runtime on Unix or Windows transports', () => {
  const execute =
    ({
      os = 'linux',
      endpoint = 'unix:///var/run/docker.sock',
      version = '5.5.1',
    } = {}) =>
    (_program, args) => {
      if (args[0] === 'context' && args[1] === 'show') return 'local-test';
      if (args[0] === 'context' && args[1] === 'inspect')
        return JSON.stringify([{ Endpoints: { docker: { Host: endpoint } } }]);
      if (args.includes('info')) return os;
      if (args.includes('compose')) return version;
      throw new Error('Unexpected Docker prerequisite command');
    };
  assert.equal(context({ execute: execute(), environment: {} }), 'local-test');
  assert.equal(
    context({
      execute: execute({ endpoint: 'npipe:////./pipe/dockerDesktopLinuxEngine' }),
      environment: {},
    }),
    'local-test',
  );
  assert.throws(() =>
    context({ execute: execute({ os: 'windows' }), environment: {} }),
  );
  assert.throws(() =>
    context({
      execute: execute({ endpoint: 'tcp://remote.example:2375' }),
      environment: {},
    }),
  );
  assert.throws(() =>
    context({ execute: execute({ version: '0.0.0' }), environment: {} }),
  );
  assert.throws(() =>
    context({ execute: execute(), environment: { NODE_TLS_REJECT_UNAUTHORIZED: '0' } }),
  );
});

test('artifact upload sends raw bytes and the required matching SHA-256 header over a real HTTP connection', async () => {
  const bytes = Buffer.from([0, 97, 115, 109, 13, 0, 1, 0, 128, 255, 0]);
  let received;
  const server = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const actual = Buffer.concat(chunks);
    received = {
      body: actual,
      sha: request.headers['x-artifact-sha256'],
      type: request.headers['content-type'],
      csrf: request.headers['x-fleetiq-csrf'],
      method: request.method,
      path: request.url,
    };
    response.writeHead(
      received.sha === createHash('sha256').update(actual).digest('hex') ? 201 : 400,
      { 'Content-Type': 'application/json' },
    );
    response.end('{}');
  });
  await new Promise((ready) => server.listen(0, '127.0.0.1', ready));
  try {
    const origin = `http://127.0.0.1:${server.address().port}`;
    const page = {
      evaluate: (fn, args) =>
        runInNewContext(`(${fn.toString()})(args)`, {
          args,
          Uint8Array,
          AbortSignal,
          fetch: (path, options) => fetch(new URL(path, origin), options),
        }),
    };
    await api(page, packagePath, { method: 'PUT', wasm: true, body: [...bytes] });
    assert.deepEqual(received.body, bytes);
    assert.equal(received.sha, createHash('sha256').update(bytes).digest('hex'));
    assert.equal(received.type, 'application/wasm');
    assert.equal(received.csrf, '1');
    assert.equal(received.path, packagePath);
    assert.equal(received.method, 'PUT');
  } finally {
    server.closeAllConnections();
    await new Promise((done) => server.close(done));
  }
});
test('API diagnostics retain only reviewed operation identifiers and numeric status, never request values', () => {
  const marker = randomBytes(32).toString('hex');
  assert.equal(apiOperation(packagePath, 'PUT', true), 'upload-package');
  assert.equal(
    apiOperation(`/api/v1/unknown?token=${marker}`, 'GET', true),
    'other-api',
  );
  assert.equal(
    apiOperation('/api/v1/tenants/tenant-a/properties', 'POST', false),
    'reject-missing-csrf',
  );
  const line = formatApiFailure('upload-package', 400, undefined);
  assert.deepEqual(parseApiFailure(line), {
    operation: 'upload-package',
    status: 400,
    expected: '2xx',
  });
  assert(!line.includes(marker));
  for (const status of [0, 999, '400'])
    assert.throws(() => formatApiFailure('upload-package', status));
  assert.throws(() => formatApiFailure(marker, 400));
  assert.equal(
    parseApiFailure(
      `FleetIQ API failure: operation=${marker}; status=400; expected=2xx`,
    ),
    undefined,
  );
  assert.equal(parseApiFailure(`${line}; token=${marker}`), undefined);
});

test('UI fallback diagnosis returns fixed categories without retaining arbitrary DOM values', async () => {
  const marker = randomBytes(32).toString('hex');
  const page = (text) => ({
    isClosed: () => false,
    evaluate: (fn) =>
      Promise.resolve(
        runInNewContext(`(${fn.toString()})()`, {
          document: { body: { textContent: text } },
        }),
      ),
  });
  for (const [copy, cause] of [
    ['The service returned an invalid response.', 'metadata-invalid-response'],
    ['Your session has ended.', 'session-ended'],
    ['The metadata service is unavailable.', 'metadata-unavailable'],
    ['Choose the required context to review asset identity.', 'metadata-context'],
  ]) {
    const actual = await browserUiCause(page(`${marker} ${copy}`));
    assert.equal(actual, cause);
    assert.equal(
      browserFailure('inspector-selection', new Error(marker), false, actual).cause,
      cause,
    );
    assert(!JSON.stringify(actual).includes(marker));
  }
  assert.equal(await browserUiCause(page(marker)), undefined);
  assert.equal(await browserUiCause({ isClosed: () => true }), undefined);
  assert.equal(await browserUiCause(undefined), undefined);
});
