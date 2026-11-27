import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { digest } from '../policy.mjs';
import { root } from '../process.mjs';
import { checkDatabaseRoles, dataPolicy } from './data-policy.mjs';
import {
  application,
  attemptLabel,
  database,
  demoNamespaces,
  dns,
  postgresPort,
  routineLabel,
  simulatorAccount,
  supportPorts,
} from './minimal-demo-network.mjs';
import { documents, validateSchemas } from './render.mjs';
import { toolsLock } from './toolchain.mjs';

const environment = resolve(root, 'environments/minimal-demo');
const selectionPath = resolve(environment, 'backend.json');
const sha256 = /^sha256:[a-f0-9]{64}$/u;

// Recheck the producer command bounds whenever the reviewed platform pin changes.
const poolRevision = 'c2135d3f77ef1150efbc7beeee8d160271822da7';
const residentPools = {
  'serve --check-schema': 10,
  'ingest-tcp': 8,
  'replay-worker': 2,
  'semantic-worker': 4,
  'project-current': 2,
  'analytics-worker': 4,
  'notification-worker': 4,
  'archive-worker': 2,
};

const demoPhases = {
  migration: { workloads: [], maintenance: true, migrationLogin: true },
  bootstrap: { workloads: [], maintenance: true, bootstrapLogin: true },
  runtime: { workloads: Object.keys(residentPools) },
};
const ciliumNamespace = 'k8s:io.kubernetes.pod.namespace';
const ciliumAccount = 'io.cilium.k8s.policy.serviceaccount';
const migrationLabels = {
  'app.kubernetes.io/component': 'fleetiq-demo-database-maintenance',
};

function checkTemporaryRoute(rendered, phase, spaces, clientNamespace, labels) {
  const { data: namespace, support } = spaces;
  const objectStore = application('object-store');
  const nonRoutine = [{ key: routineLabel, operator: 'DoesNotExist' }];
  const sqlFence = ['administrative', 'reclaim'].includes(phase)
    ? nonRoutine
    : undefined;
  const endpoint = (space, matchLabels, matchExpressions) => ({
    matchLabels: { [ciliumNamespace]: space, ...matchLabels },
    ...(matchExpressions && { matchExpressions }),
  });
  const ports = (port, protocols = ['TCP']) => [
    { ports: protocols.map((protocol) => ({ port: String(port), protocol })) },
  ];
  const policy = (side, namespace, matchLabels, rules, matchExpressions) => ({
    apiVersion: 'cilium.io/v2',
    kind: 'CiliumNetworkPolicy',
    metadata: { name: `fleetiq-demo-${phase}-${side}`, namespace },
    spec: {
      endpointSelector: { matchLabels, ...(matchExpressions && { matchExpressions }) },
      ...rules,
    },
  });
  assert.deepEqual(
    rendered,
    [
      policy(
        'client',
        clientNamespace,
        labels,
        {
          egress: [
            {
              toEndpoints: [endpoint('kube-system', dns)],
              toPorts: ports(53, ['UDP', 'TCP']),
            },
            {
              toEndpoints: [endpoint(namespace, database, sqlFence)],
              toPorts: ports(postgresPort),
            },
            ...(phase === 'reclaim'
              ? [
                  {
                    toEndpoints: [endpoint(support, objectStore, nonRoutine)],
                    toPorts: ports(supportPorts.objectStore.pod),
                  },
                ]
              : []),
            ...(phase === 'migration'
              ? [{ toEntities: ['kube-apiserver'], toPorts: ports(6443) }]
              : []),
          ],
        },
        sqlFence,
      ),
      policy(
        'postgres',
        namespace,
        database,
        {
          ingress: [
            {
              fromEndpoints: [endpoint(clientNamespace, labels, sqlFence)],
              toPorts: ports(postgresPort),
            },
          ],
        },
        sqlFence,
      ),
      ...(phase === 'reclaim'
        ? [
            policy(
              'object-store',
              support,
              objectStore,
              {
                ingress: [
                  {
                    fromEndpoints: [endpoint(namespace, labels, nonRoutine)],
                    toPorts: ports(supportPorts.objectStore.pod),
                  },
                ],
              },
              nonRoutine,
            ),
          ]
        : []),
    ],
    'Temporary database route differs from the exact operation and destinations',
  );
}

