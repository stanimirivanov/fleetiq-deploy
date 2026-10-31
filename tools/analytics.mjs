import assert from 'node:assert/strict';
import { lstatSync } from 'node:fs';
import { resolve } from 'node:path';
import { composePolicy, lock, ownedPath } from './policy.mjs';
import { root } from './process.mjs';

export const analyticsServices = [
  'analytics-worker',
  'notification-worker',
  'alertmanager',
];

/** Configuration contents are private; validate only the owned regular-file path. */
export function analyticsInstallation(site, qualification = false) {
  const candidate = resolve(site.path, 'alertmanager.yml');
  const stat = lstatSync(candidate);
  assert(
    stat.isFile() && !stat.isSymbolicLink() && stat.size <= 65536,
    'Router configuration must be a bounded private regular file',
  );
  const file = ownedPath(site.path, candidate);
  const compose = (args, options = {}) =>
    site.compose(['--file', resolve(root, 'local/analytics/compose.yaml'), ...args], {
      ...options,
      env: {
        ...options.env,
        FLEETIQ_ALERTMANAGER_IMAGE: lock.images.alertmanager,
        FLEETIQ_ALERTMANAGER_CONFIG_FILE: file,
      },
    });
  const model = JSON.parse(compose(['config', '--format', 'json']));
  analyticsComposePolicy(model, qualification);
  return { ...site, compose, model };
}

/** Reject changes that expose the router, inject secrets or widen worker authority. */
export function analyticsComposePolicy(model, qualification = false) {
  assert.deepEqual(Object.keys(model.services).sort(), [
    'alertmanager',
    'analytics-worker',
    'backend',
    'edge',
    'notification-worker',
    'postgres',
  ]);
  composePolicy(
    {
      ...model,
      services: Object.fromEntries(
        ['backend', 'edge', 'postgres'].map((name) => [name, model.services[name]]),
      ),
    },
    qualification,
  );
  for (const name of analyticsServices) {
    const service = model.services[name];
    assert(
      service &&
        !service.ports?.length &&
        !service.network_mode &&
        !service.privileged &&
        !service.devices &&
        !service.container_name,
    );
    assert.equal(service.user, '10001:10001');
    assert.equal(service.read_only, true);
    assert.deepEqual(service.cap_drop, ['ALL']);
    assert(!service.cap_add?.length);
    assert.deepEqual(service.security_opt, ['no-new-privileges:true']);
    assert(service.mem_limit > 0 && service.pids_limit === 128);
    assert(!service.env_file && !service.build);
    if (name === 'alertmanager') {
      assert.equal(service.image, lock.images.alertmanager);
      assert(!service.environment || Object.keys(service.environment).length === 0);
      assert.deepEqual(service.command, [
        '--config.file=/etc/alertmanager/alertmanager.yml',
        '--storage.path=/alertmanager',
        '--cluster.listen-address=',
        '--web.listen-address=0.0.0.0:9093',
      ]);
      assert.deepEqual(Object.keys(service.networks).sort(), [
        'notifications',
        'receiver-egress',
      ]);
      assert.equal(service.secrets.length, 1);
      assert.equal(service.secrets[0].source, 'alertmanager_configuration');
      assert.equal(service.secrets[0].target, '/etc/alertmanager/alertmanager.yml');
      assert(!service.volumes?.length);
      assert.deepEqual(service.tmpfs, [
        '/alertmanager:size=128m,uid=10001,gid=10001,mode=0700,noexec,nosuid',
      ]);
    } else {
      assert.equal(service.image, model.services.backend.image);
      assert.deepEqual(service.entrypoint, [
        '/bin/bash',
        '/opt/fleetiq/backend-entrypoint.sh',
      ]);
      assert.deepEqual(service.command, [name]);
      assert.deepEqual(
        service.secrets.map((secret) => secret.source),
        ['database_password'],
      );
      assert.deepEqual(
        service.environment ?? {},
        name === 'notification-worker'
          ? { FLEETIQ_ALERTMANAGER_URL: 'http://alertmanager:9093/api/v2/alerts' }
          : {},
      );
      assert.deepEqual(
        Object.keys(service.networks).sort(),
        name === 'notification-worker' ? ['database', 'notifications'] : ['database'],
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
      assert(!service.healthcheck, 'No fake backend health for separate workers');
    }
  }
  assert.equal(model.networks.notifications.internal, true);
  assert.equal(model.networks.database.internal, true);
  return model;
}
