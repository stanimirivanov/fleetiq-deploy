import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { parse } from 'yaml';
import { root } from './process.mjs';

export const lock = JSON.parse(
  readFileSync(resolve(root, 'local/artifacts.lock.json')),
);
export const identityKeys = [
  'FLEETIQ_BROWSER_ORIGIN',
  'FLEETIQ_OIDC_ISSUER',
  'FLEETIQ_OIDC_CLIENT_ID',
  'FLEETIQ_OIDC_IDENTITY_AUTHORITY',
];
export const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
export function exactKeys(value, keys) {
  assert(
    value && typeof value === 'object' && !Array.isArray(value),
    'Expected object',
  );
  assert.deepEqual(
    Object.keys(value).sort(),
    [...keys].sort(),
    'Unexpected configuration keys',
  );
}
export function config(value) {
  exactKeys(value, ['httpsPort', 'oidc']);
  assert(
    Number.isInteger(value.httpsPort) &&
      value.httpsPort >= 1024 &&
      value.httpsPort <= 65535,
    'Invalid HTTPS port',
  );
  exactKeys(value.oidc, ['issuer', 'clientId', 'authority']);
  let issuer;
  try {
    issuer = new URL(value.oidc.issuer);
  } catch {
    throw new Error('Invalid HTTPS issuer');
  }
  assert(
    issuer.protocol === 'https:' &&
      !issuer.username &&
      !issuer.password &&
      !issuer.search &&
      !issuer.hash,
    'Issuer must be an HTTPS identifier without credentials/query/fragment',
  );
  for (const key of ['clientId', 'authority'])
    assert(
      typeof value.oidc[key] === 'string' &&
        /^[a-zA-Z0-9._:-]{1,128}$/u.test(value.oidc[key]),
      'Invalid OIDC identifier',
    );
  return value;
}
export function validateLock(value = lock) {
  exactKeys(value, ['schemaVersion', 'sources', 'images', 'tools']);
  assert.equal(value.schemaVersion, 1);
  exactKeys(value.sources, ['platform', 'ux']);
  for (const [name, source] of Object.entries(value.sources)) {
    exactKeys(source, ['repository', 'commit']);
    assert.equal(
      source.repository,
      `https://github.com/stanimirivanov/fleetiq-${name === 'ux' ? 'ui' : name}.git`,
    );
    assert.match(source.commit, /^[a-f0-9]{40}$/u);
  }
  exactKeys(value.images, [
    'rust',
    'runtime',
    'node',
    'edge',
    'postgres',
    'alertmanager',
  ]);
  for (const image of Object.values(value.images))
    assert.match(image, /^[a-z0-9/.-]+:[a-zA-Z0-9.-]+@sha256:[a-f0-9]{64}$/u);
  exactKeys(value.tools, ['node', 'pnpm', 'compose']);
  assert.equal(value.tools.node, '24.18.0');
  assert.equal(value.tools.pnpm, '12.5.1');
  assert.equal(value.tools.compose, '5.5.1');
}
export function ownedPath(parent, candidate, exists = true) {
  const base = realpathSync(parent);
  const target = exists ? realpathSync(candidate) : resolve(candidate);
  const fragment = relative(base, target);
  assert(
    fragment &&
      fragment !== '..' &&
      !fragment.startsWith(`..${sep}`) &&
      !isAbsolute(fragment),
    'Path escapes the owned directory',
  );
  return target;
}
export function composePolicy(model, qualification = false) {
  assert.deepEqual(Object.keys(model.services).sort(), ['backend', 'edge', 'postgres']);
  assert.equal(model.services.postgres.image, lock.images.postgres);
  for (const service of Object.values(model.services))
    assert(
      !service.privileged &&
        !service.network_mode &&
        !service.pid &&
        !service.devices &&
        !service.container_name,
    );
  for (const name of ['backend', 'edge']) {
    const allowed =
      name === 'backend'
        ? {
            '/opt/fleetiq/backend-entrypoint.sh': 'backend-entrypoint.sh',
            '/opt/fleetiq/healthcheck.sh': 'healthcheck.sh',
          }
        : { '/etc/caddy/Caddyfile': 'Caddyfile' };
    for (const mount of model.services[name].volumes)
      if (mount.type === 'bind')
        assert(
          mount.read_only &&
            allowed[mount.target] &&
            mount.source === resolve(root, 'local', allowed[mount.target]),
          'Unreviewed host bind mount',
        );
  }
  for (const name of ['backend', 'edge']) {
    const service = model.services[name];
    assert.match(service.image, /^sha256:[a-f0-9]{64}$/u);
    assert.equal(service.user, '10001:10001');
    assert.equal(service.read_only, true);
    for (const mount of service.tmpfs ?? [])
      assert(
        typeof mount === 'string' &&
          mount.startsWith('/') &&
          mount.includes('noexec') &&
          mount.includes('nosuid'),
        'Invalid temporary filesystem declaration',
      );
    assert.deepEqual(service.cap_drop, ['ALL']);
    assert.deepEqual(service.security_opt, ['no-new-privileges:true']);
    assert(!service.cap_add?.length, 'Added capabilities are not allowed');
    assert(!service.privileged && !service.network_mode && !service.pid);
    assert(service.volumes.every((v) => v.type !== 'bind' || v.read_only));
  }
  assert(
    !model.services.backend.ports?.length && !model.services.postgres.ports?.length,
  );
  assert.equal(model.services.edge.ports.length, 1);
  assert.equal(model.services.edge.ports[0].host_ip, '127.0.0.1');
  assert.equal(model.services.edge.ports[0].target, 8443);
  assert.equal(model.networks.database.internal, true);
  assert.deepEqual(Object.keys(model.services.edge.networks), ['application']);
  assert.deepEqual(Object.keys(model.services.postgres.networks), ['database']);
  const environment = model.services.backend.environment;
  assert(
    !('DATABASE_URL' in environment) && !('FLEETIQ_OIDC_CLIENT_SECRET' in environment),
  );
  for (const key of identityKeys)
    assert(
      qualification ? !(key in environment) : Boolean(environment[key]),
      'Identity mode mismatch',
    );
  assert(
    !model.services.edge.environment?.FLEETIQ_API_UPSTREAM,
    'Probe override must not enter the installation',
  );
  for (const object of [
    ...Object.values(model.services),
    ...Object.values(model.volumes),
    ...Object.values(model.networks),
  ])
    assert.match(object.labels['com.fleetiq.deploy.owner'], /^[a-f0-9-]{36}$/u);
}
export function sourceCompose() {
  return parse(readFileSync(resolve(root, 'local/compose.yaml'), 'utf8'));
}
