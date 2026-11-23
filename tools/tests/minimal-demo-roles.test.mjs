import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import test from 'node:test';
import { qualifyMinimalDemoRoles } from '../manifests/minimal-demo-roles-probe.mjs';
import { root, run } from '../process.mjs';

const runProfile = (phase, ...flags) =>
  JSON.parse(
    run(process.execPath, [
      resolve(root, 'tools/manifests/minimal-demo-roles-render.mjs'),
      'qual-fleet',
      phase,
      ...flags,
    ]),
  );

test('installation rendering isolates each database credential and retains withdrawn identities', () => {
  const roles = [
    'fleetiq_serve',
    'fleetiq_ingest_tcp',
    'fleetiq_replay_worker',
    'fleetiq_semantic_worker',
    'fleetiq_project_current',
    'fleetiq_analytics_worker',
    'fleetiq_notification_worker',
    'fleetiq_archive_worker',
  ];
  const { cluster, clients, backendSelection, candidate } = runProfile('installation');
  assert.equal(cluster.metadata.namespace, 'qual-fleet-data');
  assert.equal(cluster.spec.postgresql.parameters.max_connections, '64');
  assert.deepEqual(cluster.spec.postgresql.pg_hba, [
    'hostnossl all all all reject',
    'hostssl fleetiq all all scram-sha-256',
    'host all all all reject',
  ]);
  assert.equal(cluster.spec.enableSuperuserAccess, false);
  assert.deepEqual(cluster.spec.storage, {
    storageClass: 'local-retained',
    size: '4Gi',
  });
  assert.match(backendSelection.backend.reference, /@sha256:[a-f0-9]{64}$/u);
  const provisioned = cluster.spec.managed.roles;
  assert.deepEqual(
    provisioned.map(({ name }) => name).sort(),
    [...roles, 'fleetiq_migrator', 'fleetiq_bootstrap_platform_operator'].sort(),
  );
  assert.equal(
    new Set(
      provisioned.flatMap(({ passwordSecret }) =>
        passwordSecret ? [passwordSecret.name] : [],
      ),
    ).size,
    1,
  );
  for (const role of provisioned) {
    assert.equal(role.login, role.name === 'fleetiq_migrator');
    assert.equal(role.superuser, false);
    assert.equal(role.inherit, false);
    assert.deepEqual(role.inRoles, []);
  }
  const credentialRefs = Object.values(clients).map(
    ({ env }) => env[0].valueFrom.secretKeyRef.name,
  );
  assert.deepEqual(credentialRefs, ['fleetiq-db-migrator-url']);
  const bootstrap = runProfile('bootstrap');
  assert.deepEqual(
    bootstrap.cluster.spec.managed.roles
      .filter(({ login }) => login)
      .map(({ name }) => name),
    ['fleetiq_bootstrap_platform_operator'],
  );
  assert(bootstrap.clients['bootstrap-platform-operator --check-schema']);
  assert.equal(bootstrap.clients.migrate, undefined);
  assert(
    Object.values(clients).every(({ volumeMounts }) =>
      volumeMounts.some(
        ({ mountPath, readOnly }) =>
          mountPath === '/etc/fleetiq/database' && readOnly === true,
      ),
    ),
  );
  const {
    cluster: after,
    clients: afterClients,
    candidate: runtimeCandidate,
  } = runProfile('runtime');
  assert.equal(runtimeCandidate, candidate);
  assert.equal(bootstrap.candidate, candidate);
  assert.deepEqual(
    after.spec.managed.roles
      .filter(({ login }) => !login)
      .map(({ name }) => name)
      .sort(),
    ['fleetiq_bootstrap_platform_operator', 'fleetiq_migrator'],
  );
  assert.equal(Object.values(afterClients).length, 8);
  assert.equal(
    new Set(
      Object.values(afterClients).map(({ env }) => env[0].valueFrom.secretKeyRef.name),
    ).size,
    8,
  );
  assert.deepEqual(
    after.spec.managed.roles
      .filter(({ login }) => login)
      .map(({ name }) => name)
      .sort(),
    roles.sort(),
  );
  assert.deepEqual(after.spec.bootstrap, cluster.spec.bootstrap);
});