export function validateBackendSelection(selection) {
  assert.equal(selection.format, 'fleetiq-minimal-demo-backend.v1');
  const { backend, migrationInventory, qualifiedSqlRevision } = selection;
  assert.equal(backend.source.repository, 'stanimirivanov/fleetiq-platform');
  assert.equal(
    backend.source.revision,
    poolRevision,
    'Recheck the producer pool bounds',
  );
  assert.match(
    backend.reference,
    /^ghcr\.io\/stanimirivanov\/fleetiq-platform@sha256:[a-f0-9]{64}$/u,
  );
  for (const count of [
    backend.publication.run,
    backend.publication.attempt,
    migrationInventory.count,
  ])
    assert(
      Number.isSafeInteger(count) && count > 0,
      'Invalid publication or inventory',
    );
  for (const identity of [
    backend.publication.artifactDigest,
    backend.publication.recordDigest,
    migrationInventory.digest,
  ])
    assert.match(identity, sha256);
  assert.match(qualifiedSqlRevision, /^[a-f0-9]{40}$/u);
  return selection;
}

function connectionBudget(maximum) {
  assert.equal(maximum, '64', 'Require the approved PostgreSQL connection setting');
  const normal = Object.entries(residentPools)
    .filter(([command]) => command !== 'archive-worker')
    .reduce((sum, [, limit]) => sum + limit, 0);
  const withArchive = normal + residentPools['archive-worker'];
  const conservativeCeiling = withArchive + 2;
  const remaining = Number(maximum) - conservativeCeiling;
  assert.equal(remaining, 26);
  return { normal, withArchive, conservativeCeiling, remaining };
}

