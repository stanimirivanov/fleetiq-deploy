import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stringify } from 'yaml';
import { databaseSql } from '../manifests/workload-database-sql.mjs';

const digest = /^sha256:[a-f0-9]{64}$/u;
const serviceImage =
  /^ghcr\.io\/stanimirivanov\/fleetiq-platform@sha256:[a-f0-9]{64}$/u;
const postgresImage =
  /^ghcr\.io\/cloudnative-pg\/postgresql(?::18\.[0-9]+-system-trixie)?@sha256:[a-f0-9]{64}$/u;
const label = /^[a-z][a-z0-9-]{0,61}[a-z0-9]$/u;
const artifactDigest = (bytes) =>
  `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const releaseArgument = '{{workflow.parameters.release-digest}}';

/** Prepare versioned execution objects from artifacts already verified by release review. */
export function workloadDatabaseWorkflow(selection, producerSql) {
  assert.deepEqual(
    Object.keys(selection).sort(),
    [
      'backendImage',
      'caConfigMap',
      'databaseOid',
      'legacy',
      'migrationPasswordSecret',
      'namespace',
      'owner',
      'postgresImage',
      'releaseDigest',
      'server',
      'sqlDigest',
      'workloads',
    ].sort(),
  );
  const {
    backendImage,
    caConfigMap,
    databaseOid,
    legacy,
    migrationPasswordSecret,
    namespace,
    owner,
    releaseDigest,
    server,
    sqlDigest,
    workloads,
  } = selection;
  assert.match(backendImage, serviceImage);
  assert.match(selection.postgresImage, postgresImage);
  assert.match(releaseDigest, digest);
  assert(
    Buffer.isBuffer(producerSql) &&
      producerSql.length > 0 &&
      producerSql.length <= 512 * 1024,
  );
  const producerText = producerSql.toString('utf8');
  assert(
    Buffer.from(producerText).equals(producerSql),
    'Platform SQL must be valid UTF-8',
  );
  assert.equal(artifactDigest(producerSql), sqlDigest, 'Platform SQL digest differs');
  for (const name of [caConfigMap, migrationPasswordSecret, namespace])
    assert.match(name, label);
  assert.match(server, /^[a-z0-9-]+-rw\.[a-z0-9-]+\.svc$/u);
  assert(
    Number.isInteger(databaseOid) && databaseOid > 0 && databaseOid <= 4_294_967_295,
  );
  const operations = ['fence', 'grant', 'verify'];
  const sql = Object.fromEntries(
    operations.map((operation) => [
      `${operation}.sql`,
      databaseSql(operation, workloads, { owner, legacy, databaseOid }),
    ]),
  );
  // psql quotes the single user-supplied parameter as data. A mismatch fails the Pod.
  sql['request.sql'] = `SELECT :'release_digest' = '${releaseDigest}' AS approved \\gset
\\if :approved
\\else
DO $$ BEGIN RAISE EXCEPTION 'Request digest does not match the reviewed workflow'; END $$;
\\endif
`;
  const reviewedInputs = JSON.stringify({
    selection: Object.fromEntries(
      Object.entries(selection).sort(([a], [b]) => a.localeCompare(b)),
    ),
    sql,
    renderer: artifactDigest(readFileSync(new URL(import.meta.url))),
  });
  const name = `workload-database-v1-${artifactDigest(reviewedInputs).slice(7, 27)}`;
  const configMap = {
    apiVersion: 'v1',
    kind: 'ConfigMap',
    metadata: { name, namespace },
    immutable: true,
    data: { 'runtime-grants.sql': producerText, ...sql },
  };
  const ca = {
    name: 'database-ca',
    mountPath: '/etc/fleetiq/database',
    readOnly: true,
  };
  const secretEnv = (name, secret, key) => ({
    name,
    valueFrom: { secretKeyRef: { name: secret, key } },
  });
  const password = secretEnv('PGPASSWORD', migrationPasswordSecret, 'password');
  const url = `postgresql://${owner}@${server}:5432/fleetiq?sslmode=verify-full&sslrootcert=/etc/fleetiq/database/ca.crt`;
  const securityContext = {
    allowPrivilegeEscalation: false,
    readOnlyRootFilesystem: true,
    capabilities: { drop: ['ALL'] },
  };
  const resources = {
    requests: { cpu: '100m', memory: '32Mi' },
    limits: { cpu: '500m', memory: '128Mi' },
  };
  const psql = (operation) => ({
    name: operation,
    container: {
      image: selection.postgresImage,
      command: ['psql'],
      args: [
        '-X',
        '--no-password',
        '--set=ON_ERROR_STOP=1',
        `--set=release_digest=${releaseArgument}`,
        '--file=/operation/request.sql',
        '--file=/operation/runtime-grants.sql',
        `--file=/operation/${operation}.sql`,
      ],
      env: [
        ...Object.entries({
          PGHOST: server,
          PGPORT: '5432',
          PGDATABASE: 'fleetiq',
          PGUSER: owner,
          PGSSLMODE: 'verify-full',
          PGSSLROOTCERT: '/etc/fleetiq/database/ca.crt',
          PGCONNECT_TIMEOUT: '5',
        }).map(([name, value]) => ({ name, value })),
        password,
      ],
      volumeMounts: [
        ca,
        { name: 'operation', mountPath: '/operation', readOnly: true },
      ],
      securityContext,
      resources,
    },
  });
  return [
    configMap,
    {
      apiVersion: 'argoproj.io/v1alpha1',
      kind: 'WorkflowTemplate',
      metadata: { name, namespace },
      spec: {
        entrypoint: 'maintenance',
        serviceAccountName: 'release-executor',
        activeDeadlineSeconds: 900,
        synchronization: { mutexes: [{ name: 'fleetiq-workload-database' }] },
        arguments: { parameters: [{ name: 'release-digest' }] },
        securityContext: {
          runAsNonRoot: true,
          runAsUser: 10001,
          runAsGroup: 10001,
          fsGroup: 10001,
          seccompProfile: { type: 'RuntimeDefault' },
        },
        volumes: [
          { name: 'database-ca', configMap: { name: caConfigMap } },
          { name: 'operation', configMap: { name } },
        ],
        templates: [
          {
            name: 'maintenance',
            steps: ['fence', 'migrate', 'grant', 'verify'].map((name) => [
              { name, template: name },
            ]),
          },
          ...operations.map(psql),
          {
            name: 'migrate',
            container: {
              image: backendImage,
              args: ['migrate'],
              env: [{ name: 'DATABASE_URL', value: url }, password],
              volumeMounts: [ca],
              securityContext,
              resources: { ...resources, limits: { cpu: '1', memory: '384Mi' } },
            },
          },
        ],
      },
    },
  ];
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [selection, artifact, ...extra] = process.argv.slice(2);
  assert(
    selection && artifact && !extra.length,
    'Provide a reviewed selection and verified platform SQL',
  );
  const resources = workloadDatabaseWorkflow(
    JSON.parse(readFileSync(selection, 'utf8')),
    readFileSync(artifact),
  );
  process.stdout.write(resources.map((resource) => stringify(resource)).join('---\n'));
}
