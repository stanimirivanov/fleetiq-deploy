import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { stringify } from 'yaml';
import { checkMinimalDemoData } from '../manifests/minimal-demo-data.mjs';
import { documents } from '../manifests/render.mjs';
import { manifestTools, toolsLock } from '../manifests/toolchain.mjs';
import { digest } from '../policy.mjs';
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

const operations = resolve(root, 'charts/fleetiq-minimal-demo-operations');
const pin = resolve(root, 'environments/minimal-demo/backend.json');
const selectedBackendDigest = `sha256:${digest(readFileSync(pin))}`;

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
      '--set-string',
      `backendDigest=${selectedBackendDigest}`,
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

test('demo manifest qualification validates the WorkflowTemplate and both ConfigMaps', () => {
  assert.equal(checkMinimalDemoData(tools, 'qual-fleet').workflowSchemas, 3);
  const malformedWorkflow = {
    ...tools,
    kustomize(args, options) {
      const output = tools.kustomize(args, options);
      if (args[0] !== 'build') return output;
      const rendered = documents(output);
      rendered.find(({ kind }) => kind === 'WorkflowTemplate').spec.suspend = [];
      return rendered.map((item) => stringify(item)).join('---\n');
    },
  };
  assert.throws(
    () => checkMinimalDemoData(malformedWorkflow, 'qual-fleet'),
    /kubeconform/u,
  );
});

const workflowName = 'demo-migration-0123456789abcdef01234567';
test('the migration route requires one exact Workflow attempt name', () => {
  const args = [
    'template',
    'fleetiq',
    operations,
    '--namespace',
    'qual-fleet-data',
    '--kube-version',
    toolsLock.kubernetes,
    '--set',
    'operation=migration-route',
  ];
  assert.throws(() => tools.helm(args));
  assert.throws(() => tools.helm([...args, '--set-string', 'workflowName=*']));
  const [client, postgres] = documents(
    tools.helm([...args, '--set-string', `workflowName=${workflowName}`]),
  );
  const labels = {
    'workflows.argoproj.io/workflow': workflowName,
    'app.kubernetes.io/component': 'fleetiq-demo-database-maintenance',
    'io.cilium.k8s.policy.serviceaccount': 'release-executor',
  };
  assert.deepEqual(client.spec.endpointSelector.matchLabels, labels);
  assert.deepEqual(postgres.spec.ingress[0].fromEndpoints[0].matchLabels, {
    ...labels,
    'k8s:io.kubernetes.pod.namespace': 'qual-fleet-releases',
  });
});

