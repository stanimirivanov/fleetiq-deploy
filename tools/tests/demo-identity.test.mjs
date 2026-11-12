import assert from 'node:assert/strict';
import { createHash, createPublicKey, randomBytes, verify } from 'node:crypto';
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { request } from 'node:https';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createDemoIssuer } from '../../local/demo/issuer.mjs';
import {
  demoIdentity,
  initializeDemoIdentity,
  loadDemoIdentity,
  preflightDemoIdentity,
  validateDemoIdentity,
} from '../demo-identity.mjs';

function fixture(t) {
  const parent = mkdtempSync(join(tmpdir(), 'fleetiq-demo-'));
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  return join(parent, 'identity');
}

// Use real TLS with canonical Host/SNI while binding an isolated loopback port.
function client(server, ca, hostname = 'issuer.fleetiq.test') {
  const cookies = new Map();
  const port = server.address().port;
  return (path, options = {}) =>
    new Promise((resolve, reject) => {
      const req = request(
        {
          hostname,
          servername: hostname,
          port,
          path,
          ca,
          agent: false,
          lookup: (_host, options, callback) =>
            options.all
              ? callback(null, [{ address: '127.0.0.1', family: 4 }])
              : callback(null, '127.0.0.1', 4),
          method: options.method ?? 'GET',
          headers: {
            host: 'issuer.fleetiq.test:59443',
            cookie: [...cookies.values()].join('; '),
            ...options.headers,
          },
          timeout: 5000,
        },
        (res) => {
          for (const cookie of res.headers['set-cookie'] ?? [])
            cookies.set(cookie.split('=')[0], cookie.split(';')[0]);
          let body = '';
          res.on('data', (chunk) => {
            body += chunk;
          });
          res.on('end', () =>
            resolve({ status: res.statusCode, headers: res.headers, body }),
          );
        },
      );
      req.on('error', reject);
      req.on('timeout', () => req.destroy(new Error('TLS request timed out')));
      req.end(options.body);
    });
}

async function listen(t, directory) {
  const server = createDemoIssuer(directory);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() =>
    server.listening ? new Promise((resolve) => server.close(resolve)) : undefined,
  );
  return server;
}

async function authorize(send, state, prompt) {
  const verifier = randomBytes(32).toString('base64url');
  const params = new URLSearchParams({
    client_id: state.clientId,
    redirect_uri: demoIdentity.callback,
    response_type: 'code',
    scope: 'openid',
    state: 'test-state',
    nonce: 'test-nonce',
    code_challenge: createHash('sha256').update(verifier).digest('base64url'),
    code_challenge_method: 'S256',
  });
  if (prompt) params.set('prompt', prompt);
  let response = await send(`/auth?${params}`);
  for (let step = 0; step < 12; step++) {
    assert([302, 303].includes(response.status));
    const url = new URL(response.headers.location, demoIdentity.issuer);
    if (url.origin === demoIdentity.browser) return { url, verifier };
    assert.equal(url.origin, demoIdentity.issuer);
    response = await send(`${url.pathname}${url.search}`);
    if (url.pathname.startsWith('/interaction/')) {
      assert.equal(response.status, 200);
      response = await send(url.pathname, {
        method: 'POST',
        headers: { origin: demoIdentity.issuer },
      });
    }
  }
  assert.fail('Authorization did not finish within its redirect budget');
}

test('demo identity refuses changed origins and unsafe private state without disclosing values', (t) => {
  for (const key of ['issuer', 'browser', 'callback'])
    assert.throws(
      () =>
        validateDemoIdentity({
          ...demoIdentity,
          [key]: 'https://outside.invalid/private-canary',
        }),
      /Demo identity configuration invalid/,
    );
  const directory = fixture(t);
  initializeDemoIdentity(directory);
  const state = loadDemoIdentity(directory);
  assert.equal(loadDemoIdentity(directory).subject, state.subject);
  const digest = (value) =>
    createHash('sha256').update(JSON.stringify(value)).digest('hex');
  assert.equal(digest(initializeDemoIdentity(directory)), digest(state));
  const retained = readFileSync(join(directory, 'identity.json'));
  writeFileSync(
    join(directory, 'identity.json'),
    JSON.stringify({
      ...state,
      config: { ...state.config, issuer: 'https://outside.invalid/private-canary' },
    }),
  );
  assert.throws(
    () => loadDemoIdentity(directory),
    /^Error: Demo identity state invalid$/,
  );
  writeFileSync(join(directory, 'identity.json'), retained);
  const certificate = readFileSync(join(directory, 'tls.crt'));
  writeFileSync(join(directory, 'tls.crt'), readFileSync(join(directory, 'ca.crt')));
  assert.throws(() => loadDemoIdentity(directory), /Demo identity state invalid/);
  writeFileSync(join(directory, 'tls.crt'), certificate);
  chmodSync(join(directory, 'identity.json'), 0o644);
  assert.throws(
    () => loadDemoIdentity(directory),
    /^Error: Demo identity state invalid$/,
  );
  chmodSync(join(directory, 'identity.json'), 0o600);
  symlinkSync(directory, `${directory}-link`);
  assert.throws(
    () => loadDemoIdentity(`${directory}-link`),
    /Demo identity state invalid/,
  );
});

