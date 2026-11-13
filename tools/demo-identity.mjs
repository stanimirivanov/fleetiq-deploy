import assert from 'node:assert/strict';
import {
  createPrivateKey,
  generateKeyPairSync,
  randomBytes,
  randomUUID,
  X509Certificate,
} from 'node:crypto';
import { lookup } from 'node:dns/promises';
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { request } from 'node:https';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parse } from 'yaml';
import { root, run } from './process.mjs';

export const demoIdentity = Object.freeze(
  parse(readFileSync(new URL('../local/demo/identity.yaml', import.meta.url), 'utf8')),
);

/** Only the reviewed loopback demo topology is a valid synthetic authority. */
export function validateDemoIdentity(value) {
  try {
    assert.deepEqual(value, {
      schemaVersion: 1,
      issuer: 'https://issuer.fleetiq.test:59443',
      browser: 'https://fleet.fleetiq.test:58443',
      callback: 'https://fleet.fleetiq.test:58443/api/v1/auth/callback',
    });
    return value;
  } catch {
    throw new Error('Demo identity configuration invalid');
  }
}

function privateDirectory(directory) {
  const path = resolve(directory);
  const stat = lstatSync(path);
  assert(stat.isDirectory() && realpathSync(path) === path);
  assert.equal(stat.uid, process.getuid());
  assert.equal(stat.mode & 0o777, 0o700);
  return path;
}

function privateFile(directory, name) {
  const path = resolve(directory, name);
  const stat = lstatSync(path);
  assert(stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1);
  assert.equal(stat.uid, process.getuid());
  assert.equal(stat.mode & 0o777, 0o600);
  assert(stat.size > 0 && stat.size <= 32768);
  return readFileSync(path);
}

/** Validate retained credentials and certificate identity before any reuse. */
export function loadDemoIdentity(directory, { verifyCaKey = true } = {}) {
  try {
    validateDemoIdentity(demoIdentity);
    privateDirectory(directory);
    const state = JSON.parse(privateFile(directory, 'identity.json'));
    assert.deepEqual(Object.keys(state).sort(), [
      'clientId',
      'clientSecret',
      'config',
      'cookieKey',
      'jwks',
      'schemaVersion',
      'subject',
    ]);
    assert.equal(state.schemaVersion, 1);
    validateDemoIdentity(state.config);
    assert.match(state.subject, /^synthetic-[a-f0-9-]{36}$/u);
    assert.equal(state.clientId, 'fleetiq-simulator-demo');
    for (const field of ['clientSecret', 'cookieKey'])
      assert.match(state[field], /^[a-f0-9]{64}$/u);
    assert.equal(state.jwks.keys.length, 1);
    const key = state.jwks.keys[0];
    assert.equal(key.alg, 'RS256');
    assert.equal(key.use, 'sig');
    assert.equal(createPrivateKey({ key, format: 'jwk' }).asymmetricKeyType, 'rsa');
    const ca = new X509Certificate(privateFile(directory, 'ca.crt'));
    const leaf = new X509Certificate(privateFile(directory, 'tls.crt'));
    const valid = (cert) =>
      Date.parse(cert.validFrom) <= Date.now() && Date.parse(cert.validTo) > Date.now();
    assert(ca.ca && valid(ca) && valid(leaf));
    assert(leaf.checkIssued(ca) && leaf.verify(ca.publicKey));
    assert.equal(
      leaf.subjectAltName,
      'DNS:issuer.fleetiq.test, DNS:fleet.fleetiq.test',
    );
    assert(leaf.checkPrivateKey(createPrivateKey(privateFile(directory, 'tls.key'))));
    assert.equal(typeof verifyCaKey, 'boolean');
    if (verifyCaKey)
      assert(ca.checkPrivateKey(createPrivateKey(privateFile(directory, 'ca.key'))));
    return state;
  } catch {
    throw new Error('Demo identity state invalid');
  }
}

