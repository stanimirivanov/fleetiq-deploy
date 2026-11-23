import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { root } from '../process.mjs';
import { checkMinimalDemoData } from './minimal-demo-data.mjs';
import {
  database,
  demoDatabaseInstallationPolicies,
  demoNamespaces,
} from './minimal-demo-network.mjs';
import {
  bootstrap,
  databaseName,
  managedRoles,
  migrator,
  roleName,
  runtimeCommands,
  secretName,
  sha256,
} from './minimal-demo-roles.mjs';
import { documents, validateSchemas } from './render.mjs';
import { manifestTools, toolsLock } from './toolchain.mjs';

// Provider-selected CloudNativePG PostgreSQL image, retained storage and version family.
export const postgresAmd64Manifest =
  'sha256:e6e1f467b52112f7e08aa380de81473106ff54b1834d90bcb4265a2a018e1921';
export const postgresImage =
  'ghcr.io/cloudnative-pg/postgresql:18.4-system-trixie@sha256:42708a75345b7a48fdd9257b071830783a97fd228529196b6313187a7198e185';

function databaseClient(command, namespace) {
  return {
    namespace,
    username: roleName(command),
    hostname: `fleetiq-db-rw.${namespace}.svc`,
    database: databaseName,
    env: [
      {
        name: 'DATABASE_URL',
        valueFrom: { secretKeyRef: { name: `${secretName(command)}-url`, key: 'url' } },
      },
    ],
    volumeMounts: [
      { name: 'database-trust', mountPath: '/etc/fleetiq/database', readOnly: true },
    ],
    volumes: [
      {
        name: 'database-trust',
        configMap: {
          name: 'fleetiq-database-trust',
          items: [{ key: 'ca.crt', path: 'ca.crt' }],
        },
      },
    ],
  };
}

export function renderMinimalDemoRoles(tools, consumer, phase, attempt) {
  const { data, apps } = demoNamespaces(consumer);
  const candidate = checkMinimalDemoData(tools, consumer);
  const roles = managedRoles(phase);
  assert(!attempt || phase !== 'runtime', 'Select a temporary installation Job');
  const policies = attempt ? demoDatabaseInstallationPolicies(consumer, attempt) : [];
  const values = {
    profile: 'minimal-demo-install',
    image: postgresImage,
    owner: { role: migrator, passwordSecret: secretName('migrate') },
    storage: {
      className: candidate.cluster.spec.storage.storageClass,
      size: candidate.cluster.spec.storage.size,
    },
    resources: candidate.cluster.spec.resources,
    runtime: null,
    network: null,
    managedRoles: roles,
  };
  const path = mkdtempSync(join(tmpdir(), 'fleetiq-db-render-'));
  let rendered;
  try {
    const reference = join(path, 'values.json');
    writeFileSync(reference, JSON.stringify(values), { mode: 0o600 });
    rendered = documents(
      tools.helm([
        'template',
        'fleetiq',
        resolve(root, 'charts/fleetiq-data'),
        '--namespace',
        data,
        '--kube-version',
        toolsLock.kubernetes,
        '--values',
        reference,
      ]),
    );
  } finally {
    rmSync(path, { recursive: true, force: true });
  }
  const schemas = validateSchemas(tools, [...rendered, ...policies]);
  assert.equal(rendered.length, 1, 'Render only the credential-managed Cluster');
  const [cluster] = rendered;
  assert.equal(cluster.metadata.name, database['cnpg.io/cluster']);
  assert.deepEqual(cluster.spec.managed.roles, roles);
  const candidateId = sha256(
    JSON.stringify({
      backend: candidate.backendSelection,
      postgresAmd64Manifest,
      cluster: {
        ...cluster,
        spec: {
          ...cluster.spec,
          managed: ['installation', 'bootstrap', 'runtime'].map(managedRoles),
        },
      },
      contracts: [...runtimeCommands, bootstrap, 'migrate'].map((command) => ({
        ...databaseClient(command, data),
        namespace: runtimeCommands.includes(command) ? apps : data,
      })),
    }),
  );
  const clients = Object.fromEntries(
    [
      ...(phase === 'runtime' ? runtimeCommands.map((command) => [command, apps]) : []),
      ...(phase === 'installation' ? [['migrate', data]] : []),
      ...(phase === 'bootstrap' ? [[bootstrap, data]] : []),
    ].map(([command, namespace]) => [
      command,
      { ...databaseClient(command, data), namespace },
    ]),
  );
  return {
    format: 'fleetiq-minimal-demo-role-profile.v1',
    phase,
    candidate: candidateId,
    cluster,
    policies,
    ...(attempt
      ? { networkAttempt: { attempt, fingerprint: sha256(JSON.stringify(policies)) } }
      : {}),
    clients,
    backendSelection: candidate.backendSelection,
    connections: candidate.connections,
    fingerprint: sha256(JSON.stringify({ cluster, clients })),
    schemas,
    execution: 'not-performed',
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [, , consumer, phase, attempt, ...extra] = process.argv;
    assert(consumer && phase && extra.length === 0);
    console.log(
      JSON.stringify(
        renderMinimalDemoRoles(manifestTools(), consumer, phase, attempt),
        null,
        2,
      ),
    );
  } catch {
    console.error(
      'Select a minimal-demo consumer, installation phase, and pinned manifest tools.',
    );
    process.exitCode = 1;
  }
}
