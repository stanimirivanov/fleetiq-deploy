import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'yaml';
import { lock } from '../policy.mjs';
import { root } from '../process.mjs';
export const productInputs = JSON.parse(
  readFileSync(resolve(root, 'local/qualification/product/inputs.lock.json')),
);
export const archiveEndpoint = 'http://127.0.0.1:9000';
/** Use the local worker recipes with narrowly scoped fixture substitutions. */
export function normalProductWorkers(owner, image) {
  const variables = {
    FLEETIQ_OWNER: owner,
    FLEETIQ_BACKEND_IMAGE: image,
    FLEETIQ_TCP_IDENTITY_POLICY: 'registered-identifiers',
    FLEETIQ_TCP_TENANT_ID: 'tenant-a',
    FLEETIQ_TCP_CHANNEL_ID: 'teltonika-tcp',
    FLEETIQ_TCP_PACKAGE_ID: 'vendor.teltonika',
    FLEETIQ_TCP_PACKAGE_VERSION: 'qualification-1',
    FLEETIQ_TCP_PORT: '55027',
  };
  const read = (path) =>
    parse(readFileSync(resolve(root, path), 'utf8'), { merge: true }).services;
  const pipeline = read('local/pipeline/compose.yaml');
  const analytics = read('local/analytics/compose.yaml');
  return Object.fromEntries(
    Object.entries({
      ingest: pipeline['tcp-ingestion'],
      replay: pipeline['replay-worker'],
      semantic: pipeline['semantic-worker'],
      projection: pipeline['projection-worker'],
      analytics: analytics['analytics-worker'],
      notification: analytics['notification-worker'],
    }).map(([role, source]) => {
      const service = JSON.parse(
        JSON.stringify(source).replace(/\$\{([A-Z_]+):\?[^}]+\}/gu, (_, key) => {
          assert(Object.hasOwn(variables, key), 'Unknown normal worker input');
          return variables[key];
        }),
      );
      assert.deepEqual(service.secrets, ['database_password']);
      assert.deepEqual(service.volumes, [
        './backend-entrypoint.sh:/opt/fleetiq/backend-entrypoint.sh:ro',
      ]);
      delete service.secrets;
      // The browser fixture reaches the TCP listener on an internal network.
      if (role === 'ingest') {
        delete service.ports;
        service.networks = service.networks.map((network) =>
          network === 'device-ingress' ? 'application' : network,
        );
      }
      service.volumes = [
        {
          type: 'bind',
          source: resolve(root, 'local/backend-entrypoint.sh'),
          target: '/opt/fleetiq/backend-entrypoint.sh',
          read_only: true,
        },
        {
          type: 'volume',
          source: 'state',
          target: '/run/secrets',
          read_only: true,
          volume: { subpath: 'database' },
        },
      ];
      return [role, service];
    }),
  );
}

