import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import test from 'node:test';
import { checkManifests } from '../manifests/check.mjs';
import { checkMinimalDemoData } from '../manifests/minimal-demo-data.mjs';
import { documents } from '../manifests/render.mjs';
import { manifestTools, toolsLock } from '../manifests/toolchain.mjs';
import { root } from '../process.mjs';

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

test('the offline candidate rejects invalid consumer names', () => {
  assert.throws(
    () => checkMinimalDemoData(tools, '../outside'),
    /Invalid minimal-demo consumer/u,
  );
});

const candidateHelmArgs = [
  'template',
  'fleetiq',
  resolve(root, 'charts/fleetiq-data'),
  '--namespace',
  'qual-fleet-data',
  '--kube-version',
  toolsLock.kubernetes,
  '--values',
  resolve(root, 'environments/minimal-demo-candidate/data.yaml'),
];

for (const [mode, flags] of [
  ['with schema validation', []],
  ['with schema validation skipped', ['--skip-schema-validation']],
]) {
  test(`native Helm renders the exact offline candidate ${mode}`, () => {
    const rendered = documents(tools.helm([...candidateHelmArgs, ...flags]));
    assert.deepEqual(rendered, [checkMinimalDemoData(tools, 'qual-fleet').cluster]);
  });

  for (const override of [
    'clusterName=alternate',
    'database=alternate',
    `image=ghcr.io/cloudnative-pg/postgresql:18.4-system-trixie@sha256:${'1'.repeat(64)}`,
    'instances=2',
    'network.runtimeNamespace=qual-fleet-apps',
    'owner.role=alternate',
    'owner.passwordSecret=real-migration-owner',
    'postgresql.parameters.max_connections=80',
    'resources.limits.cpu=2',
    'resources.limits.ephemeral-storage=1Gi',
    'resources.limits.memory=1Gi',
    'resources.requests.cpu=300m',
    'resources.requests.memory=512Mi',
    'runtime.passwordSecret=fleet-database-runtime',
    'storage.className=non-retained',
    'storage.size=5Gi',
  ]) {
    const [field] = override.split('=');
    const flag = field === 'instances' ? '--set' : '--set-string';
    test(`native Helm rejects candidate override of ${field} ${mode}`, () => {
      assert.throws(() => tools.helm([...candidateHelmArgs, ...flags, flag, override]));
    });
  }
}

test('default manifest measurements expose only candidate data counts, fingerprint and gate state', () => {
  const result = checkMinimalDemoData(tools, 'fleetiq');
  assert.deepEqual(checkManifests().minimalDemoData, {
    resources: 1,
    schemas: 1,
    fingerprint: result.fingerprint,
    execution: 'not-performed',
  });
});
