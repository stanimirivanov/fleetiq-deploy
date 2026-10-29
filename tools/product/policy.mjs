import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { requiredChecks } from '../../local/qualification/product/contract.mjs';
import {
  callbackUri,
  interactionCsp,
  issuerOrigin,
} from '../../local/qualification/product/oidc-contract.mjs';
import { lock } from '../policy.mjs';
import { root } from '../process.mjs';
export const inputs = JSON.parse(
  readFileSync(resolve(root, 'local/qualification/product/inputs.lock.json')),
);
export function browserBuildPolicy(
  dockerfile = readFileSync(
    resolve(root, 'local/qualification/product/Dockerfile'),
    'utf8',
  ),
) {
  const defaults = [...dockerfile.matchAll(/^ARG BROWSER_IMAGE=(\S+)$/gmu)];
  assert.equal(defaults.length, 1, 'Browser base requires one immutable default');
  assert.equal(
    defaults[0][1],
    inputs.browser,
    'Browser default must match the reviewed lock',
  );
  assert.equal((dockerfile.match(/^FROM \$\{BROWSER_IMAGE\}$/gmu) ?? []).length, 1);
}
export function issuerBrowserPolicy(policy = interactionCsp, callback = callbackUri) {
  assert.equal(issuerOrigin, 'https://issuer.test:9443');
  assert.equal(callback, 'https://fleet.test:8443/api/v1/auth/callback');
  const directives = policy.split(';').map((value) => value.trim().split(/\s+/u));
  assert.deepEqual(
    directives,
    [
      ['default-src', "'none'"],
      ['form-action', "'self'", callback],
      ['base-uri', "'none'"],
    ],
    'Issuer form-action must allow exactly its origin and registered callback',
  );
}
export function productPolicy(spec) {
  issuerBrowserPolicy();
  browserBuildPolicy();
  assert.deepEqual(Object.keys(spec.services).sort(), [
    'artifacts',
    'backend',
    'browser',
    'edge',
    'ingest',
    'init',
    'issuer',
    'postgres',
    'projection',
    'replay',
    'semantic',
  ]);
  assert.deepEqual(Object.keys(spec.volumes).sort(), [
    'artifacts',
    'database',
    'state',
  ]);
  assert(spec.networks.application.internal && spec.networks.database.internal);
  for (const [name, service] of Object.entries(spec.services)) {
    assert(
      !service.ports &&
        !service.privileged &&
        !service.pid &&
        !service.devices &&
        !service.cap_add &&
        !service.build &&
        !service.env_file,
      'No host exposure, privilege expansion or mutable build',
    );
    assert(
      service.mem_limit &&
        service.pids_limit &&
        service.labels['com.fleetiq.deploy.owner'],
    );
    assert.match(
      service.image,
      /^(?:sha256:[a-f0-9]{64}|[^\s@]+@sha256:[a-f0-9]{64})$/u,
      'Runtime images must be immutable',
    );
    assert(service.pids_limit > 0 && service.pids_limit <= 256, 'PID budget changed');
    assert(
      /^[1-9][0-9]*m$/u.test(service.mem_limit) &&
        Number.parseInt(service.mem_limit, 10) <= 1536,
      'Memory budget changed',
    );
    const expectedUser = ['init', 'artifacts'].includes(name)
      ? '0:0'
      : ['browser', 'issuer'].includes(name)
        ? '1000:1000'
        : '10001:10001';
    if (name !== 'postgres')
      assert.equal(service.user, expectedUser, 'Runtime UID boundary changed');
    assert(service.security_opt.includes('no-new-privileges:true'));
    if (name !== 'postgres') {
      assert(service.read_only);
      assert.deepEqual(service.cap_drop, ['ALL']);
    }
    if (!['init', 'artifacts'].includes(name))
      assert(!service.network_mode, 'No host network mode');
    for (const mount of service.volumes ?? [])
      assert(!JSON.stringify(mount).includes('docker.sock'));
    for (const key of Object.keys(service.environment ?? {}))
      assert(
        !/PASSWORD$|CLIENT_SECRET$|TOKEN$|NODE_TLS_REJECT_UNAUTHORIZED/u.test(key),
        'Secrets must remain files; TLS stays verified',
      );
  }
  const stateScopes = {
    init: ['root'],
    artifacts: [],
    postgres: ['database'],
    backend: ['backend', 'public'],
    issuer: ['issuer', 'public'],
    edge: ['edge'],
    ingest: ['database', 'public'],
    replay: ['database', 'public'],
    semantic: ['database', 'public'],
    projection: ['database', 'public'],
    browser: ['public'],
  };
  for (const [role, service] of Object.entries(spec.services)) {
    const scopes = (service.volumes ?? []).flatMap((mount) =>
      typeof mount === 'string'
        ? mount.startsWith('state:')
          ? ['root']
          : []
        : mount.source === 'state'
          ? [mount.volume?.subpath ?? 'root']
          : [],
    );
    assert.deepEqual(
      scopes.sort(),
      [...stateScopes[role]].sort(),
      'Credential volume scope changed',
    );
  }
  const edge = spec.services.edge;
  assert.deepEqual(edge.environment, {
    FLEETIQ_PUBLIC_AUTHORITY: 'fleet.test:8443',
    FLEETIQ_API_UPSTREAM: 'backend:8080',
  });
  assert.deepEqual(
    edge.tmpfs,
    ['/tmp:size=32m,uid=10001,gid=10001,mode=0700,noexec,nosuid,nodev'],
    'NGINX scratch must be private, bounded and non-executable',
  );
  const edgeTemplate = edge.volumes.find(
    (mount) => mount.target === '/etc/fleetiq/nginx.conf.template',
  );
  const control = spec.services.browser.volumes.find(
    (mount) => mount.target === '/control',
  ).source;
  assert(
    edgeTemplate?.read_only &&
      edgeTemplate.source === resolve(control, '..', 'edge.conf.template'),
    'NGINX template must be the reviewed per-run TLS adapter',
  );
  assert(
    !edge.volumes.some((mount) => ['/data', '/config'].includes(mount.target)),
    'No inherited Caddy storage',
  );
  assert.equal(
    edge.volumes.find((mount) => mount.target === '/run/tls')?.read_only,
    true,
    'TLS credentials must stay read-only',
  );
  assert.equal(edge.volumes.length, 3, 'No additional edge template/credential mounts');
  const maps = edge.volumes.find((mount) => mount.target === '/fixture/maps');
  assert(
    maps?.read_only &&
      maps.source === resolve(root, 'local/qualification/product/maps'),
    'Only the controlled read-only map fixture is permitted',
  );
  assert.deepEqual(spec.services.artifacts.network_mode, 'none');
  assert.deepEqual(spec.services.browser.networks, ['application']);
  assert.deepEqual(spec.services.postgres.networks, ['database']);
  assert.equal(spec.services.postgres.image, lock.images.postgres);
  assert.deepEqual(
    spec.services.postgres.healthcheck.test,
    ['CMD', 'pg_isready', '-h', '127.0.0.1', '-U', 'fleetiq', '-d', 'fleetiq'],
    'Readiness must exclude the socket-only initialization server',
  );
  assert.equal(spec.services.backend.depends_on.postgres.condition, 'service_healthy');
  assert(
    spec.services.postgres.volumes.some(
      (mount) =>
        mount.type === 'bind' &&
        mount.source ===
          resolve(root, 'local/qualification/product/postgres-initialization.sh') &&
        mount.target === '/docker-entrypoint-initdb.d/00-readiness.sh' &&
        mount.read_only === true,
    ),
    'The real initialization-race regression is required',
  );
  assert(spec.services.backend.environment.FLEETIQ_OIDC_ADDITIONAL_CA_BUNDLE);
  assert.deepEqual(spec.services.init.network_mode, 'none');
  assert.match(
    inputs.browser,
    /^mcr\.microsoft\.com\/playwright:v[0-9.]+-noble@sha256:[a-f0-9]{64}$/u,
  );
  assert(
    inputs.browser.startsWith(
      `mcr.microsoft.com/playwright:v${inputs.playwright}-noble@sha256:`,
    ),
  );
  assert.deepEqual(Object.keys(inputs).sort(), [
    'browser',
    'oidcProvider',
    'playwright',
    'schemaVersion',
  ]);
  assert.equal(inputs.schemaVersion, 1);
  const manifest = JSON.parse(readFileSync(resolve(root, 'package.json')));
  assert.equal(manifest.devDependencies['@playwright/test'], inputs.playwright);
  assert.equal(manifest.devDependencies['oidc-provider'], inputs.oidcProvider);
}
export function completeProduct(value) {
  assert(value?.phase === 'complete');
  assert.deepEqual(
    [...value.checks].sort(),
    [...requiredChecks].sort(),
    'Every installed check is required exactly once',
  );
  return [...value.checks];
}
/** Identity/resource ownership must be proven before start, restart or removal. */
export function assertResource(resource, project, owner, kind) {
  const labels = kind === 'container' ? resource.Config?.Labels : resource.Labels;
  assert.equal(
    labels?.['com.docker.compose.project'],
    project,
    'Foreign Compose resource',
  );
  assert.equal(labels?.['com.fleetiq.deploy.owner'], owner, 'Foreign resource owner');
}
