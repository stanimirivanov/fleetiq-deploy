import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { composePolicy } from './policy.mjs';
import { root } from './process.mjs';

export const pipelineServices = ['replay-worker', 'tcp-ingestion'];

export function pipelineEnvironment(settings) {
  const keys = ['tenantId', 'channelId', 'packageId', 'packageVersion'];
  assert(
    settings &&
      typeof settings === 'object' &&
      Object.keys(settings).sort().join(',') ===
        [...keys, 'identityPolicy', 'port'].sort().join(',') &&
      settings.identityPolicy === 'registered-identifiers' &&
      Number.isInteger(settings.port) &&
      settings.port >= 1024 &&
      settings.port <= 65535 &&
      keys.every(
        (key) =>
          typeof settings[key] === 'string' &&
          /^[A-Za-z0-9_.-]{1,128}$/u.test(settings[key]),
      ),
    'Invalid pipeline configuration',
  );
  return {
    FLEETIQ_TCP_PORT: String(settings.port),
    FLEETIQ_TCP_IDENTITY_POLICY: settings.identityPolicy,
    FLEETIQ_TCP_TENANT_ID: settings.tenantId,
    FLEETIQ_TCP_CHANNEL_ID: settings.channelId,
    FLEETIQ_TCP_PACKAGE_ID: settings.packageId,
    FLEETIQ_TCP_PACKAGE_VERSION: settings.packageVersion,
  };
}

export function pipelineInstallation(site, settings, qualification = false) {
  const { FLEETIQ_TCP_PORT: port, ...channel } = pipelineEnvironment(settings);
  const compose = (args, options = {}) =>
    site.compose(['--file', resolve(root, 'local/pipeline/compose.yaml'), ...args], {
      ...options,
      env: { ...options.env, ...channel, FLEETIQ_TCP_PORT: port },
    });
  const model = JSON.parse(compose(['config', '--format', 'json']));
  assert.deepEqual(Object.keys(model.services).sort(), [
    'backend',
    'edge',
    'postgres',
    ...pipelineServices,
  ]);
  const { 'replay-worker': replay, 'tcp-ingestion': tcp, ...base } = model.services;
  composePolicy({ ...model, services: base }, qualification);
  for (const [service, command] of [
    [replay, 'replay-worker'],
    [tcp, 'ingest-tcp'],
  ]) {
    assert.equal(service.image, base.backend.image);
    assert.equal(service.pull_policy, 'never');
    assert.equal(service.user, '10001:10001');
    assert.equal(service.read_only, true);
    assert.deepEqual(service.cap_drop, ['ALL']);
    assert.deepEqual(service.security_opt, ['no-new-privileges:true']);
    assert(
      !service.privileged &&
        !service.devices &&
        !service.cap_add?.length &&
        !service.network_mode &&
        !service.build &&
        !service.env_file,
    );
    assert.deepEqual(service.command, [command]);
    assert.deepEqual(service.entrypoint, [
      '/bin/bash',
      '/opt/fleetiq/backend-entrypoint.sh',
    ]);
    assert.deepEqual(
      Object.keys(service.networks).sort(),
      command === 'ingest-tcp' ? ['database', 'device-ingress'] : ['database'],
    );
    assert.deepEqual(
      service.secrets.map(({ source }) => source),
      ['database_password'],
    );
    assert.deepEqual(service.volumes, [
      {
        type: 'bind',
        source: resolve(root, 'local/backend-entrypoint.sh'),
        target: '/opt/fleetiq/backend-entrypoint.sh',
        read_only: true,
        bind: {},
      },
    ]);
    assert.equal(service.depends_on.backend.condition, 'service_healthy');
    assert.equal(service.pids_limit, 128);
    assert.equal(String(service.mem_limit), '805306368');
  }
  assert.deepEqual(Object.keys(model.networks).sort(), [
    'application',
    'database',
    'device-ingress',
  ]);
  const ingress = model.networks['device-ingress'];
  assert.equal(ingress.driver, 'bridge');
  assert.equal(ingress.labels['com.fleetiq.deploy.owner'], site.owner.id);
  assert(
    !ingress.external &&
      !ingress.internal &&
      !ingress.driver_opts &&
      !ingress.enable_ipv6,
  );
  assert(!replay.ports?.length && !Object.keys(replay.environment ?? {}).length);
  assert.deepEqual(tcp.environment, {
    ...channel,
    FLEETIQ_TCP_BIND_ADDRESS: '0.0.0.0:55027',
  });
  assert.equal(tcp.ports.length, 1);
  assert.equal(tcp.ports[0].host_ip, '127.0.0.1');
  assert.equal(tcp.ports[0].target, 55027);
  assert.equal(tcp.ports[0].published, port);
  assert.equal(tcp.ports[0].protocol, 'tcp');
  return { ...site, compose, model };
}
