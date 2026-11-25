import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { manifestPolicy } from '../../tools/manifests/policy.mjs';
import {
  documents,
  renderFixture,
  validateSchemas,
} from '../../tools/manifests/render.mjs';
import { runtimeCommands } from '../../tools/manifests/workload-database.mjs';
import { root } from '../../tools/process.mjs';

function checkUpgradeWorkflow(tools) {
  const operation = resolve(root, 'operations/workload-database');
  const resources = documents(
    tools.kustomize(['build', resolve(operation, 'example')]),
  );
  assert.deepEqual(
    resources.map(({ kind }) => kind),
    ['ConfigMap', 'ConfigMap', 'WorkflowTemplate'],
  );
  const [inputs, sql, workflow] = resources;
  assert.equal(inputs.immutable, true);
  assert.equal(sql.immutable, true);
  for (const file of [
    'context',
    'policy',
    'fence',
    'grant',
    'verification',
    'verify',
  ]) {
    assert.equal(
      sql.data[`${file}.sql`],
      readFileSync(resolve(operation, 'base/sql', `${file}.sql`), 'utf8'),
    );
  }
  assert.equal(workflow.metadata.namespace, 'fleetiq-releases');
  assert.equal(workflow.spec.serviceAccountName, 'release-executor');
  assert.deepEqual(
    workflow.spec.volumes.find(({ name }) => name === 'operation').configMap,
    {
      name: sql.metadata.name,
    },
  );
  assert.deepEqual(
    workflow.spec.templates[0].steps.map(([step]) => step.template),
    ['fence', 'migrate', 'grant', 'verify'],
  );
  for (const step of workflow.spec.templates.slice(1)) {
    assert(!step.script && !step.resource && !step.retryStrategy);
    const { args, command, env, envFrom, image } = step.container;
    assert.deepEqual(envFrom, [{ configMapRef: { name: inputs.metadata.name } }]);
    if (step.name === 'migrate') {
      assert.deepEqual(command, ['/usr/local/bin/fleetiq-server']);
      assert.deepEqual(args, ['migrate']);
      assert.match(
        image,
        /^ghcr\.io\/stanimirivanov\/fleetiq-platform@sha256:[a-f0-9]{64}$/u,
      );
    } else {
      assert.deepEqual(command, ['psql']);
      assert.equal(args.at(-1), `--file=/operation/${step.name}.sql`);
      assert.match(
        image,
        /^ghcr\.io\/cloudnative-pg\/postgresql@sha256:[a-f0-9]{64}$/u,
      );
      assert.deepEqual(
        env.find(({ name }) => name === 'FLEETIQ_MIGRATION_INVENTORY').valueFrom,
        {
          configMapKeyRef: { name: sql.metadata.name, key: 'inventory.json' },
        },
      );
    }
  }
}

export function checkWorkloadDatabase(tools) {
  const workloads = ['serve --check-schema', 'ingest-tcp', 'replay-worker'];
  const phases = [
    { maintenance: true, migrationLogin: true },
    { maintenance: true, bootstrapLogin: true },
    { maintenance: true },
    { retireLegacy: true },
  ];
  const render = (workloadDatabase, analytics = false) => {
    const context = {
      analytics,
      maintenance: Boolean(workloadDatabase.maintenance),
      nonlocal: false,
      workloadDatabase,
    };
    const resources = renderFixture(tools, {
      ...context,
      runtime: { workloadDatabase: { workloads: workloadDatabase.workloads } },
      data: { workloadDatabase },
      lint: true,
    });
    validateSchemas(tools, resources);
    manifestPolicy(resources, context);
    return { resources, context };
  };
  for (const phase of phases) render({ workloads, ...phase });
  const { resources, context } = render(
    { workloads: runtimeCommands, retireLegacy: true },
    true,
  );
  const replay = resources.find(
    ({ kind, spec }) =>
      kind === 'DatabaseRole' && spec.name === 'fleetiq_replay_worker',
  );
  replay.spec.createdb = true;
  assert.throws(
    () => manifestPolicy(resources, context),
    /DatabaseRole fleetiq_replay_worker/u,
  );
  assert.throws(() => render({ workloads }, true), /helm (?:lint|template)/u);
  assert.throws(
    () =>
      render({
        workloads,
        maintenance: true,
        migrationLogin: true,
        bootstrapLogin: true,
      }),
    /helm (?:lint|template)/u,
  );
  checkUpgradeWorkflow(tools);
  return { selected: workloads.length, phases: phases.length };
}
