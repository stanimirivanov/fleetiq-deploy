import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { posix, resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { parse, stringify } from 'yaml';
import { root } from '../process.mjs';
import { documents, validateSchemas } from './render.mjs';

const operations = resolve(root, 'operations');

function checkWorkflow(
  rendered,
  { action, version, releases, postgres, inputs, inventory },
) {
  assert.deepEqual(
    rendered.map(({ kind }) => kind),
    ['ConfigMap', 'ConfigMap', 'WorkflowTemplate'],
  );
  const [sqlInputs, sql, workflow] = rendered;
  assert(rendered.every(({ metadata }) => metadata.namespace === releases));
  const name = `rebuild-current-owner-${action}-v${version}`;
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
      'templates',
      'volumes',
    ],
    'Owner workflow exposes unreviewed spec fields',
  );
  assert.equal(spec.entrypoint, 'execute');
  assert.deepEqual(spec.arguments, { parameters: [{ name: 'release-digest' }] });
  assert.equal(spec.serviceAccountName, 'release-executor');
  assert.deepEqual(spec.podMetadata, {
    labels: { 'app.kubernetes.io/component': 'fleetiq-demo-rebuild-current-owner' },
  });
  assert.equal(spec.activeDeadlineSeconds, 900);
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
    'synchronization',
  ]);
  assert.equal(spec.templates.length, 1);
  assert.equal(template.name, spec.entrypoint);
  assert.equal(template.activeDeadlineSeconds, 120);
  assert.deepEqual(template.synchronization, {
    mutexes: [{ name: 'fleetiq-workload-database' }],
  });
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
    new RegExp(`^rebuild-owner-inputs-${action}-v${version}-[a-z0-9]{10}$`, 'u'),
  );
  assert.match(
    sql.metadata.name,
    new RegExp(`^workload-database-sql-${action}-v${version}-[a-z0-9]{10}$`, 'u'),
  );
  assert(
    isDeepStrictEqual(sqlInputs.data, { ...inputs, 'inventory.json': inventory }),
    'Owner input bytes differ from the reviewed inputs',
  );
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
  const items = [
    { key: 'context.sql', path: 'workload-database/base/sql/context.sql' },
    { key: 'policy.sql', path: 'workload-database/base/sql/policy.sql' },
    ...['acl', 'apply-acl', 'context', 'revoke'].map((file) => {
      const observerInclude = version === 2 && ['acl', 'revoke'].includes(file);
      return {
        key: `${observerInclude ? 'observer' : 'rebuild'}-${file}.sql`,
        path: `rebuild-current/${file}.sql`,
      };
    }),
    ...(version === 2
      ? ['acl', 'revoke'].map((file) => ({
          key: `rebuild-${file}.sql`,
          path: `rebuild-current/rebuild-${file}-v1.sql`,
        }))
      : []),
    { key: `rebuild-${action}.sql`, path: `rebuild-current/${action}.sql` },
    ...(action === 'grant'
      ? [
          {
            key: 'verification.sql',
            path: 'workload-database/base/sql/verification.sql',
          },
        ]
      : []),
  ];
  assert(
    isDeepStrictEqual(batch, {
      name: 'operation',
      configMap: { name: sql.metadata.name, items },
    }),
    'Owner SQL projection differs from the reviewed inventory',
  );
  const mountedPaths = new Set(items.map(({ path }) => posix.join('/operation', path)));
  const observerSources =
    version === 2
      ? {
          'observer-acl.sql': 'rebuild-current-observer/acl.sql',
          'observer-revoke.sql': 'rebuild-current-observer/revoke.sql',
          'rebuild-acl.sql': 'rebuild-current/acl.sql',
          'rebuild-revoke.sql': 'rebuild-current/revoke.sql',
        }
      : {};
  for (const { key, path } of items) {
    const bytes = readFileSync(
      resolve(operations, observerSources[key] ?? path),
      'utf8',
    );
    assert(sql.data[key] === bytes, `Owner SQL bytes differ for ${key}`);
    for (const [, argument] of bytes.matchAll(/^[ \t]*\\ir\b[ \t]*(.*)$/gmu)) {
      const include = argument.trim();
      assert(
        /^[\w./-]+$/u.test(include) &&
          !posix.isAbsolute(include) &&
          mountedPaths.has(posix.resolve('/operation', posix.dirname(path), include)),
        `Owner SQL include falls outside the reviewed projection for ${key}`,
      );
    }
  }
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
    const selections = [1, 2].flatMap((version) =>
      ['grant', 'withdraw'].map((action) => ({ action, version })),
    );
    const workflows = selections.flatMap(({ action, version }, index) => {
      const overlayName = version === 1 ? action : `${action}-v2`;
      const cwd = resolve(directory, 'rebuild-current-owner', overlayName);
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
      const reviewed = { action, version, releases, postgres, inputs, inventory };
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
      const withUnreviewedMount = parse(overlayBytes);
      withUnreviewedMount.patches[0].patch +=
        '- op: replace\n  path: /spec/volumes/1/configMap/items/0/path\n  value: nonexistent-owner-sql-fixture.sql\n';
      writeFileSync(overlay, stringify(withUnreviewedMount));
      const unreviewedMount = render();
      assert.throws(
        () => checkWorkflow(unreviewedMount, reviewed),
        /Owner SQL projection differs from the reviewed inventory/u,
      );
      const withWorkflowLock = parse(overlayBytes);
      withWorkflowLock.patches[0].patch +=
        '- op: add\n  path: /spec/synchronization\n  value: { mutexes: [{ name: fleetiq-workload-database }] }\n';
      writeFileSync(overlay, stringify(withWorkflowLock));
      const workflowLevelLock = render();
      validateSchemas(tools, workflowLevelLock);
      assert.throws(
        () => checkWorkflow(workflowLevelLock, reviewed),
        /Owner workflow exposes unreviewed spec fields/u,
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
