import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { parse, stringify } from 'yaml';
import { root } from '../process.mjs';
import { documents, validateSchemas } from './render.mjs';

const operations = resolve(root, 'operations');

function checkWorkflow(rendered, { action, releases, postgres, inputs, inventory }) {
  assert.deepEqual(
    rendered.map(({ kind }) => kind),
    ['ConfigMap', 'ConfigMap', 'WorkflowTemplate'],
  );
  const [sqlInputs, sql, workflow] = rendered;
  assert(rendered.every(({ metadata }) => metadata.namespace === releases));
  const name = `rebuild-current-owner-${action}-v1`;
  const { spec } = workflow;
  assert.deepEqual(workflow.metadata, { name, namespace: releases });
  assert.deepEqual(
    Object.keys(spec).sort(),
    [
      'activeDeadlineSeconds',
      'arguments',
      'entrypoint',
      'podMetadata',
      'securityContext',
      'serviceAccountName',
      'synchronization',
      'templates',
      'volumes',
    ],
    'Owner workflow exposes unreviewed spec fields',
  );
  assert.deepEqual(spec.arguments, { parameters: [{ name: 'release-digest' }] });
  assert.equal(spec.serviceAccountName, 'release-executor');
  assert.deepEqual(spec.synchronization, {
    mutexes: [{ name: 'fleetiq-workload-database' }],
  });
  assert.deepEqual(spec.podMetadata, {
    labels: { 'app.kubernetes.io/component': 'fleetiq-demo-rebuild-current-owner' },
  });
  assert.equal(spec.activeDeadlineSeconds, 300);
  assert.deepEqual(spec.securityContext, {
    runAsNonRoot: true,
    runAsUser: 10001,
    runAsGroup: 10001,
    fsGroup: 10001,
    seccompProfile: { type: 'RuntimeDefault' },
  });
  const [template] = spec.templates;
  assert.deepEqual(Object.keys(template).sort(), [
    'activeDeadlineSeconds',
    'container',
    'name',
  ]);
  assert.equal(spec.templates.length, 1);
  assert.equal(template.name, spec.entrypoint);
  assert.equal(template.activeDeadlineSeconds, 120);
  const { container } = template;
  assert.equal(container.image, postgres);
  assert.equal(container.imagePullPolicy, 'Never');
  assert.deepEqual(container.command, ['psql']);
  assert.deepEqual(
    container.args,
    [
      '-X',
      '--no-password',
      '--set=ON_ERROR_STOP=1',
      '--set=release_digest={{workflow.parameters.release-digest}}',
      `--file=/operation/rebuild-current/${action}.sql`,
    ],
    'Owner entrypoint differs from the reviewed batch',
  );
  assert.deepEqual(container.securityContext, {
    allowPrivilegeEscalation: false,
    readOnlyRootFilesystem: true,
    capabilities: { drop: ['ALL'] },
  });
  assert.deepEqual(container.resources, {
    requests: { cpu: '100m', memory: '32Mi' },
    limits: { cpu: '500m', memory: '128Mi' },
  });
  assert.deepEqual(container.volumeMounts, [
    { name: 'database-ca', mountPath: '/etc/fleetiq/database', readOnly: true },
    { name: 'operation', mountPath: '/operation', readOnly: true },
  ]);
  assert.deepEqual(Object.keys(container).sort(), [
    'args',
    'command',
    'env',
    'image',
    'imagePullPolicy',
    'resources',
    'securityContext',
    'volumeMounts',
  ]);
  assert.equal(sqlInputs.immutable, true);
  assert.equal(sql.immutable, true);
  assert.match(
    sqlInputs.metadata.name,
    new RegExp(`^rebuild-owner-inputs-${action}-v1-[a-z0-9]{10}$`, 'u'),
  );
  assert.match(
    sql.metadata.name,
    new RegExp(`^workload-database-sql-${action}-v1-[a-z0-9]{10}$`, 'u'),
  );
  assert.deepEqual(sqlInputs.data, { ...inputs, 'inventory.json': inventory });
  const { env } = container;
  const fixed = {
    PGDATABASE: 'fleetiq',
    PGUSER: 'fleetiq_migrator',
    PGPORT: '5432',
    PGSSLMODE: 'verify-full',
    PGSSLROOTCERT: '/etc/fleetiq/database/ca.crt',
    PGGSSENCMODE: 'disable',
    PGCONNECT_TIMEOUT: '5',
    FLEETIQ_LEGACY_ROLE: 'fleetiq_runtime',
  };
  const fromInputs = Object.fromEntries(Object.keys(inputs).map((key) => [key, key]));
  fromInputs.FLEETIQ_MIGRATION_INVENTORY = 'inventory.json';
  assert.deepEqual(
    new Map(env.map(({ name, ...source }) => [name, source])),
    new Map([
      ...Object.entries(fixed).map(([name, value]) => [name, { value }]),
      ...Object.entries(fromInputs).map(([name, key]) => [
        name,
        { valueFrom: { configMapKeyRef: { name: sqlInputs.metadata.name, key } } },
      ]),
      [
        'PGPASSWORD',
        {
          valueFrom: {
            secretKeyRef: { name: 'workload-database-owner', key: 'password' },
          },
        },
      ],
    ]),
  );
  assert.equal(
    env.length,
    Object.keys(fixed).length + Object.keys(fromInputs).length + 1,
  );
  const [ca, batch] = spec.volumes;
  assert.equal(spec.volumes.length, 2);
  assert.deepEqual(ca, {
    name: 'database-ca',
    configMap: {
      name: 'workload-database-ca',
      items: [{ key: 'ca.crt', path: 'ca.crt' }],
    },
  });
  assert.equal(batch.name, 'operation');
  assert.equal(batch.configMap.name, sql.metadata.name);
  const paths = batch.configMap.items.map(({ key, path }) => {
    assert.equal(sql.data[key], readFileSync(resolve(operations, path), 'utf8'));
    return path;
  });
  assert.deepEqual(
    paths.sort(),
    [
      ...['context', 'policy', ...(action === 'grant' ? ['verification'] : [])].map(
        (file) => `workload-database/base/sql/${file}.sql`,
      ),
      ...['acl', 'apply-acl', 'context', 'revoke', action].map(
        (file) => `rebuild-current/${file}.sql`,
      ),
    ].sort(),
  );
}