test('data Job route requires the exact provider attempt and runtime ServiceAccount', () => {
  const attempt = 'demo-launch-0123456789ab0123456789ab';
  const { policies, candidate } = runProfile('installation', attempt);
  assert.equal(candidate, runProfile('runtime').candidate);
  assert.equal(policies.length, 2);
  assert(policies.every(({ metadata }) => metadata.namespace === 'qual-fleet-data'));
  const [egress, ingress] = policies;
  for (const selector of [
    egress.spec.endpointSelector,
    ingress.spec.ingress[0].fromEndpoints[0],
  ]) {
    assert.equal(selector.matchLabels['k8s-infrastructure.io/demo-attempt'], attempt);
    assert.equal(
      selector.matchLabels['io.cilium.k8s.policy.serviceaccount'],
      'demo-run-0123456789ab0123456789ab',
    );
  }
  assert.deepEqual(
    egress.spec.egress
      .flatMap(({ toPorts }) => toPorts[0].ports)
      .map(({ port, protocol }) => `${protocol}/${port}`),
    ['UDP/53', 'TCP/53', 'TCP/5432'],
  );
  assert.deepEqual(ingress.spec.ingress[0].toPorts[0].ports, [
    { port: '5432', protocol: 'TCP' },
  ]);
  assert.throws(() => runProfile('runtime', attempt));
  assert.throws(() => runProfile('installation', 'unscoped'));
});

const digest = (digit) => `sha256:${digit.repeat(64)}`;
const objectUid = (digit) =>
  `${digit.repeat(8)}-${digit.repeat(4)}-${digit.repeat(4)}-${digit.repeat(4)}-${digit.repeat(12)}`;
const ready = [{ type: 'Ready', status: 'True' }];

