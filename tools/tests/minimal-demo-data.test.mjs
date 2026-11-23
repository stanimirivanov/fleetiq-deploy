import assert from 'node:assert/strict';
import test from 'node:test';
import { checkMinimalDemoData } from '../manifests/minimal-demo-data.mjs';
import { manifestTools } from '../manifests/toolchain.mjs';

const tools = manifestTools();

test('minimal-demo data renders only the retained offline Cluster under the selected consumer', () => {
  const result = checkMinimalDemoData(tools, 'qual-fleet');
  const { cluster } = result;
  assert.equal(result.execution, 'not-performed');
  assert.equal(cluster.metadata.namespace, 'qual-fleet-data');
  assert.equal(cluster.metadata.name, 'fleetiq-db');
  assert.match(cluster.spec.imageName, /^registry\.invalid\//u);
  assert.equal(cluster.spec.enableSuperuserAccess, false);
  assert.equal(cluster.spec.managed, undefined);
  assert.deepEqual(cluster.spec.resources, {
    requests: { cpu: '200m', memory: '256Mi' },
    limits: { cpu: '1', memory: '768Mi' },
  });
  assert.deepEqual(cluster.spec.storage, {
    storageClass: 'local-retained',
    size: '4Gi',
  });
  assert.equal(cluster.spec.postgresql.parameters.max_connections, '64');
  assert.equal(cluster.metadata.annotations['helm.sh/resource-policy'], 'keep');
  assert.equal(
    cluster.metadata.annotations['argocd.argoproj.io/sync-options'],
    'Prune=false,Delete=false',
  );
});

test('connection budget counts normal roles, archive and recurring operations separately from installation', () => {
  const { connections } = checkMinimalDemoData(tools, 'qual-fleet');
  assert.equal(connections.normal, 34);
  assert.equal(connections.withArchive, 36);
  assert.equal(connections.recurringOperation, 2);
  assert.equal(connections.conservativeCeiling, 38);
  assert.equal(connections.remaining, 26);
  assert.deepEqual(connections.installation, { migrate: 1, bootstrap: 10 });
  assert.equal(connections.producer, 'a40217ae14c467ec91de163e46ced68590731f6b');
});

test('the offline candidate rejects invalid consumer names and chart values that add the legacy login', () => {
  assert.throws(
    () => checkMinimalDemoData(tools, '../outside'),
    /Invalid minimal-demo consumer/u,
  );
  const tryingLegacy = {
    ...tools,
    helm: (args) =>
      tools.helm([...args, '--set', 'runtime.passwordSecret=fleet-database-runtime']),
  };
  assert.throws(() => checkMinimalDemoData(tryingLegacy, 'qual-fleet'));
});

test('candidate check rejects a changed PVC budget and the chart rejects a real image override', () => {
  for (const override of [
    'storage.size=5Gi',
    `image=ghcr.io/cloudnative-pg/postgresql:18.4-system-trixie@sha256:${'1'.repeat(64)}`,
  ]) {
    const changed = {
      ...tools,
      helm: (args) => tools.helm([...args, '--set', override]),
    };
    assert.throws(() => checkMinimalDemoData(changed, 'qual-fleet'));
  }
});
