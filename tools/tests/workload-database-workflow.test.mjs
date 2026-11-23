import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { workloadDatabaseWorkflow } from '../releases/workload-database-workflow.mjs';

const sql = Buffer.from('-- verified producer artifact\n');
const selection = {
  backendImage: `ghcr.io/stanimirivanov/fleetiq-platform@sha256:${'a'.repeat(64)}`,
  caConfigMap: 'reviewed-cnpg-ca',
  databaseOid: 16401,
  legacy: 'fleetiq_runtime',
  migrationPasswordSecret: 'staged-owner',
  namespace: 'fleetiq-releases',
  owner: 'fleetiq_migrator',
  postgresImage: `ghcr.io/cloudnative-pg/postgresql@sha256:${'b'.repeat(64)}`,
  releaseDigest: `sha256:${'c'.repeat(64)}`,
  server: 'fleetiq-db-rw.fleetiq-data.svc',
  sqlDigest: `sha256:${createHash('sha256').update(sql).digest('hex')}`,
  workloads: ['serve --check-schema', 'ingest-tcp', 'replay-worker'],
};

test('reviewed release creates a native sequential database workflow with one fixed target', () => {
  const [config, workflow] = workloadDatabaseWorkflow(selection, sql);
  assert.equal(workflow.kind, 'WorkflowTemplate');
  assert.equal(workflow.spec.serviceAccountName, 'release-executor');
  assert.deepEqual(workflow.spec.arguments.parameters, [{ name: 'release-digest' }]);
  assert.deepEqual(
    workflow.spec.templates[0].steps.map(([step]) => step.template),
    ['fence', 'migrate', 'grant', 'verify'],
  );
  assert.equal(config.immutable, true);
  assert.equal(config.data['runtime-grants.sql'], sql.toString());
  assert.match(config.data['fence.sql'], /16401::oid/u);
  assert.match(config.data['grant.sql'], /16401::oid/u);
  assert.match(config.data['verify.sql'], /16401::oid/u);
  for (const template of workflow.spec.templates.slice(1)) {
    assert(!template.script && !template.resource && !template.retryStrategy);
    assert.match(template.container.image, /@sha256:/u);
    assert.deepEqual(
      template.container.env.find(({ name }) => name === 'PGPASSWORD').valueFrom,
      { secretKeyRef: { name: 'staged-owner', key: 'password' } },
    );
  }
  const migration = workflow.spec.templates.find(({ name }) => name === 'migrate');
  const url = new URL(
    migration.container.env.find(({ name }) => name === 'DATABASE_URL').value,
  );
  assert.equal(url.hostname, selection.server);
  assert.equal(url.username, selection.owner);
  assert.equal(url.searchParams.get('sslmode'), 'verify-full');
});

test('release preparation refuses altered SQL, a mutable image and an unsupported target', () => {
  assert.throws(
    () => workloadDatabaseWorkflow(selection, Buffer.from('SELECT 1;')),
    /digest differs/u,
  );
  for (const change of [
    { backendImage: 'ghcr.io/stanimirivanov/fleetiq-platform:main' },
    { databaseOid: -1 },
    { server: 'other.example.com' },
    { serviceAccountName: 'admin' },
  ])
    assert.throws(() => workloadDatabaseWorkflow({ ...selection, ...change }, sql));
  const [first] = workloadDatabaseWorkflow(selection, sql);
  const [next] = workloadDatabaseWorkflow({ ...selection, databaseOid: 16402 }, sql);
  assert.notEqual(first.metadata.name, next.metadata.name);
});