export function checkRebuildOwnerWorkflows(
  tools,
  { namespace, consumer, postgres, workloads },
) {
  const directory = mkdtempSync(resolve(tmpdir(), 'fleetiq-rebuild-owner-'));
  try {
    cpSync(operations, directory, { recursive: true });
    const releases = `${consumer}-releases`;
    const inventory = readFileSync(
      resolve(operations, 'workload-database/example/inventory.json'),
      'utf8',
    );
    const actions = ['grant', 'withdraw'];
    const workflows = actions.flatMap((action, index) => {
      const cwd = resolve(directory, 'rebuild-current-owner', action);
      const inputs = {
        PGHOST: `fleetiq-db-rw.${namespace}.svc`,
        FLEETIQ_DATABASE_OID: '16401',
        FLEETIQ_WORKLOADS: JSON.stringify(workloads),
        FLEETIQ_RELEASE_DIGEST: `sha256:${String(index + 1).repeat(64)}`,
      };
      writeFileSync(
        resolve(cwd, 'reviewed-owner.env'),
        `${Object.entries(inputs)
          .map(([key, value]) => `${key}=${value}`)
          .join('\n')}\n`,
      );
      const render = () => documents(tools.kustomize(['build', cwd]));
      assert.throws(render, /kustomize build/u);
      writeFileSync(resolve(cwd, 'inventory.json'), inventory);
      tools.kustomize(['edit', 'set', 'namespace', releases], { cwd });
      tools.kustomize(['edit', 'set', 'image', `invalid.invalid/psql=${postgres}`], {
        cwd,
      });
      const rendered = render();
      const reviewed = { action, releases, postgres, inputs, inventory };
      checkWorkflow(rendered, reviewed);
      const overlay = resolve(cwd, 'kustomization.yaml');
      const overlayBytes = readFileSync(overlay, 'utf8');
      writeFileSync(
        overlay,
        overlayBytes.replace(
          `--file=/operation/rebuild-current/${action}.sql`,
          '--file=/operation/unselected.sql',
        ),
      );
      const wrongBatch = render();
      assert.throws(
        () => checkWorkflow(wrongBatch, reviewed),
        /Owner entrypoint differs from the reviewed batch/u,
      );
      const withExit = parse(overlayBytes);
      withExit.patches[0].patch +=
        '- op: add\n  path: /spec/onExit\n  value: execute\n';
      writeFileSync(overlay, stringify(withExit));
      const repeatOnExit = render();
      validateSchemas(tools, repeatOnExit);
      assert.throws(
        () => checkWorkflow(repeatOnExit, reviewed),
        /Owner workflow exposes unreviewed spec fields/u,
      );
      return rendered;
    });
    return {
      resources: workflows.length,
      schemas: validateSchemas(tools, workflows),
    };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