test('real HTTPS discovery rejects wrong SAN, untrusted CA, Host and interaction Origin', async (t) => {
  const directory = fixture(t);
  initializeDemoIdentity(directory);
  const ca = readFileSync(join(directory, 'ca.crt'));
  const server = await listen(t, directory);
  const send = client(server, ca);
  const discovery = JSON.parse((await send('/.well-known/openid-configuration')).body);
  assert.equal(discovery.issuer, demoIdentity.issuer);
  assert.equal(new URL(discovery.token_endpoint).origin, demoIdentity.issuer);
  await assert.rejects(client(server, undefined)('/.well-known/openid-configuration'));
  await assert.rejects(
    client(server, ca, 'wrong.fleetiq.test')('/.well-known/openid-configuration'),
  );
  assert.equal((await send('/', { headers: { host: 'outside.invalid' } })).status, 403);
  assert.equal(
    (
      await send('/interaction/missing', {
        method: 'POST',
        headers: { origin: 'https://outside.invalid' },
      })
    ).status,
    403,
  );
  const state = loadDemoIdentity(directory);
  const authorization = await authorize(send, state);
  const token = await send('/token', {
    method: 'POST',
    headers: {
      authorization: `Basic ${Buffer.from(`${state.clientId}:${state.clientSecret}`).toString('base64')}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: authorization.url.searchParams.get('code'),
      redirect_uri: demoIdentity.callback,
      code_verifier: authorization.verifier,
    }).toString(),
  });
  assert.equal(token.status, 200);
  const tokens = JSON.parse(token.body);
  const claims = JSON.parse(Buffer.from(tokens.id_token.split('.')[1], 'base64url'));
  assert(claims.sub === state.subject);
  assert.equal(tokens.expires_in, 300);
  assert.equal(
    (await authorize(send, state, 'none')).url.searchParams.has('code'),
    true,
  );
  const jwks = (await send('/jwks')).body;
  const [header, payload, signature] = tokens.id_token.split('.');
  assert(
    verify(
      'RSA-SHA256',
      Buffer.from(`${header}.${payload}`),
      createPublicKey({ key: JSON.parse(jwks).keys[0], format: 'jwk' }),
      Buffer.from(signature, 'base64url'),
    ),
  );
  const pendingCode = await authorize(send, state);
  const address = server.address();
  await new Promise((resolve) => server.close(resolve));
  const restarted = createDemoIssuer(directory);
  await new Promise((resolve) => restarted.listen(address.port, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => restarted.close(resolve)));
  // Reuse the original cookie jar against the restarted server.
  assert.equal(
    (await authorize(send, state, 'none')).url.searchParams.get('error'),
    'login_required',
  );
  assert.equal((await send('/jwks')).body, jwks);
  const staleToken = await send('/token', {
    method: 'POST',
    headers: {
      authorization: `Basic ${Buffer.from(`${state.clientId}:${state.clientSecret}`).toString('base64')}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: pendingCode.url.searchParams.get('code'),
      redirect_uri: demoIdentity.callback,
      code_verifier: pendingCode.verifier,
    }).toString(),
  });
  assert.equal(staleToken.status, 400);
  assert.equal(JSON.parse(staleToken.body).error, 'invalid_grant');
  assert.equal((await authorize(send, state)).url.searchParams.has('code'), true);
});

test('trust preflight refuses nonloopback DNS and verifies real HTTPS discovery', async (t) => {
  await assert.rejects(
    preflightDemoIdentity({ resolveHost: async () => [{ address: '192.0.2.1' }] }),
    /Demo trust preflight failed/,
  );
  await assert.rejects(
    preflightDemoIdentity({ resolveHost: async () => [] }),
    /Demo trust preflight failed/,
  );
  const directory = fixture(t);
  initializeDemoIdentity(directory);
  const server = await listen(t, directory);
  const probe = (ca) => (_url, options, callback) =>
    request(
      {
        ...options,
        hostname: 'issuer.fleetiq.test',
        port: server.address().port,
        path: '/.well-known/openid-configuration',
        servername: 'issuer.fleetiq.test',
        headers: { host: 'issuer.fleetiq.test:59443' },
        ca,
        agent: false,
      },
      callback,
    );
  const resolveHost = async () => [{ address: '127.0.0.1' }];
  await assert.rejects(
    preflightDemoIdentity({ resolveHost, requestHttps: probe(undefined) }),
    /Demo trust preflight failed/,
  );
  await preflightDemoIdentity({
    resolveHost,
    requestHttps: probe(readFileSync(join(directory, 'ca.crt'))),
  });
});
