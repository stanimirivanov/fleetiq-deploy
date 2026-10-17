import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { expectedWorkflow, verifyWorkflow } from '../ci.mjs';
import {
  composePolicy,
  config,
  identityKeys,
  lock,
  ownedPath,
  validateLock,
} from '../policy.mjs';
import { root } from '../process.mjs';

const settings = {
  httpsPort: 58443,
  oidc: {
    issuer: 'https://provider.example/realm',
    clientId: 'fleetiq',
    authority: 'development-oidc',
  },
};
test('complete provider-neutral HTTPS configuration; malformed and partial forms fail', () => {
  assert.equal(config(settings), settings);
  for (const change of [
    (v) => {
      delete v.oidc.issuer;
    },
    (v) => {
      v.httpsPort = 5432.5;
    },
    (v) => {
      v.httpsPort = 80;
    },
    (v) => {
      v.oidc.issuer = 'http://provider.example';
    },
    (v) => {
      v.oidc.issuer = 'https://user:secret@provider.example';
    },
    (v) => {
      v.oidc.issuer = 'https://provider.example/?secret=value';
    },
    (v) => {
      v.oidc.clientId = '';
    },
    (v) => {
      v.databasePassword = 'unwanted';
    },
  ]) {
    const value = structuredClone(settings);
    change(value);
    assert.throws(() => config(value));
  }
});
test('artifact pins reject drift and mutable inputs', () => {
  validateLock();
  for (const change of [
    (v) => {
      v.sources.platform.commit = 'main';
    },
    (v) => {
      v.images.edge = 'caddy:latest';
    },
    (v) => {
      v.sources.platform.repository = 'https://attacker.example/source.git';
    },
    (v) => {
      v.tools.pnpm = 'latest';
    },
    (v) => {
      v.images.extra = v.images.node;
    },
  ]) {
    const value = structuredClone(lock);
    change(value);
    assert.throws(() => validateLock(value));
  }
});
function model(qualification = false) {
  const labels = { 'com.fleetiq.deploy.owner': '12345678-1234-1234-1234-123456789abc' };
  const restricted = {
    image: `sha256:${'a'.repeat(64)}`,
    user: '10001:10001',
    read_only: true,
    cap_drop: ['ALL'],
    security_opt: ['no-new-privileges:true'],
    volumes: [],
    labels,
  };
  return {
    services: {
      postgres: { image: lock.images.postgres, networks: { database: {} }, labels },
      backend: {
        ...structuredClone(restricted),
        networks: { application: {}, database: {} },
        environment: qualification
          ? {}
          : Object.fromEntries(identityKeys.map((k) => [k, 'configured'])),
      },
      edge: {
        ...structuredClone(restricted),
        networks: { application: {} },
        ports: [{ host_ip: '127.0.0.1', target: 8443 }],
      },
    },
    volumes: { database: { labels }, certificates: { labels } },
    networks: { application: { labels }, database: { internal: true, labels } },
  };
}
test('rendered Compose sensor rejects exposure, privilege, auth-mode and ownership mutations', () => {
  composePolicy(model());
  composePolicy(model(true), true);
  for (const change of [
    (v) => {
      v.services.backend.ports = [{ published: '8080' }];
    },
    (v) => {
      v.services.postgres.ports = [{ published: '5432' }];
    },
    (v) => {
      v.services.edge.ports[0].host_ip = '0.0.0.0';
    },
    (v) => {
      v.services.backend.privileged = true;
    },
    (v) => {
      v.services.backend.user = '0:0';
    },
    (v) => {
      v.services.edge.cap_drop = [];
    },
    (v) => {
      v.services.edge.cap_add = ['NET_BIND_SERVICE'];
    },
    (v) => {
      v.services.edge.security_opt.push('seccomp=unconfined');
    },
    (v) => {
      v.services.backend.read_only = false;
    },
    (v) => {
      v.services.backend.tmpfs = ['/tmp:size=16m', 'mode=1777', 'noexec', 'nosuid'];
    },
    (v) => {
      v.networks.database.internal = false;
    },
    (v) => {
      v.services.edge.networks.database = {};
    },
    (v) => {
      v.services.backend.environment.DATABASE_URL = 'unexpected';
    },
    (v) => {
      delete v.services.backend.environment.FLEETIQ_OIDC_ISSUER;
    },
    (v) => {
      v.services.edge.environment = { FLEETIQ_API_UPSTREAM: 'proxy-probe:8080' };
    },
    (v) => {
      v.services.backend.labels = {};
    },
    (v) => {
      v.services.backend.volumes = [{ type: 'bind', read_only: false }];
    },
  ]) {
    const value = model();
    change(value);
    assert.throws(() => composePolicy(value));
  }
  assert.throws(() => composePolicy(model(), true));
  assert.throws(() => composePolicy(model(true)));
});
test('CI parity covers omitted checks, conditional skips, weakened permissions and unreviewed action versions', () => {
  verifyWorkflow();
  verifyWorkflow(expectedWorkflow.replaceAll('\n', '\r\n'));
  for (const replacement of [
    ['pnpm check', 'echo skipped'],
    ['actions/checkout@v7', `actions/checkout@${'a'.repeat(40)}`],
    ['actions/setup-node@v7', 'actions/setup-node@v8'],
    ['include-hidden-files: true', 'include-hidden-files: false'],
    ['node tools/ci-evidence.mjs structural', 'echo evidence-skipped'],
    [
      'npm install --global pnpm@12.5.1',
      'npm install --global pnpm@12.5.1 --ignore-scripts',
    ],
    ['contents: read', 'contents: write'],
    ['on:\n  pull_request:', 'on:\n  push:'],
    ['pnpm qualify', 'pnpm test'],
    ['timeout-minutes: 15', 'continue-on-error: true\n    timeout-minutes: 15'],
  ])
    assert.throws(() => verifyWorkflow(expectedWorkflow.replace(...replacement)));
});
test('owned paths cannot target parents or sibling repositories', () => {
  assert.equal(
    ownedPath(root, resolve(root, 'package.json')),
    resolve(root, 'package.json'),
  );
  assert.throws(() => ownedPath(root, root));
  assert.throws(() => ownedPath(root, resolve(root, '../fleetiq-platform')));
});
test('qualification override removes each identity setting instead of setting empty values', () => {
  const override = readFileSync(
    resolve(root, 'local/qualification/compose.yaml'),
    'utf8',
  );
  for (const key of identityKeys) assert(override.includes(`${key}: !reset null`));
});