/** Separate CI composition. Never an override of normal fail-closed startup. */
export function productCompose({ name, owner, images, helper, control }) {
  assert.match(name, /^product-[a-f0-9]{16}$/u);
  assert.match(owner, /^[a-f0-9-]{36}$/u);
  const labels = { 'com.fleetiq.deploy.owner': owner };
  const bind = (path, target) => ({
    type: 'bind',
    source: resolve(root, path),
    target,
    read_only: true,
  });
  const state = (subpath, target) => ({
    type: 'volume',
    source: 'state',
    target,
    read_only: true,
    volume: { subpath },
  });
  const restricted = {
    labels,
    init: true,
    read_only: true,
    cap_drop: ['ALL'],
    security_opt: ['no-new-privileges:true'],
    pids_limit: 256,
    stop_grace_period: '15s',
    tmpfs: ['/tmp:size=64m,mode=1777,nosuid'],
    pull_policy: 'never',
  };
  const scripts = [
    bind('local/qualification/product/backend.sh', '/opt/fleetiq/product-backend.sh'),
    bind('local/backend-entrypoint.sh', '/opt/fleetiq/backend-entrypoint.sh'),
  ];
  const backend = (
    command,
    { identity = false, memory = '384m', environment = {} } = {},
  ) => ({
    ...restricted,
    image: images.backend,
    user: '10001:10001',
    entrypoint: ['/bin/bash', '/opt/fleetiq/product-backend.sh'],
    command,
    mem_limit: memory,
    environment,
    networks: identity ? ['database', 'application'] : ['database'],
    volumes: [
      ...scripts,
      state(identity ? 'backend' : 'database', '/run/secrets'),
      state('public', '/run/public'),
    ],
  });
  const archive = {
    FLEETIQ_ARCHIVE_ENDPOINT: archiveEndpoint,
    FLEETIQ_ARCHIVE_BUCKET: 'qualification-archive',
    FLEETIQ_ARCHIVE_REGION: 'us-east-1',
  };
  const worker = backend(['archive-worker'], {
    memory: '256m',
    environment: { ...archive, FLEETIQ_ARCHIVE_TENANT_ID: 'tenant-lifecycle' },
  });
  delete worker.networks;
  worker.network_mode = 'service:backend';
  worker.volumes = [...scripts, state('archive', '/run/secrets')];
  const identity = {
    FLEETIQ_BIND_ADDRESS: '0.0.0.0:8080',
    FLEETIQ_BROWSER_ORIGIN: 'https://fleet.test:8443',
    FLEETIQ_OIDC_ISSUER: 'https://issuer.test:9443',
    FLEETIQ_OIDC_CLIENT_ID: 'fleetiq-qualification',
    FLEETIQ_OIDC_IDENTITY_AUTHORITY: 'qualification-oidc',
    FLEETIQ_OIDC_ADDITIONAL_CA_BUNDLE: '/run/public/ca.crt',
  };
  const services = {
    'archive-storage': {
      ...restricted,
      image: productInputs.objectStorage,
      user: '10001:10001',
      network_mode: 'service:backend',
      command: ['--address', '127.0.0.1:9000', '/data'],
      environment: {
        RUSTFS_CONSOLE_ENABLE: 'false',
        RUSTFS_ACCESS_KEY_FILE: '/run/secrets/archive_access_key',
        RUSTFS_SECRET_KEY_FILE: '/run/secrets/archive_secret_key',
      },
      volumes: [state('objects', '/run/secrets')],
      mem_limit: '1024m',
      tmpfs: [
        ...restricted.tmpfs,
        '/data:size=128m,uid=10001,gid=10001',
        '/logs:size=32m,uid=10001,gid=10001',
      ],
    },
    'archive-worker': worker,
    'archive-client': {
      ...restricted,
      image: helper,
      user: '1000:1000',
      network_mode: 'service:backend',
      entrypoint: [
        '/bin/bash',
        '/fixture/local/qualification/product/archive-client.sh',
      ],
      volumes: [state('objects', '/run/secrets')],
      mem_limit: '128m',
    },
    init: {
      ...restricted,
      image: helper,
      user: '0:0',
      entrypoint: ['/bin/bash', '/fixture/local/qualification/product/init.sh'],
      network_mode: 'none',
      mem_limit: '128m',
      volumes: ['state:/state'],
    },
    artifacts: {
      ...restricted,
      image: images.backend,
      user: '0:0',
      entrypoint: [
        '/bin/bash',
        '-ec',
        'cp /usr/share/fleetiq/qualification/teltonika.wasm /artifacts/teltonika.wasm; chmod 444 /artifacts/teltonika.wasm',
      ],
      network_mode: 'none',
      mem_limit: '64m',
      volumes: ['artifacts:/artifacts'],
    },
    postgres: {
      labels,
      image: lock.images.postgres,
      security_opt: ['no-new-privileges:true'],
      mem_limit: '512m',
      pids_limit: 256,
      environment: {
        POSTGRES_DB: 'fleetiq',
        POSTGRES_USER: 'fleetiq',
        POSTGRES_PASSWORD_FILE: '/run/secrets/database_password',
      },
      networks: ['database'],
      volumes: [
        'database:/var/lib/postgresql',
        state('database', '/run/secrets'),
        bind(
          'local/qualification/product/postgres-initialization.sh',
          '/docker-entrypoint-initdb.d/00-readiness.sh',
        ),
      ],
      healthcheck: {
        test: [
          'CMD',
          'pg_isready',
          '-h',
          '127.0.0.1',
          '-U',
          'fleetiq',
          '-d',
          'fleetiq',
        ],
        interval: '2s',
        timeout: '3s',
        retries: 60,
      },
    },
    backend: {
      ...backend(['serve'], {
        identity: true,
        memory: '512m',
        environment: { ...identity, ...archive },
      }),
      depends_on: {
        postgres: { condition: 'service_healthy' },
        issuer: { condition: 'service_healthy' },
      },
      healthcheck: {
        test: ['CMD', '/usr/local/bin/fleetiq-server', 'healthcheck'],
        interval: '3s',
        timeout: '3s',
        start_period: '10s',
        retries: 60,
      },
    },
    issuer: {
      ...restricted,
      image: helper,
      user: '1000:1000',
      mem_limit: '256m',
      command: ['local/qualification/product/issuer.mjs'],
      networks: { application: { aliases: ['issuer.test'] } },
      volumes: [state('issuer', '/run/issuer'), state('public', '/run/public')],
      healthcheck: {
        test: [
          'CMD',
          'node',
          '--input-type=module',
          '-e',
          `import https from 'node:https';import {readFileSync} from 'node:fs';const r=https.get('https://issuer.test:9443/.well-known/openid-configuration',{ca:readFileSync('/run/public/ca.crt'),timeout:2000},s=>{s.destroy();process.exit(s.statusCode===200?0:1)});r.on('error',()=>process.exit(1));r.on('timeout',()=>{r.destroy();process.exit(1)});`,
        ],
        interval: '2s',
        timeout: '3s',
        start_period: '3s',
        retries: 60,
      },
    },
    edge: {
      ...restricted,
      image: images.edge,
      user: '10001:10001',
      mem_limit: '256m',
      environment: {
        FLEETIQ_PUBLIC_AUTHORITY: 'fleet.test:8443',
        FLEETIQ_API_UPSTREAM: 'backend:8080',
      },
      networks: { application: { aliases: ['fleet.test', 'wrong.test'] } },
      tmpfs: ['/tmp:size=32m,uid=10001,gid=10001,mode=0700,noexec,nosuid,nodev'],
      volumes: [
        state('edge', '/run/tls'),
        bind(
          resolve(control, '..', 'edge.conf.template'),
          '/etc/fleetiq/nginx.conf.template',
        ),
        bind('local/qualification/product/maps', '/fixture/maps'),
      ],
      depends_on: { backend: { condition: 'service_healthy' } },
      healthcheck: {
        test: ['CMD', 'wget', '-q', '-O', '/dev/null', 'http://127.0.0.1:8081/ready'],
        interval: '2s',
        timeout: '3s',
        retries: 60,
      },
    },
    ...normalProductWorkers(owner, images.backend),
    alertmanager: {
      ...restricted,
      image: lock.images.alertmanager,
      user: '10001:10001',
      mem_limit: '128m',
      networks: ['notifications'],
      command: [
        '--config.file=/etc/alertmanager/alertmanager.yml',
        '--storage.path=/alertmanager',
        '--cluster.listen-address=',
      ],
      volumes: [
        bind(
          'local/analytics/alertmanager.fixture.yml',
          '/etc/alertmanager/alertmanager.yml',
        ),
      ],
      tmpfs: ['/alertmanager:size=128m,uid=10001,gid=10001,mode=0700,noexec,nosuid'],
      healthcheck: {
        test: ['CMD', 'wget', '-q', '-O', '/dev/null', 'http://127.0.0.1:9093/-/ready'],
        interval: '2s',
        timeout: '3s',
        retries: 30,
      },
    },
    receiver: {
      ...restricted,
      image: helper,
      user: '1000:1000',
      mem_limit: '128m',
      networks: ['notifications'],
      command: ['local/qualification/product/analytics-receiver.mjs'],
    },
    browser: {
      ...restricted,
      image: helper,
      user: '1000:1000',
      mem_limit: '1536m',
      shm_size: '256m',
      tmpfs: [
        ...restricted.tmpfs,
        '/home/pwuser:size=64m,uid=1000,gid=1000,mode=0700,nosuid',
      ],
      environment: { HOME: '/home/pwuser' },
      command: ['local/qualification/product/scenario.mjs'],
      networks: ['application'],
      volumes: [
        state('public', '/run/public'),
        'artifacts:/artifacts:ro',
        { type: 'bind', source: control, target: '/control' },
      ],
    },
  };
  return {
    name,
    services,
    networks: {
      application: { internal: true, labels },
      database: { internal: true, labels },
      notifications: { internal: true, labels },
    },
    volumes: Object.fromEntries(
      ['state', 'database', 'artifacts'].map((key) => [key, { labels }]),
    ),
  };
}
