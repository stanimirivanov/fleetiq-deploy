import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import test from 'node:test';
import { documents } from '../manifests/render.mjs';
import { manifestTools, toolsLock } from '../manifests/toolchain.mjs';
import { root } from '../process.mjs';

const tools = manifestTools();

const dataArgs = [
  'template',
  'fleetiq',
  resolve(root, 'charts/fleetiq-data'),
  '--namespace',
  'qual-fleet-data',
  '--kube-version',
  toolsLock.kubernetes,
  '--values',
  resolve(root, 'environments/minimal-demo/data.yaml'),
];

for (const [phase, tempLogin, runtimeLogins] of [
  ['migration', 'fleetiq_migrator', 0],
  ['bootstrap', 'fleetiq_bootstrap_platform_operator', 0],
  ['runtime', null, 8],
]) {
  test(`the demo's ${phase} phase exposes only its intended database logins`, () => {
    const rendered = documents(
      tools.helm([
        ...dataArgs,
        '--values',
        resolve(root, `environments/minimal-demo/${phase}.yaml`),
      ]),
    );
    assert.deepEqual([...new Set(rendered.map(({ kind }) => kind))].sort(), [
      'Cluster',
      'DatabaseRole',
    ]);
    const cluster = rendered.find(({ kind }) => kind === 'Cluster');
    assert.equal(cluster.metadata.namespace, 'qual-fleet-data');
    assert.equal(cluster.spec.resources.limits.memory, '768Mi');
    assert.equal(cluster.spec.postgresql.parameters.max_connections, '64');
    assert.deepEqual(cluster.spec.storage, {
      storageClass: 'local-retained',
      size: '4Gi',
    });
    assert.equal(cluster.metadata.annotations['helm.sh/resource-policy'], 'keep');
    assert.equal(
      cluster.metadata.annotations['argocd.argoproj.io/sync-options'],
      'Prune=false,Delete=false',
    );
    assert.deepEqual(
      cluster.spec.postgresql.pg_hba,
      tempLogin
        ? [`hostssl fleetiq ${tempLogin} all scram-sha-256`, 'host all all all reject']
        : ['hostnossl all all all reject', 'hostssl all all all scram-sha-256'],
    );
    const roles = [
      ...cluster.spec.managed.roles,
      ...rendered.filter(({ kind }) => kind === 'DatabaseRole').map(({ spec }) => spec),
    ];
    assert.equal(roles.length, 11);
    for (const role of roles) {
      assert.equal(Boolean(role.passwordSecret), role.login);
      assert.equal(Boolean(role.disablePassword), !role.login);
    }
    assert.equal(
      roles.filter(({ login }) => login).length,
      runtimeLogins + Number(Boolean(tempLogin)),
    );
    assert.equal(roles.find(({ name }) => name === 'fleetiq_runtime').login, false);
    for (const identity of [
      'fleetiq_migrator',
      'fleetiq_bootstrap_platform_operator',
    ]) {
      assert.equal(
        roles.find(({ name }) => name === identity).login,
        identity === tempLogin,
      );
    }
  });
}

const operations = resolve(root, 'environments/minimal-demo/operations');
const pin = resolve(root, 'environments/minimal-demo/backend.json');

test('bootstrap renders a checked operation for the exact data Job delegation', () => {
  const [carrier] = documents(
    tools.helm([
      'template',
      'demo-bootstrap-01',
      operations,
      '--namespace',
      'qual-fleet-data',
      '--kube-version',
      toolsLock.kubernetes,
      '--set',
      'operation=bootstrap',
      '--set-file',
      `backend=${pin}`,
    ]),
  );
  const operation = JSON.parse(carrier.data['operation.json']);
  assert.equal(operation.name, 'demo-bootstrap-01');
  assert.equal(operation.namespace, 'qual-fleet-data');
  assert.equal(operation.deadlineSeconds, 300);
  assert.equal(operation.podSpec.initContainers, undefined);
  assert.equal(operation.podSpec.containers.length, 1);
  const [container] = operation.podSpec.containers;
  assert.deepEqual(container.args, ['bootstrap-platform-operator', '--check-schema']);
  assert.equal(container.imagePullPolicy, 'Never');
  assert.deepEqual(
    container.env.map(({ name, valueFrom }) => [name, valueFrom.secretKeyRef]),
    [
      [
        'DATABASE_URL',
        { name: 'fleetiq-db-bootstrap-platform-operator-url', key: 'url' },
      ],
      ...[
        'FLEETIQ_BOOTSTRAP_ACTOR_ID',
        'FLEETIQ_BOOTSTRAP_AUTHORITY_ID',
        'FLEETIQ_BOOTSTRAP_EXTERNAL_SUBJECT',
      ].map((name) => [name, { name: 'fleetiq-bootstrap-operator', key: name }]),
    ],
  );
  assert.equal(operation.podSpec.volumes[0].configMap.name, 'workload-database-ca');
  assert.equal(container.volumeMounts[0].readOnly, true);
});

const attempt = 'demo-launch-0123456789abcdef01234567';
test('the bootstrap route binds both the approved digest label and runtime ServiceAccount', () => {
  const rendered = documents(
    tools.helm([
      'template',
      'fleetiq',
      operations,
      '--namespace',
      'qual-fleet-data',
      '--kube-version',
      toolsLock.kubernetes,
      '--set',
      `operation=bootstrap-route,attempt=${attempt}`,
    ]),
  );
  assert.equal(rendered.length, 2);
  const [{ spec: client }, { spec: database }] = rendered;
  const labels = {
    'k8s-infrastructure.io/demo-attempt': attempt,
    'io.cilium.k8s.policy.serviceaccount': attempt.replace('launch', 'run'),
  };
  assert.deepEqual(client.endpointSelector.matchLabels, labels);
  assert.deepEqual(database.ingress[0].fromEndpoints[0].matchLabels, {
    ...labels,
    'k8s:io.kubernetes.pod.namespace': 'qual-fleet-data',
  });
  assert.deepEqual(database.ingress[0].toPorts[0].ports, [
    { port: '5432', protocol: 'TCP' },
  ]);
});

const phaseValues = (phase) => [
  '--values',
  resolve(root, `environments/minimal-demo/${phase}.yaml`),
];
for (const flags of [[], ['--skip-schema-validation']]) {
  const validation = flags.length
    ? 'without schema validation'
    : 'with schema validation';
  test(`shared data chart requires explicit, scoped external network authority ${validation}`, () => {
    for (const selection of [
      ['--set', 'externalNetworkPolicies=false'],
      ['--set', 'workloadDatabase.retireLegacy=false'],
      ['--set', 'profile=nonlocal,instances=3'],
    ]) {
      assert.throws(() =>
        tools.helm([...dataArgs, ...phaseValues('runtime'), ...flags, ...selection]),
      );
    }
  });

  test(`the database cannot enter runtime with empty workload selection ${validation}`, () => {
    assert.throws(() =>
      tools.helm([
        ...dataArgs,
        ...phaseValues('runtime'),
        ...flags,
        '--set-json',
        'workloadDatabase.workloads=[]',
      ]),
    );
  });
}
