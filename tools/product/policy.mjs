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
import { qualifiedEdge } from '../qualified-edge.mjs';
import { archiveEndpoint, normalProductWorkers, productInputs } from './compose.mjs';
export const inputs = productInputs;
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
    'alertmanager',
    'analytics',
    'archive-client',
    'archive-storage',
    'archive-worker',
    'artifacts',
    'backend',
    'browser',
    'edge',
    'ingest',
    'init',
    'issuer',
    'normal-edge',
    'notification',
    'postgres',
    'projection',
    'receiver',
    'replay',
    'semantic',
  ]);
  assert.deepEqual(Object.keys(spec.volumes).sort(), [
    'artifacts',
    'database',
    'state',
  ]);
  assert.deepEqual(Object.keys(spec.networks).sort(), [
    'application',
    'database',
    'notifications',
  ]);
  for (const network of Object.values(spec.networks))
    assert(network.internal === true && !network.external);
  for (const [role, networks] of Object.entries({
    analytics: ['database'],
    notification: ['database', 'notifications'],
    alertmanager: ['notifications'],
    receiver: ['notifications'],
  }))
    assert.deepEqual(spec.services[role].networks, networks);
  const { alertmanager, receiver, notification } = spec.services;
  assert.equal(alertmanager.image, lock.images.alertmanager);
  assert.deepEqual(alertmanager.volumes, [
    {
      type: 'bind',
      source: resolve(root, 'local/analytics/alertmanager.fixture.yml'),
      target: '/etc/alertmanager/alertmanager.yml',
      read_only: true,
    },
  ]);
  assert.deepEqual(receiver.command, [
    'local/qualification/product/analytics-receiver.mjs',
  ]);
  assert.equal(receiver.image, spec.services.browser.image);
  assert.equal(receiver.volumes, undefined);
  assert.deepEqual(notification.environment, {
    FLEETIQ_ALERTMANAGER_URL: 'http://alertmanager:9093/api/v2/alerts',
  });
  for (const [role, worker] of Object.entries(
    normalProductWorkers(
      spec.services.backend.labels['com.fleetiq.deploy.owner'],
      spec.services.backend.image,
    ),
  ))
    assert.deepEqual(spec.services[role], worker, 'Normal worker definition drift');
  const archiveRoles = ['archive-client', 'archive-storage', 'archive-worker'];
  assert.equal(spec.services['archive-storage'].image, inputs.objectStorage);
  assert.match(inputs.objectStorage, /^rustfs\/rustfs:1\.0\.4@sha256:[a-f0-9]{64}$/u);
  assert.deepEqual(spec.services['archive-storage'].command, [
    '--address',
    '127.0.0.1:9000',
    '/data',
  ]);
  assert.equal(
    spec.services['archive-storage'].environment.RUSTFS_CONSOLE_ENABLE,
    'false',
  );
  assert.equal(
    spec.services.backend.environment.FLEETIQ_ARCHIVE_ENDPOINT,
    archiveEndpoint,
  );
  assert.equal(spec.services['archive-worker'].image, spec.services.backend.image);
  assert.deepEqual(spec.services['archive-worker'].command, ['archive-worker']);
  assert.equal(
    spec.services['archive-worker'].environment.FLEETIQ_ARCHIVE_ENDPOINT,
    archiveEndpoint,
  );
  const archiveClient = spec.services['archive-client'];
  assert.equal(archiveClient.image, spec.services.browser.image);
  assert.deepEqual(archiveClient.entrypoint, [
    '/bin/bash',
    '/fixture/local/qualification/product/archive-client.sh',
  ]);
  for (const role of ['archive-storage', 'archive-client']) {
    assert.deepEqual(spec.services[role].volumes, [
      {
        type: 'volume',
        source: 'state',
        target: '/run/secrets',
        read_only: true,
        volume: { subpath: 'objects' },
      },
    ]);
  }
  assert.deepEqual(spec.services['archive-storage'].environment, {
    RUSTFS_CONSOLE_ENABLE: 'false',
    RUSTFS_ACCESS_KEY_FILE: '/run/secrets/archive_access_key',
    RUSTFS_SECRET_KEY_FILE: '/run/secrets/archive_secret_key',
  });
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
      : ['archive-client', 'browser', 'issuer', 'receiver'].includes(name)
        ? '1000:1000'
        : '10001:10001';
    if (name !== 'postgres')
      assert.equal(service.user, expectedUser, 'Runtime UID boundary changed');
    assert(service.security_opt.includes('no-new-privileges:true'));
    if (name !== 'postgres') {
      assert(service.read_only);
      assert.deepEqual(service.cap_drop, ['ALL']);
    }
    if (archiveRoles.includes(name)) {
      assert.equal(service.network_mode, 'service:backend');
      assert.equal(service.networks, undefined);
    } else if (!['init', 'artifacts'].includes(name))
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
    'archive-client': ['objects'],
    'archive-storage': ['objects'],
    'archive-worker': ['archive'],
    init: ['root'],
    artifacts: [],
    postgres: ['database'],
    backend: ['backend', 'public'],
    issuer: ['issuer', 'public'],
    edge: ['edge'],
    'normal-edge': ['edge'],
    ingest: ['database'],
    replay: ['database'],
    semantic: ['database'],
    projection: ['database'],
    browser: ['public'],
    analytics: ['database'],
    notification: ['database'],
    alertmanager: [],
    receiver: [],
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
  assert.equal(
    edge.image,
    qualifiedEdge.image,
    'Installed product requires the published edge',
  );
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
  const normalEdge = spec.services['normal-edge'];
  assert.match(normalEdge.image, /^sha256:[a-f0-9]{64}$/u);
  assert.deepEqual(normalEdge.networks, ['application']);
  assert.equal(normalEdge.entrypoint, undefined, 'Use the normal image entrypoint');
  assert.equal(normalEdge.command, undefined);
  assert.deepEqual(normalEdge.volumes, [
    {
      type: 'volume',
      source: 'state',
      target: '/run/tls',
      read_only: true,
      volume: { subpath: 'edge' },
    },
    {
      type: 'bind',
      source: resolve(control, '..', 'normal-edge.Caddyfile'),
      target: '/etc/caddy/Caddyfile',
      read_only: true,
    },
  ]);
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
    'objectStorage',
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