test('demo manifest qualification rejects weakened temporary PostgreSQL routes', () => {
  for (const [phase, mutate] of [
    [
      'migration-route',
      ([, postgres]) => {
        delete postgres.spec.ingress[0].fromEndpoints[0].matchLabels[
          'workflows.argoproj.io/workflow'
        ];
      },
    ],
    [
      'administrative-route',
      ([, postgres]) => {
        delete postgres.spec.ingress[0].fromEndpoints[0].matchExpressions;
      },
    ],
    [
      'reclaim-route',
      ([client]) => {
        delete client.spec.endpointSelector.matchExpressions;
      },
    ],
    [
      'bootstrap-route',
      ([client]) => {
        client.spec.egress[1].toPorts[0].ports[0].protocol = 'UDP';
      },
    ],
  ]) {
    const weakenedRoute = {
      ...tools,
      helm(args) {
        const output = tools.helm(args);
        if (!args.includes(`operation=${phase}`)) return output;
        const rendered = documents(output);
        mutate(rendered);
        return rendered.map((item) => stringify(item)).join('---\n');
      },
    };
    assert.throws(
      () => checkMinimalDemoData(weakenedRoute, 'qual-fleet'),
      /Temporary database route differs/u,
    );
  }
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

const administration = (operation, input = {}, extra = [], bindSelection = true) =>
  documents(
    tools.helm([
      'template',
      'qualification-operation-01',
      operations,
      '--namespace',
      'qual-fleet-data',
      '--kube-version',
      toolsLock.kubernetes,
      '--set',
      `operation=${operation}`,
      '--set-file',
      `backend=${pin}`,
      ...(bindSelection
        ? ['--set-string', `backendDigest=${selectedBackendDigest}`]
        : []),
      ...Object.entries(input).flatMap(([key, value]) => [
        '--set-string',
        `inputs.${key}=${value}`,
      ]),
      ...extra,
    ]),
  );

const tenant = { tenant: 'test-tenant' };
const declaration = {
  ...tenant,
  calculator: 'mean',
  version: '1',
  implementation: 'window-mean-v1',
  input: 'temperature',
  input_version: '1',
  output: 'temperature.mean',
  output_version: '1',
};
const evaluation = {
  ...tenant,
  calculator: 'mean',
  version: '1',
  configuration: 'config-1',
  evaluation: 'evaluation-1',
  scope: 'unit-1',
  target: 'unit-1',
  start: '9007199254740992',
  end: '9007199254740993',
  finalize: '9007199254740994',
  known: '9007199254740994',
  evaluated: '9007199254740995',
  minimum: '1',
};
const summary = {
  ...tenant,
  asset: 'unit-1',
  property: 'temperature',
  version: '1',
  start: '-10',
  end: '10',
  resolution: '10',
};

for (const [mode, command, input, parameter, archive] of [
  ['rebuild', 'rebuild-current', tenant, 'FLEETIQ_PROJECTION_REBUILD_TENANT'],
  [
    'register',
    'register-calculator',
    declaration,
    'FLEETIQ_CALCULATOR_DEFINITION_FILE',
  ],
  ['calculate', 'calculate-once', evaluation, 'FLEETIQ_CALCULATOR_REQUEST_FILE'],
  [
    'reclaim',
    'reclaim-once',
    { ...tenant, manifest: '1', policyRevision: '2' },
    'FLEETIQ_RECLAIM_TENANT_ID',
    true,
  ],
  ['summarize', 'summarize-once', summary, 'FLEETIQ_SUMMARY_TENANT_ID'],
  ['expire', 'expire-history-once', tenant, 'FLEETIQ_HISTORY_CLEANUP_TENANT_ID'],
]) {
  test(`the ${mode} template uses the exact producer command and capability`, () => {
    const rendered = administration(mode, input);
    const operation = JSON.parse(rendered.at(-1).data['operation.json']);
    assert.equal(operation.namespace, 'qual-fleet-data');
    assert.equal(operation.deadlineSeconds, 300);
    const [container] = operation.podSpec.containers;
    assert.deepEqual(container.args, [command]);
    assert.deepEqual(container.command, ['/usr/local/bin/fleetiq-server']);
    assert.equal(container.imagePullPolicy, 'Never');
    assert.deepEqual(container.resources, {
      requests: { cpu: '100m', memory: '192Mi' },
      limits: { cpu: '1', memory: '384Mi' },
    });
    assert.equal(
      container.env.some((item) => item.name === parameter),
      true,
    );
    const references = container.env
      .filter((entry) => entry.valueFrom)
      .map((entry) => entry.valueFrom.secretKeyRef.name);
    assert.deepEqual(references, [
      `fleetiq-db-${command}-url`,
      ...Array(archive ? 5 : 0).fill('fleetiq-demo-reclaim-storage'),
    ]);
    assert.equal(operation.podSpec.initContainers, undefined);
    if (['register', 'calculate'].includes(mode)) {
      const [config] = rendered;
      assert.equal(config.immutable, true);
      const input = config.data['input.json'];
      assert.equal(rendered.at(-1).data['approved-inputs.json'], input);
      assert.equal(
        config.metadata.name,
        `qualification-operation-01-input.${digest(input).replace(/^(.{32})/u, '$1.')}`,
      );
      assert.equal(operation.podSpec.volumes[1].configMap.name, config.metadata.name);
      if (mode === 'calculate') assert.match(input, /"end":9007199254740993[,}]/u);
    } else {
      assert.equal(rendered.length, 1);
    }
  });
}

test('summary observation inputs preserve both presence and absence of restore selectors', () => {
  const [hot] = administration('summarize', summary);
  const hotInputs = JSON.parse(hot.data['approved-inputs.json']);
  assert.equal(Object.hasOwn(hotInputs, 'manifest'), false);
  assert.equal(Object.hasOwn(hotInputs, 'generation'), false);
  const [restored] = administration('summarize', {
    ...summary,
    manifest: '123',
    generation: '2',
  });
  const restoredInputs = JSON.parse(restored.data['approved-inputs.json']);
  assert.equal(restoredInputs.manifest, 123);
  assert.equal(restoredInputs.generation, 2);
});

test('bootstrap requires the reviewed backend digest even without schema validation', () => {
  assert.throws(() => administration('bootstrap', {}, [], false));
  assert.throws(() =>
    administration('bootstrap', {}, ['--skip-schema-validation'], false),
  );
});

test('demo manifest qualification rejects mutable or replaced calculator input', () => {
  const changedInput = {
    ...tools,
    helm(args) {
      const output = tools.helm(args);
      if (!args.includes('operation=register')) return output;
      const rendered = documents(output);
      const config = rendered.find((item) => item.data?.['input.json']);
      config.immutable = false;
      return rendered.map((item) => stringify(item)).join('---\n');
    },
  };
  assert.throws(
    () => checkMinimalDemoData(changedInput, 'qual-fleet'),
    /Immutable calculator input differs/u,
  );
});

test('administration refuses wrong targets, operations, backend bytes, and unexpected credential inputs', () => {
  for (const mode of ['restore', 'export', 'migrate', 'serve'])
    assert.throws(() => administration(mode));
  assert.throws(() =>
    administration('rebuild', tenant, ['--namespace', 'foreign-apps']),
  );
  assert.throws(() =>
    administration('rebuild', tenant, [
      '--set-string',
      `backendDigest=sha256:${'a'.repeat(64)}`,
    ]),
  );
  assert.throws(() =>
    administration('rebuild', { ...tenant, secretName: 'fleetiq-db-serve-url' }),
  );
  assert.throws(() =>
    administration('reclaim', {
      ...tenant,
      manifest: '9223372036854775808',
      policyRevision: '1',
    }),
  );
  assert.throws(() => administration('calculate', { ...evaluation, minimum: '1025' }));
  assert.throws(() => administration('summarize', { ...summary, manifest: '1' }));
  assert.throws(() => administration('summarize', { ...summary, end: '13' }));
});

test('rebuild preserves literal identifiers instead of expanding Kubernetes environment references', () => {
  const [rendered] = administration('rebuild', { tenant: 'test-$(DATABASE_URL)' });
  const op = JSON.parse(rendered.data['operation.json']);
  assert.deepEqual(op.podSpec.containers[0].env[1], {
    name: 'FLEETIQ_PROJECTION_REBUILD_TENANT',
    value: 'test-$$(DATABASE_URL)',
  });
});
