import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { lock } from '../policy.mjs';
import { root } from '../process.mjs';
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
  const identity = {
    FLEETIQ_BIND_ADDRESS: '0.0.0.0:8080',
    FLEETIQ_BROWSER_ORIGIN: 'https://fleet.test:8443',
    FLEETIQ_OIDC_ISSUER: 'https://issuer.test:9443',
    FLEETIQ_OIDC_CLIENT_ID: 'fleetiq-qualification',
    FLEETIQ_OIDC_IDENTITY_AUTHORITY: 'qualification-oidc',
    FLEETIQ_OIDC_ADDITIONAL_CA_BUNDLE: '/run/public/ca.crt',
  };
  const services = {
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
      ...backend(['serve'], { identity: true, memory: '512m', environment: identity }),
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
    ingest: backend(['ingest-tcp'], {
      memory: '768m',
      environment: {
        FLEETIQ_TCP_BIND_ADDRESS: '0.0.0.0:55027',
        FLEETIQ_TCP_IDENTITY_POLICY: 'registered-identifiers',
        FLEETIQ_TCP_TENANT_ID: 'tenant-a',
        FLEETIQ_TCP_CHANNEL_ID: 'teltonika-tcp',
        FLEETIQ_TCP_PACKAGE_ID: 'vendor.teltonika',
        FLEETIQ_TCP_PACKAGE_VERSION: 'qualification-1',
      },
    }),
    replay: backend(['replay-worker'], { memory: '768m' }),
    semantic: backend(['semantic-worker']),
    projection: backend(['project-current']),
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
  services.ingest.networks = ['database', 'application'];
  return {
    name,
    services,
    networks: {
      application: { internal: true, labels },
      database: { internal: true, labels },
    },
    volumes: Object.fromEntries(
      ['state', 'database', 'artifacts'].map((key) => [key, { labels }]),
    ),
  };
}
