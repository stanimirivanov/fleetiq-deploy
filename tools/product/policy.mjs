import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { requiredChecks } from '../../local/qualification/product/contract.mjs';
import { lock } from '../policy.mjs';
import { root } from '../process.mjs';
export const inputs = JSON.parse(
  readFileSync(resolve(root, 'local/qualification/product/inputs.lock.json')),
);
export function productPolicy(spec) {
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
  assert.deepEqual(spec.services.artifacts.network_mode, 'none');
  assert.deepEqual(spec.services.browser.networks, ['application']);
  assert.deepEqual(spec.services.postgres.networks, ['database']);
  assert.equal(spec.services.postgres.image, lock.images.postgres);
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
