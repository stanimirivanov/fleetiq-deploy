import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { digest, lock } from '../policy.mjs';
import { root } from '../process.mjs';
import { database, demoNamespaces } from './minimal-demo-network.mjs';
import { documents, validateSchemas } from './render.mjs';
import { manifestTools, toolsLock } from './toolchain.mjs';

// Recheck the producer command bounds whenever the reviewed platform pin changes.
const producer = 'a40217ae14c467ec91de163e46ced68590731f6b';
const residentPools = {
  serve: 10,
  'ingest-tcp': 8,
  'replay-worker': 2,
  'semantic-worker': 4,
  'project-current': 2,
  'analytics-worker': 4,
  'notification-worker': 4,
};
const recurringPools = {
  'rebuild-current': 2,
  'register-calculator': 2,
  'calculate-once': 2,
  'reclaim-once': 2,
  'summarize-once': 2,
  'expire-history-once': 1,
};

function connectionBudget(maximum) {
  assert.equal(
    lock.sources.platform.commit,
    producer,
    'Recheck the producer pool bounds',
  );
  assert.equal(maximum, '64', 'Require the approved PostgreSQL connection setting');

  const normal = Object.values(residentPools).reduce((sum, limit) => sum + limit, 0);
  const archivePool = 2;
  const withArchive = normal + archivePool;
  const recurringOperation = Math.max(...Object.values(recurringPools));
  const conservativeCeiling = withArchive + recurringOperation;
  const remaining = Number(maximum) - conservativeCeiling;
  assert(remaining >= 26, 'Preserve the approved nonproduct connection allowance');

  return {
    producer,
    pools: { ...residentPools, 'archive-worker': archivePool },
    recurringPools,
    normal,
    withArchive,
    recurringOperation,
    conservativeCeiling,
    remaining,
    installation: { migrate: 1, bootstrap: 10 },
  };
}

export function checkMinimalDemoData(tools, consumer) {
  const namespace = demoNamespaces(consumer).data;
  const args = [
    resolve(root, 'charts/fleetiq-data'),
    '--namespace',
    namespace,
    '--kube-version',
    toolsLock.kubernetes,
    '--values',
    resolve(root, 'environments/minimal-demo-candidate/data.yaml'),
  ];
  const rendered = documents(tools.helm(['template', 'fleetiq', ...args]));
  assert.equal(rendered.length, 1, 'Render only the candidate Cluster');
  const [cluster] = rendered;
  assert.equal(cluster.apiVersion, 'postgresql.cnpg.io/v1');
  assert.equal(cluster.kind, 'Cluster');
  assert.deepEqual(cluster.metadata, {
    namespace,
    name: database['cnpg.io/cluster'],
    annotations: {
      'helm.sh/resource-policy': 'keep',
      'argocd.argoproj.io/sync-options': 'Prune=false,Delete=false',
    },
  });
  assert.deepEqual(cluster.spec, {
    imageName:
      'registry.invalid/candidate/postgresql:18.4-system-trixie@sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
    instances: 1,
    enableSuperuserAccess: false,
    primaryUpdateStrategy: 'supervised',
    storage: { storageClass: 'local-retained', size: '4Gi' },
    resources: {
      requests: { cpu: '200m', memory: '256Mi' },
      limits: { cpu: '1', memory: '768Mi' },
    },
    bootstrap: {
      initdb: {
        database: 'fleetiq',
        owner: 'fleetiq_migrator',
        secret: { name: 'offline-candidate-migration-owner' },
      },
    },
    postgresql: {
      parameters: { password_encryption: 'scram-sha-256', max_connections: '64' },
      pg_hba: ['hostssl all all all scram-sha-256'],
    },
  });
  const schemas = validateSchemas(tools, rendered);
  return {
    format: 'fleetiq-minimal-demo-data-candidate.v1',
    cluster,
    fingerprint: `sha256:${digest(JSON.stringify(cluster))}`,
    connections: connectionBudget(cluster.spec.postgresql.parameters.max_connections),
    schemas,
    execution: 'not-performed',
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [, , consumer, ...extra] = process.argv;
    assert(consumer && extra.length === 0, 'Select one minimal-demo consumer');
    console.log(
      JSON.stringify(checkMinimalDemoData(manifestTools(), consumer), null, 2),
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
