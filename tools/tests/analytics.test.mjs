import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { parse } from 'yaml';
import { analyticsInstallation } from '../analytics.mjs';
import { manifestPolicy } from '../manifests/policy.mjs';
import { renderFixture, validateSchemas } from '../manifests/render.mjs';
import { manifestTools } from '../manifests/toolchain.mjs';
import { lock, sourceCompose } from '../policy.mjs';
import { root } from '../process.mjs';
import { catalogue } from '../verification-catalogue.mjs';

const tools = manifestTools();
const enabled = renderFixture(tools, { analytics: true });
const find = (items, kind, name) =>
  items.find((item) => item.kind === kind && item.metadata.name === `fleetiq-${name}`);

test('default composition never starts analytics or exposes a router', () => {
  assert.deepEqual(Object.keys(sourceCompose().services).sort(), [
    'backend',
    'edge',
    'postgres',
  ]);
  assert(
    !renderFixture(tools).some((item) => item.metadata.name === 'fleetiq-alertmanager'),
  );
  assert.throws(() =>
    analyticsInstallation({ path: resolve(root, '.local/nonexistent-analytics-test') }),
  );
  assert(catalogue.docker.includes('analytics-routing'));
  assert(catalogue.acceptance.includes('analytics-routing'));
});

test('native Helm and schemas qualify opt-in, nonlocal, maintenance and alternate namespace', () => {
  for (const extra of [
    {},
    { maintenance: true },
    { nonlocal: true },
    { applicationNamespace: 'fleetiq-apps' },
    { providerLocal: true },
  ]) {
    const state = { analytics: true, ...extra };
    const items = renderFixture(tools, state);
    assert.equal(validateSchemas(tools, items), extra.providerLocal ? 30 : 29);
    manifestPolicy(items, state);
    for (const name of ['analytics-worker', 'notification-worker', 'alertmanager'])
      assert.equal(
        find(items, 'Deployment', name).spec.replicas,
        extra.maintenance ? 0 : 1,
      );
  }
});

for (const [label, mutate] of [
  [
    'public router',
    (items) => {
      find(items, 'Service', 'alertmanager').spec.type = 'LoadBalancer';
    },
  ],
  [
    'inline router credential',
    (items) => {
      find(items, 'Deployment', 'alertmanager').spec.template.spec.containers[0].env = [
        { name: 'TOKEN', value: 'synthetic-fixture' },
      ];
    },
  ],
  [
    'worker DDL',
    (items) => {
      find(
        items,
        'Deployment',
        'analytics-worker',
      ).spec.template.spec.containers[0].args = ['migrate'];
    },
  ],
  [
    'secret value leak',
    (items) => {
      find(
        items,
        'Deployment',
        'notification-worker',
      ).spec.template.spec.containers[0].env[0] = {
        name: 'DATABASE_URL',
        value: 'synthetic-fixture',
      };
    },
  ],
  [
    'fake worker HTTP readiness',
    (items) => {
      find(
        items,
        'Deployment',
        'notification-worker',
      ).spec.template.spec.containers[0].readinessProbe = {
        httpGet: { path: '/health/ready', port: 8080 },
      };
    },
  ],
  [
    'worker external destination',
    (items) => {
      find(
        items,
        'Deployment',
        'notification-worker',
      ).spec.template.spec.containers[0].env[1].value =
        'https://unreviewed.invalid/api/v2/alerts';
    },
  ],
  [
    'router broad egress',
    (items) => {
      find(items, 'NetworkPolicy', 'alertmanager').spec.egress[1].to = [
        { ipBlock: { cidr: '0.0.0.0/0' } },
      ];
    },
  ],
  [
    'analytics router access',
    (items) => {
      find(items, 'NetworkPolicy', 'analytics-worker').spec.egress.push({
        to: [{ podSelector: {} }],
        ports: [{ protocol: 'TCP', port: 9093 }],
      });
    },
  ],
  [
    'worker token mount',
    (items) => {
      find(
        items,
        'Deployment',
        'analytics-worker',
      ).spec.template.spec.automountServiceAccountToken = true;
    },
  ],
]) {
  test(`rendered analytics policy rejects ${label}`, () => {
    const items = structuredClone(enabled);
    mutate(items);
    assert.throws(() => manifestPolicy(items, { analytics: true }));
  });
}
for (const alertmanager of [
  { image: 'prom/alertmanager:latest' },
  { configurationSecret: '' },
  { receiverCidrs: [] },
  { receiverCidrs: ['0.0.0.0/0'] },
  { receiverCidrs: ['999.0.2.1/32'] },
  { token: 'synthetic-fixture' },
]) {
  test(`real Helm rejects incomplete or unsafe router inputs ${JSON.stringify(alertmanager)}`, () => {
    assert.throws(() =>
      renderFixture(tools, { runtime: { analytics: { enabled: true, alertmanager } } }),
    );
  });
}

test('optional local profile has private mounts, isolated workers and no recipient in defaults', () => {
  const overlay = parse(
    readFileSync(resolve(root, 'local/analytics/compose.yaml'), 'utf8'),
    { merge: true },
  );
  assert.deepEqual(Object.keys(overlay.services).sort(), [
    'alertmanager',
    'analytics-worker',
    'notification-worker',
  ]);
  for (const service of Object.values(overlay.services)) {
    assert(!service.ports && !service.privileged && service.read_only);
    assert.equal(service.user, '10001:10001');
  }
  assert.equal(overlay.networks.notifications.internal, true);
  assert.deepEqual(overlay.services['analytics-worker'].networks, ['database']);
  assert.deepEqual(overlay.services['notification-worker'].networks, [
    'database',
    'notifications',
  ]);
  assert(!overlay.services['notification-worker'].healthcheck);
  const fixture = parse(
    readFileSync(resolve(root, 'local/analytics/alertmanager.fixture.yml'), 'utf8'),
  );
  assert.equal(
    fixture.receivers[0].webhook_configs[0].url,
    'http://receiver:9094/alerts',
  );
  assert.equal(fixture.receivers[0].webhook_configs[0].send_resolved, true);
  assert.match(
    lock.images.alertmanager,
    /^prom\/alertmanager:v0\.34\.2@sha256:[a-f0-9]{64}$/u,
  );
});

test('real synthetic receiver bounds and rejects payloads without forwarding contents', async () => {
  const { receiver } = await import('../../local/analytics/receiver.mjs');
  const server = receiver();
  await new Promise((ready) => server.listen(0, '127.0.0.1', ready));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const status of ['firing', 'resolved']) {
      const response = await fetch(`${base}/alerts`, {
        method: 'POST',
        body: JSON.stringify({ status, alerts: [] }),
      });
      assert.equal(response.status, 200);
    }
    assert.deepEqual(await (await fetch(`${base}/state`)).json(), {
      firing: 1,
      resolved: 1,
    });
    assert.equal(
      (await fetch(`${base}/alerts`, { method: 'POST', body: 'invalid' })).status,
      400,
    );
    assert.equal((await fetch(`${base}/unknown`)).status, 404);
    assert.equal(
      (await fetch(`${base}/alerts`, { method: 'POST', body: 'x'.repeat(65537) }))
        .status,
      413,
    );
  } finally {
    await new Promise((done) => server.close(done));
  }
});