function reviewedRuntime() {
  const profile = runProfile('runtime');
  const namespace = 'qual-fleet-data';
  const primary = 'fleetiq-db-1';
  const volumeName = 'pv-fleetiq-db-1';
  const namespaceNames = {
    apps: 'qual-fleet-apps',
    data: namespace,
    support: 'qual-fleet-demo-support',
    system: 'kube-system',
  };
  const target = {
    name: 'qual-fleet-local',
    namespaceUids: {
      apps: objectUid('a'),
      data: objectUid('b'),
      support: objectUid('c'),
      system: objectUid('d'),
    },
    workerUid: objectUid('e'),
    clusterUid: objectUid('f'),
    podUid: objectUid('1'),
    claimUid: objectUid('2'),
    volumeUid: objectUid('3'),
  };
  const request = {
    consumer: 'qual-fleet',
    target,
    stage: 'runtime',
    candidate: profile.candidate,
    caDigest: digest('9'),
    port: 15432,
  };
  const objects = Object.fromEntries(
    Object.entries(namespaceNames).map(([role, name]) => [
      `namespace/${name}`,
      {
        metadata: {
          name,
          uid: target.namespaceUids[role],
          labels: {
            'kubernetes.io/metadata.name': name,
            'k8s-infrastructure.io/consumer': 'qual-fleet',
          },
        },
        status: { phase: 'Active' },
      },
    ]),
  );
  const worker = `${target.name}-worker`;
  objects[`node/${worker}`] = {
    metadata: {
      name: worker,
      uid: target.workerUid,
      labels: {
        'k8s-infrastructure.io/consumer': 'qual-fleet',
        'k8s-infrastructure.io/role': 'worker',
      },
    },
    status: {
      conditions: ready,
      nodeInfo: { architecture: 'amd64', operatingSystem: 'linux' },
    },
  };
  const cluster = structuredClone(profile.cluster);
  cluster.metadata.uid = target.clusterUid;
  cluster.status = {
    currentPrimary: primary,
    readyInstances: 1,
    conditions: ready,
    managedRolesStatus: {
      byStatus: { reconciled: cluster.spec.managed.roles.map(({ name }) => name) },
    },
  };
  objects['clusters.postgresql.cnpg.io/fleetiq-db'] = cluster;
  objects[`pod/${primary}`] = {
    metadata: {
      name: primary,
      namespace,
      uid: target.podUid,
      ownerReferences: [
        {
          kind: 'Cluster',
          name: 'fleetiq-db',
          uid: target.clusterUid,
          controller: true,
        },
      ],
    },
    spec: {
      nodeName: worker,
      volumes: [{ name: 'pgdata', persistentVolumeClaim: { claimName: primary } }],
      containers: [
        {
          name: 'postgres',
          image: cluster.spec.imageName,
          resources: cluster.spec.resources,
        },
      ],
    },
    status: {
      conditions: ready,
      containerStatuses: [
        {
          name: 'postgres',
          ready: true,
          restartCount: 0,
          imageID:
            'containerd://sha256:e6e1f467b52112f7e08aa380de81473106ff54b1834d90bcb4265a2a018e1921',
        },
      ],
    },
  };
  objects[`pvc/${primary}`] = {
    metadata: { name: primary, namespace, uid: target.claimUid },
    spec: {
      volumeName,
      storageClassName: 'local-retained',
      resources: { requests: { storage: '4Gi' } },
    },
    status: { phase: 'Bound' },
  };
  objects[`pv/${volumeName}`] = {
    metadata: { name: volumeName, uid: target.volumeUid },
    spec: {
      storageClassName: 'local-retained',
      persistentVolumeReclaimPolicy: 'Retain',
      claimRef: { uid: target.claimUid, namespace, name: primary },
    },
    status: { phase: 'Bound' },
  };
  objects['storageclass/local-retained'] = { reclaimPolicy: 'Retain' };
  const kube = (args) => {
    const command = args.indexOf('get');
    return JSON.stringify(objects[`${args[command + 1]}/${args[command + 2]}`]);
  };
  return { profile, request, objects, kube };
}

test('installed probe verifies the reviewed amd64 image before asking for the SQL witness', () => {
  const { profile, request, objects, kube } = reviewedRuntime();
  const admin = () => {
    throw new Error('private SQL failure');
  };
  const pass = qualifyMinimalDemoRoles(request, { profile, kube, admin });
  assert.deepEqual(pass.checks, [
    { name: 'target-primary-and-retained-claim', outcome: 'passed' },
    { name: 'database-identity-and-credential-state', outcome: 'failed' },
  ]);
  assert.equal(pass.postgres.platform, 'linux/amd64');
  assert.match(pass.reason, /installed evidence command/u);
  assert.doesNotMatch(JSON.stringify(pass), /private SQL failure/u);
  objects['pod/fleetiq-db-1'].status.containerStatuses[0].imageID = digest('8');
  const fail = qualifyMinimalDemoRoles(request, { profile, kube, admin });
  assert.deepEqual(fail.checks, [
    { name: 'target-primary-and-retained-claim', outcome: 'failed' },
  ]);
});

test('installed probe refuses a changed candidate or unknown target or request fields before external calls', () => {
  const { profile, request } = reviewedRuntime();
  const kube = () =>
    assert.fail('A rejected private request must never contact a target');
  for (const candidate of [
    { ...request, candidate: digest('8') },
    { ...request, unexpectedField: 'private-content' },
    { ...request, target: { ...request.target, unexpectedField: 'private-content' } },
    {
      ...request,
      target: { ...request.target, workerUid: [request.target.workerUid] },
    },
  ]) {
    assert.throws(
      () => qualifyMinimalDemoRoles(candidate, { profile, kube }),
      assert.AssertionError,
    );
  }
});