/** Create once in a new private directory; partial or foreign state is never adopted. */
export function initializeDemoIdentity(directory) {
  if (existsSync(directory)) return loadDemoIdentity(directory);
  privateDirectory(dirname(resolve(directory)));
  mkdirSync(directory, { mode: 0o700 });
  try {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const state = {
      schemaVersion: 1,
      config: validateDemoIdentity(demoIdentity),
      subject: `synthetic-${randomUUID()}`,
      clientId: 'fleetiq-simulator-demo',
      clientSecret: randomBytes(32).toString('hex'),
      cookieKey: randomBytes(32).toString('hex'),
      jwks: {
        keys: [
          {
            ...privateKey.export({ format: 'jwk' }),
            kid: randomUUID(),
            use: 'sig',
            alg: 'RS256',
          },
        ],
      },
    };
    const execute = (args) => run('openssl', args, { cwd: directory, timeout: 30000 });
    execute([
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-keyout',
      'ca.key',
      '-out',
      'ca.crt',
      '-days',
      '30',
      '-subj',
      '/CN=FleetIQ isolated demo CA',
      '-addext',
      'basicConstraints=critical,CA:TRUE',
    ]);
    execute([
      'req',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-keyout',
      'tls.key',
      '-out',
      'tls.csr',
      '-subj',
      '/CN=issuer.fleetiq.test',
    ]);
    writeFileSync(
      resolve(directory, 'tls.ext'),
      'subjectAltName=DNS:issuer.fleetiq.test,DNS:fleet.fleetiq.test\nbasicConstraints=critical,CA:FALSE\nextendedKeyUsage=serverAuth\n',
      { mode: 0o600, flag: 'wx' },
    );
    execute([
      'x509',
      '-req',
      '-in',
      'tls.csr',
      '-CA',
      'ca.crt',
      '-CAkey',
      'ca.key',
      '-set_serial',
      `0x${randomBytes(16).toString('hex')}`,
      '-out',
      'tls.crt',
      '-days',
      '30',
      '-extfile',
      'tls.ext',
    ]);
    for (const name of ['ca.key', 'ca.crt', 'tls.key', 'tls.crt', 'tls.csr'])
      chmodSync(resolve(directory, name), 0o600);
    writeFileSync(resolve(directory, 'identity.json'), `${JSON.stringify(state)}\n`, {
      mode: 0o600,
      flag: 'wx',
    });
    return loadDemoIdentity(directory);
  } catch {
    throw new Error(
      'Demo identity initialization incomplete; retained private state requires operator review',
    );
  }
}

/** Fail until both host DNS and the caller's explicit TLS trust are ready. */
export async function preflightDemoIdentity({
  resolveHost = lookup,
  requestHttps = request,
} = {}) {
  validateDemoIdentity(demoIdentity);
  if (process.env.NODE_TLS_REJECT_UNAUTHORIZED)
    throw new Error('Demo trust preflight failed');
  try {
    for (const host of ['fleet.fleetiq.test', 'issuer.fleetiq.test']) {
      const addresses = await resolveHost(host, { all: true });
      assert(
        addresses.length > 0 &&
          addresses.every(({ address }) => address === '127.0.0.1'),
      );
    }
    await new Promise((resolvePromise, reject) => {
      const req = requestHttps(
        `${demoIdentity.issuer}/.well-known/openid-configuration`,
        {
          timeout: 5000,
          // Shutdown can leave a stale pooled socket while synchronous Compose blocks events.
          agent: false,
          // Both names were validated above; prevent a second DNS lookup escaping loopback.
          lookup: (_name, options, callback) =>
            callback(
              null,
              options.all ? [{ address: '127.0.0.1', family: 4 }] : '127.0.0.1',
              4,
            ),
        },
        (res) => {
          let body = '';
          res.on('data', (chunk) => {
            body += chunk;
            if (body.length > 32768) req.destroy(new Error('Discovery exceeds bound'));
          });
          res.on('end', () => {
            try {
              assert.equal(res.statusCode, 200);
              assert.equal(JSON.parse(body).issuer, demoIdentity.issuer);
              resolvePromise();
            } catch {
              reject(new Error('Invalid discovery'));
            }
          });
          res.on('error', reject);
        },
      );
      const deadline = setTimeout(
        () => req.destroy(new Error('Deadline exceeded')),
        5000,
      );
      req.once('close', () => clearTimeout(deadline));
      req.on('error', reject);
      req.on('timeout', () => req.destroy(new Error('Timeout')));
      req.end();
    });
  } catch {
    throw new Error(
      'Demo trust preflight failed; check loopback DNS, issuer availability and reviewed public CA trust',
    );
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    const [command, name, ...extra] = process.argv.slice(2);
    assert(
      ['init', 'preflight'].includes(command) &&
        /^[a-z][a-z0-9-]{0,30}$/u.test(name) &&
        extra.length === 0,
    );
    const parent = resolve(root, '.local/demo-identities');
    if (command === 'init') {
      const local = resolve(root, '.local');
      if (existsSync(local)) assert.equal(realpathSync(local), local);
      if (existsSync(parent)) privateDirectory(parent);
      mkdirSync(parent, { recursive: true, mode: 0o700 });
      initializeDemoIdentity(resolve(parent, name));
    } else {
      loadDemoIdentity(resolve(parent, name));
      await preflightDemoIdentity();
    }
    console.log(`Demo identity ${command}: complete`);
  } catch {
    console.error(
      'Demo identity command failed; check private state, loopback DNS and public CA trust prerequisites',
    );
    process.exitCode = 1;
  }
}
