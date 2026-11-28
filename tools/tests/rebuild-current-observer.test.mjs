import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { stringify } from 'yaml';
import { checkRebuildObserverRuntime } from '../manifests/rebuild-current-observer.mjs';
import { checkRebuildOwnerWorkflows } from '../manifests/rebuild-current-owner.mjs';
import { documents } from '../manifests/render.mjs';
import { manifestTools, toolsLock } from '../manifests/toolchain.mjs';
import { root } from '../process.mjs';

const tools = manifestTools();
const file = (...parts) => resolve(root, ...parts);
const selection = JSON.parse(
  readFileSync(file('environments/minimal-demo/backend.json'), 'utf8'),
);
const selectionInput = { consumer: 'qual-fleet', image: selection.backend.reference };

test('the fenced runtime qualifies its exact GET, checked observer and scoped network', () => {
  const { resources, schemas } = checkRebuildObserverRuntime(tools, selectionInput);
  assert.equal(schemas, resources);
});

test('the runtime refuses an unfenced observer or an invalid route selection', () => {
  for (const [flag, replacement] of [
    ['maintenance=true', 'maintenance=false'],
    [
      'rebuildCurrentObserver.tenant=pilot:tenant',
      'rebuildCurrentObserver.tenant=pilot/tenant',
    ],
    [
      'rebuildCurrentObserver.tenant=pilot:tenant',
      'rebuildCurrentObserver.tenant=pilot%2Ftenant',
    ],
    ['rebuildCurrentObserver.version=2', 'rebuildCurrentObserver.version=0'],
  ]) {
    assert.throws(
      () =>
        checkRebuildObserverRuntime(
          {
            ...tools,
            helm(args) {
              if (!args.includes('rebuildCurrentObserver.version=2'))
                return tools.helm(args);
              return tools.helm(args.map((arg) => (arg === flag ? replacement : arg)));
            },
          },
          selectionInput,
        ),
      /helm template/u,
    );
  }
});

test('the observer requires exactly one private IPv4 issuer host route', () => {
  for (const cidrs of [
    '172.18.0.0/24',
    '203.0.113.10/32',
    '127.0.0.1/32',
    '172.15.0.1/32',
    '172.32.0.1/32',
    '10.0.256.1/32',
    '10.0.0.01/32',
    '10.0.0.1/32,192.168.1.2/32',
  ]) {
    assert.throws(
      () =>
        checkRebuildObserverRuntime(
          {
            ...tools,
            helm(args) {
              if (!args.includes('rebuildCurrentObserver.version=2'))
                return tools.helm(args);
              return tools.helm([...args, '--set', `network.oidcCidrs={${cidrs}}`]);
            },
          },
          selectionInput,
        ),
      /helm template/u,
      cidrs,
    );
  }
});

test('manifest qualification rejects broadening the observer route', () => {
  const weakened = {
    ...tools,
    helm(args) {
      const output = tools.helm(args);
      if (!args.includes('rebuildCurrentObserver.version=2')) return output;
      return output.replace('type: Exact', 'type: PathPrefix');
    },
  };
  assert.throws(
    () => checkRebuildObserverRuntime(weakened, selectionInput),
    /PathPrefix/u,
  );
});

test('manifest qualification rejects removing either observer routine-marker exclusion', () => {
  const observer = 'fleetiq-rebuild-current-observer';
  for (const [name, selector] of [
    [observer, (spec) => spec.endpointSelector],
    [`${observer}-postgres`, (spec) => spec.ingress[0].fromEndpoints[0]],
  ]) {
    const weakened = {
      ...tools,
      helm(args) {
        const output = tools.helm(args);
        if (!args.includes('rebuildCurrentObserver.version=2')) return output;
        const rendered = documents(output);
        const { spec } = rendered.find(
          ({ kind, metadata }) =>
            kind === 'CiliumNetworkPolicy' && metadata.name === name,
        );
        delete selector(spec).matchExpressions;
        return rendered.map((resource) => stringify(resource)).join('---\n');
      },
    };
    assert.throws(
      () => checkRebuildObserverRuntime(weakened, selectionInput),
      /DoesNotExist/u,
      name,
    );
  }
});

test('the observer login is admitted with the rebuild and disabled whenever the owner is admitted', () => {
  for (const [phase, logins] of [
    ['rebuild-current-observer-owner', ['fleetiq_migrator']],
    [
      'rebuild-current-observer',
      ['fleetiq_rebuild_current', 'fleetiq_rebuild_current_observer'],
    ],
  ]) {
    const rendered = documents(
      tools.helm([
        'template',
        'fleetiq',
        file('charts/fleetiq-data'),
        '--namespace',
        'qual-fleet-data',
        '--kube-version',
        toolsLock.kubernetes,
        '--values',
        file('environments/minimal-demo/data.yaml'),
        '--values',
        file(`environments/minimal-demo/${phase}.yaml`),
      ]),
    );
    const cluster = rendered.find(({ kind }) => kind === 'Cluster');
    const roles = rendered
      .filter(({ kind }) => kind === 'DatabaseRole')
      .map(({ spec }) => spec);
    assert.deepEqual(
      [...cluster.spec.managed.roles, ...roles]
        .filter(({ login }) => login)
        .map(({ name }) => name),
      logins,
    );
    assert.deepEqual(cluster.spec.postgresql.pg_hba, [
      ...logins.map((name) => `hostssl fleetiq ${name} all scram-sha-256`),
      'host all all all reject',
    ]);
    const login = logins.includes('fleetiq_rebuild_current_observer');
    assert.deepEqual(
      roles.find(({ name }) => name === 'fleetiq_rebuild_current_observer'),
      {
        cluster: { name: 'fleetiq-db' },
        name: 'fleetiq_rebuild_current_observer',
        databaseRoleReclaimPolicy: 'retain',
        connectionLimit: 10,
        inherit: false,
        login,
        ...(login
          ? { passwordSecret: { name: 'fleetiq-db-rebuild-current-observer' } }
          : { disablePassword: true }),
      },
    );
  }
});

test('the approved owner grant and withdrawal each have a versioned observer template', () => {
  const [data] = documents(
    readFileSync(file('environments/minimal-demo/data.yaml'), 'utf8'),
  );
  const [{ workloadDatabase }] = documents(
    readFileSync(file('environments/minimal-demo/runtime.yaml'), 'utf8'),
  );
  assert.deepEqual(
    checkRebuildOwnerWorkflows(tools, {
      namespace: 'qual-fleet-data',
      consumer: 'qual-fleet',
      postgres: data.image,
      workloads: workloadDatabase.workloads,
    }),
    { resources: 12, schemas: 12 },
  );
});