function checkDemoWorkflow(
  tools,
  { namespace, consumer, postgres, backend, workloads },
) {
  const directory = mkdtempSync(resolve(tmpdir(), 'fleetiq-demo-workflow-'));
  const operation = resolve(root, 'operations/workload-database');
  try {
    cpSync(operation, directory, { recursive: true });
    const cwd = resolve(directory, 'demo');
    // Synthetic reviewed inputs exercise composition without claiming execution.
    const inventory = readFileSync(
      resolve(operation, 'example/inventory.json'),
      'utf8',
    );
    writeFileSync(resolve(cwd, 'inventory.json'), inventory);
    const releaseDigest = `sha256:${'c'.repeat(64)}`;
    writeFileSync(
      resolve(cwd, 'reviewed-install.env'),
      [
        `PGHOST=fleetiq-db-rw.${namespace}.svc`,
        'PGUSER=fleetiq_migrator',
        'FLEETIQ_DATABASE_OID=16401',
        'FLEETIQ_LEGACY_ROLE=fleetiq_runtime',
        `FLEETIQ_WORKLOADS=${JSON.stringify(workloads)}`,
        `FLEETIQ_RELEASE_DIGEST=${releaseDigest}`,
        '',
      ].join('\n'),
    );
    const releases = `${consumer}-releases`;
    const suffix = releaseDigest.slice(7, 23);
    tools.kustomize(['edit', 'set', 'namespace', releases], { cwd });
    tools.kustomize(['edit', 'set', 'namesuffix', '--', `-${suffix}`], { cwd });
    tools.kustomize(
      [
        'edit',
        'set',
        'image',
        `invalid.invalid/fleetiq-migrate=${backend}`,
        `invalid.invalid/psql=${postgres}`,
      ],
      { cwd },
    );
    const rendered = documents(tools.kustomize(['build', cwd]));
    assert.deepEqual(
      rendered.map(({ kind }) => kind),
      ['ConfigMap', 'ConfigMap', 'WorkflowTemplate'],
    );
    const [inputs, sql, workflow] = rendered;
    assert(rendered.every(({ metadata }) => metadata.namespace === releases));
    assert.equal(inputs.immutable, true);
    assert.equal(sql.immutable, true);
    assert.equal(sql.data['inventory.json'], inventory);
    assert.equal(inputs.data.FLEETIQ_WORKLOADS, JSON.stringify(workloads));
    assert.equal(inputs.data.FLEETIQ_RELEASE_DIGEST, releaseDigest);
    assert.equal(workflow.metadata.name, `workload-database-v1-${suffix}`);
    assert.deepEqual(
      workflow.spec.templates[0].steps.map(([step]) => step.template),
      ['fence', 'migrate', 'grant', 'verify'],
    );
    for (const { name, container } of workflow.spec.templates.slice(1)) {
      assert.equal(container.image, name === 'migrate' ? backend : postgres);
      assert.deepEqual(container.envFrom, [
        { configMapRef: { name: inputs.metadata.name } },
      ]);
    }
    assert.deepEqual(workflow.spec.podMetadata.labels, migrationLabels);
    assert.equal(workflow.spec.serviceAccountName, 'release-executor');
    return rendered;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

export function checkMinimalDemoData(tools, consumer) {
  const spaces = demoNamespaces(consumer);
  const namespace = spaces.data;
  const selectionBytes = readFileSync(selectionPath);
  const backendSelection = validateBackendSelection(JSON.parse(selectionBytes));
  const data = documents(readFileSync(resolve(environment, 'data.yaml'), 'utf8'))[0];
  const render = (chart, name, ...args) =>
    documents(
      tools.helm([
        'template',
        name,
        chart,
        '--namespace',
        namespace,
        '--kube-version',
        toolsLock.kubernetes,
        ...args,
      ]),
    );
  const { workloads } = demoPhases.runtime;
  let connections;
  const phases = Object.fromEntries(
    Object.entries(demoPhases).map(([phase, workloadDatabase]) => {
      const path = resolve(environment, `${phase}.yaml`);
      assert.deepEqual(
        documents(readFileSync(path, 'utf8')),
        [{ workloadDatabase }],
        `Unexpected reviewed values for minimal-demo ${phase} phase`,
      );
      const rendered = render(
        resolve(root, 'charts/fleetiq-data'),
        'fleetiq',
        '--values',
        resolve(environment, 'data.yaml'),
        '--values',
        path,
      );
      const [cluster] = checkDatabaseRoles(rendered, {
        retireLegacy: true,
        legacy: { name: 'fleetiq_runtime', secret: data.runtime.passwordSecret },
        ...workloadDatabase,
      });
      assert.equal(rendered.length, 10);
      assert.equal(cluster.kind, 'Cluster');
      assert.equal(cluster.apiVersion, 'postgresql.cnpg.io/v1');
      assert.deepEqual(cluster.metadata, {
        namespace,
        name: database['cnpg.io/cluster'],
        annotations: {
          'helm.sh/resource-policy': 'keep',
          'argocd.argoproj.io/sync-options': 'Prune=false,Delete=false',
        },
      });
      assert.equal(cluster.spec.imageName, data.image);
      assert.deepEqual(cluster.spec.storage, {
        storageClass: 'local-retained',
        size: '4Gi',
      });
      assert.equal(cluster.spec.resources.requests.memory, '256Mi');
      assert.equal(cluster.spec.resources.limits.memory, '768Mi');
      assert.equal(cluster.spec.postgresql.parameters.max_connections, '64');
      dataPolicy(cluster, {
        providerLocal: true,
        workloadDatabase: { retireLegacy: true, ...workloadDatabase },
        maxConnections: 64,
        requireTLS: true,
      });
      if (phase === 'runtime') {
        connections = connectionBudget(
          cluster.spec.postgresql.parameters.max_connections,
        );
      }
      return [phase, { rendered, schemas: validateSchemas(tools, rendered) }];
    }),
  );
  const chart = resolve(root, 'charts/fleetiq-minimal-demo-operations');
  const renderOperation = (mode, name, input = {}) =>
    render(
      chart,
      name,
      '--set',
      `operation=${mode}`,
      '--set-file',
      `backend=${selectionPath}`,
      '--set-string',
      `backendDigest=sha256:${digest(selectionBytes)}`,
      ...Object.entries(input).flatMap(([key, value]) => [
        '--set-string',
        `inputs.${key}=${value}`,
      ]),
    );
  const bootstrap = renderOperation('bootstrap', 'demo-bootstrap-01');
  const operation = JSON.parse(bootstrap[0].data['operation.json']);
  const [container] = operation.podSpec.containers;
  assert.equal(container.image, backendSelection.backend.reference);
  assert.deepEqual(container.args, ['bootstrap-platform-operator', '--check-schema']);
  const calculator = {
    tenant: 'fixture',
    calculator: 'mean',
    version: '1',
  };
  const calculatorInputs = [
    [
      'register',
      {
        ...calculator,
        implementation: 'window-mean-v1',
        input: 'temperature',
        input_version: 1,
        output: 'temperature.mean',
        output_version: 1,
      },
    ],
    [
      'calculate',
      {
        ...calculator,
        scope: 'unit-1',
        evaluation: 'evaluation-1',
        configuration: 'config-1',
        target: 'unit-1',
        start: 0,
        end: 10,
        finalize: 10,
        known: 10,
        evaluated: 10,
        minimum: 1,
      },
    ],
  ].flatMap(([mode, input]) => {
    const name = `demo-${mode}-01`;
    const rendered = renderOperation(mode, name, input);
    const [config, carrier] = rendered;
    const bytes = JSON.stringify(input, Object.keys(input).sort());
    const hash = digest(bytes);
    const inputName = `${name}-input.${hash.slice(0, 32)}.${hash.slice(32)}`;
    assert.equal(rendered.length, 2);
    assert.deepEqual(
      config,
      {
        apiVersion: 'v1',
        kind: 'ConfigMap',
        metadata: { name: inputName, namespace },
        immutable: true,
        data: { 'input.json': bytes },
      },
      'Immutable calculator input differs from the reviewed fixture',
    );
    assert.deepEqual(JSON.parse(carrier.data['operation.json']).podSpec.volumes, [
      { name: 'database-ca', configMap: { name: 'workload-database-ca' } },
      { name: 'operation-input', configMap: { name: inputName } },
    ]);
    return rendered;
  });
  const workflowName = 'demo-migration-0123456789abcdef01234567';
  const attempt = 'demo-launch-0123456789abcdef01234567';
  const releases = `${consumer}-releases`;
  const migrationRoute = render(
    chart,
    'fleetiq',
    '--set',
    'operation=migration-route',
    '--set-string',
    `workflowName=${workflowName}`,
  );
  checkTemporaryRoute(migrationRoute, 'migration', spaces, releases, {
    ...migrationLabels,
    [ciliumAccount]: 'release-executor',
    'workflows.argoproj.io/workflow': workflowName,
  });
  const administrativeRoutes = ['bootstrap', 'administrative', 'reclaim'].flatMap(
    (phase) => {
      const route = render(
        chart,
        'fleetiq',
        '--set',
        `operation=${phase}-route`,
        '--set-string',
        `attempt=${attempt}`,
      );
      checkTemporaryRoute(route, phase, spaces, namespace, {
        [attemptLabel]: attempt,
        [ciliumAccount]: simulatorAccount(attempt),
      });
      return route;
    },
  );
  const workflowResources = checkDemoWorkflow(tools, {
    namespace,
    consumer,
    postgres: data.image,
    backend: backendSelection.backend.reference,
    workloads,
  });
  const operations = [
    ...bootstrap,
    ...calculatorInputs,
    ...migrationRoute,
    ...administrativeRoutes,
  ];
  return {
    phases: Object.fromEntries(
      Object.entries(phases).map(([phase, { rendered, schemas }]) => [
        phase,
        {
          resources: rendered.length,
          schemas,
          fingerprint: `sha256:${digest(JSON.stringify(rendered))}`,
        },
      ]),
    ),
    operationSchemas: validateSchemas(tools, operations),
    workflowResources: workflowResources.length,
    workflowSchemas: validateSchemas(tools, workflowResources),
    connections,
    execution: 'not-performed',
  };
}
