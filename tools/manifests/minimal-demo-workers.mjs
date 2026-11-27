import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { root } from '../process.mjs';
import { validateBackendSelection } from './minimal-demo-data.mjs';
import { application, demoNamespaces } from './minimal-demo-network.mjs';
import { documents, validateSchemas } from './render.mjs';
import { toolsLock } from './toolchain.mjs';
import { workloadDatabaseEnv } from './workload-database.mjs';

const ingestRouteKeys = [
  'FLEETIQ_TCP_TENANT_ID',
  'FLEETIQ_TCP_CHANNEL_ID',
  'FLEETIQ_TCP_PACKAGE_ID',
  'FLEETIQ_TCP_PACKAGE_VERSION',
  'FLEETIQ_TCP_IDENTIFIER_AUTHORITY',
];

const configMapEnv = (name, configMap, optional = {}) => ({
  name,
  valueFrom: { configMapKeyRef: { name: configMap, key: name, ...optional } },
});

export function checkMinimalDemoWorkers(tools, consumer) {
  const namespace = demoNamespaces(consumer).apps;
  const environment = resolve(root, 'environments/minimal-demo');
  const backendPath = resolve(environment, 'backend.json');
  const { backend } = validateBackendSelection(
    JSON.parse(readFileSync(backendPath, 'utf8')),
  );
  const [{ workloadDatabase }] = documents(
    readFileSync(resolve(environment, 'runtime.yaml'), 'utf8'),
  );
  const render = (operation) =>
    documents(
      tools.helm([
        'template',
        'fleetiq',
        resolve(root, 'charts/fleetiq-minimal-demo-operations'),
        '--namespace',
        namespace,
        '--kube-version',
        toolsLock.kubernetes,
        '--set',
        `operation=${operation}`,
        '--set-file',
        `backend=${backendPath}`,
      ]),
    );
  const runtime = render('workers');
  assert.equal(runtime.length, 4, 'Unexpected demo worker inventory');
  for (const role of ['ingest-tcp', 'replay-worker']) {
    const labels = application(role);
    const name = labels['app.kubernetes.io/name'];
    const deployment = runtime.find(
      (item) => item.kind === 'Deployment' && item.metadata.name === name,
    );
    const account = runtime.find(
      (item) => item.kind === 'ServiceAccount' && item.metadata.name === name,
    );
    assert(
      deployment && account,
      'Both demo writer controllers and accounts are required',
    );
    assert.equal(account.automountServiceAccountToken, false);
    assert.equal(account.metadata.namespace, namespace);
    assert.equal(deployment.metadata.namespace, namespace);
    const { spec } = deployment;
    assert.equal(spec.replicas, 1);
    assert.deepEqual(spec.strategy, { type: 'Recreate' });
    assert.deepEqual(spec.selector, { matchLabels: labels });
    assert.deepEqual(spec.template.metadata.labels, labels);
    const pod = spec.template.spec;
    assert.equal(pod.automountServiceAccountToken, false);
    assert.equal(pod.serviceAccountName, name);
    assert.equal(pod.initContainers, undefined);
    assert.equal(pod.containers.length, 1);
    const [container] = pod.containers;
    assert.deepEqual(container.command, ['/usr/local/bin/fleetiq-server']);
    assert.deepEqual(container.args, [role]);
    assert.equal(container.image, backend.reference);
    assert.equal(pod.enableServiceLinks, false);
    assert.equal(container.envFrom, undefined);
    const expectedEnv = [workloadDatabaseEnv(workloadDatabase.workloads, role)];
    if (role === 'ingest-tcp') {
      expectedEnv.push(
        configMapEnv('FLEETIQ_TCP_BIND_ADDRESS', 'fleetiq-ingest-tcp-network'),
        { name: 'FLEETIQ_TCP_IDENTITY_POLICY', value: 'registered-identifiers' },
        ...ingestRouteKeys.map((key) =>
          configMapEnv(
            key,
            'fleetiq-ingest-tcp-route',
            key === 'FLEETIQ_TCP_IDENTIFIER_AUTHORITY' ? { optional: true } : {},
          ),
        ),
      );
    }
    assert.deepEqual(container.env, expectedEnv);
    assert.deepEqual(pod.volumes, [
      {
        name: 'database-ca',
        configMap: {
          name: 'workload-database-ca',
          items: [{ key: 'ca.crt', path: 'ca.crt' }],
        },
      },
    ]);
    assert.deepEqual(container.volumeMounts, [
      { name: 'database-ca', mountPath: '/etc/fleetiq/database', readOnly: true },
    ]);
  }
  const maintenance = render('workers-maintenance');
  const stopped = structuredClone(runtime);
  for (const item of stopped.filter(({ kind }) => kind === 'Deployment'))
    item.spec.replicas = 0;
  assert.deepEqual(maintenance, stopped, 'Every demo worker must stop in maintenance');
  return {
    runtimeSchemas: validateSchemas(tools, runtime),
    maintenanceSchemas: validateSchemas(tools, maintenance),
  };
}
