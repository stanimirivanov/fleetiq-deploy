import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { root } from '../process.mjs';
import { demoNamespaces } from './minimal-demo-network.mjs';
import { documents, validateSchemas } from './render.mjs';
import { toolsLock } from './toolchain.mjs';

export function checkRebuildObserverRuntime(tools, { consumer, image }) {
  const { apps, data } = demoNamespaces(consumer);
  const runtimeArgs = [
    'template',
    'fleetiq',
    resolve(root, 'charts/fleetiq-runtime'),
    '--namespace',
    apps,
    '--kube-version',
    toolsLock.kubernetes,
    '--values',
    resolve(root, 'environments/local-preview/runtime.yaml'),
    '--values',
    resolve(root, 'environments/qualified-local-preview/runtime.yaml'),
    '--values',
    resolve(root, 'environments/minimal-demo/runtime.yaml'),
    '--set-string',
    `network.databaseNamespace=${data}`,
    '--set-string',
    `backend.image=${image}`,
    '--set',
    'maintenance=true',
  ];
  const baseline = documents(tools.helm(runtimeArgs));
  const rendered = documents(
    tools.helm([
      ...runtimeArgs,
      '--set-literal',
      'rebuildCurrentObserver.tenant=pilot:tenant',
      '--set-literal',
      'rebuildCurrentObserver.asset=asset-1',
      '--set-literal',
      'rebuildCurrentObserver.property=temperature',
      '--set',
      'rebuildCurrentObserver.version=2',
    ]),
  );
  const [baselineRoute] = baseline.filter(({ kind }) => kind === 'HTTPRoute');
  const routes = rendered.filter(({ kind }) => kind === 'HTTPRoute');
  assert.equal(routes.length, 1);
  assert.deepEqual(routes[0].metadata, baselineRoute.metadata);
  assert.deepEqual(routes[0].spec, {
    parentRefs: [
      {
        group: 'gateway.networking.k8s.io',
        kind: 'Gateway',
        name: 'fleetiq',
        sectionName: 'https',
      },
    ],
    hostnames: ['fleet.local.test'],
    rules: [
      {
        matches: [
          {
            method: 'GET',
            path: {
              type: 'Exact',
              value:
                '/api/v1/tenants/pilot:tenant/assets/asset-1/properties/temperature/versions/2/current',
            },
          },
        ],
        backendRefs: [
          {
            group: '',
            kind: 'Service',
            name: 'fleetiq-rebuild-current-observer',
            port: 8080,
            weight: 1,
          },
        ],
      },
    ],
  });
  const deployments = rendered.filter(({ kind }) => kind === 'Deployment');
  assert.deepEqual(
    new Map(deployments.map(({ metadata, spec }) => [metadata.name, spec.replicas])),
    new Map([
      ['fleetiq-backend', 0],
      ['fleetiq-edge', 0],
      ['fleetiq-rebuild-current-observer', 1],
    ]),
  );
  const observer = deployments.find(
    ({ metadata }) => metadata.name === 'fleetiq-rebuild-current-observer',
  );
  const {
    containers: [backend],
    automountServiceAccountToken,
  } = observer.spec.template.spec;
  assert.equal(automountServiceAccountToken, false);
  assert.equal(backend.image, image);
  assert.deepEqual(backend.args, ['serve', '--check-schema']);
  assert.deepEqual(backend.env.find(({ name }) => name === 'DATABASE_URL').valueFrom, {
    secretKeyRef: { name: 'fleetiq-db-rebuild-current-observer-url', key: 'url' },
  });
  assert.equal(
    backend.env.find(({ name }) => name === 'FLEETIQ_BROWSER_ORIGIN').value,
    'https://fleet.local.test:18443',
  );
  assert.deepEqual(observer.spec.strategy, { type: 'Recreate' });
  assert.equal(observer.spec.template.spec.serviceAccountName, observer.metadata.name);
  const account = rendered.find(
    ({ kind, metadata }) =>
      kind === 'ServiceAccount' && metadata.name === observer.metadata.name,
  );
  assert.equal(account.automountServiceAccountToken, false);
  const service = rendered.find(
    ({ kind, metadata }) =>
      kind === 'Service' && metadata.name === observer.metadata.name,
  );
  assert.deepEqual(service.spec, {
    type: 'ClusterIP',
    selector: observer.spec.selector.matchLabels,
    ports: [{ name: 'http', port: 8080, targetPort: 'http', protocol: 'TCP' }],
  });
  const cilium = rendered.filter(({ kind }) => kind === 'CiliumNetworkPolicy');
  const name = 'fleetiq-rebuild-current-observer';
  const observerLabels = {
    'app.kubernetes.io/name': name,
    'io.cilium.k8s.policy.serviceaccount': name,
  };
  const database = { 'cnpg.io/cluster': 'fleetiq-db' };
  const port = (number) => [{ ports: [{ port: String(number), protocol: 'TCP' }] }];
  assert.deepEqual(
    cilium.find(({ metadata }) => metadata.name === name),
    {
      apiVersion: 'cilium.io/v2',
      kind: 'CiliumNetworkPolicy',
      metadata: { name, namespace: apps },
      spec: {
        endpointSelector: { matchLabels: observerLabels },
        ingress: [{ fromEntities: ['ingress'], toPorts: port(8080) }],
        egress: [
          {
            toEndpoints: [
              {
                matchLabels: {
                  'k8s:io.kubernetes.pod.namespace': 'kube-system',
                  'k8s-app': 'kube-dns',
                },
              },
            ],
            toPorts: [
              {
                ports: [
                  { port: '53', protocol: 'UDP' },
                  { port: '53', protocol: 'TCP' },
                ],
              },
            ],
          },
          {
            toEndpoints: [
              {
                matchLabels: {
                  'k8s:io.kubernetes.pod.namespace': data,
                  ...database,
                },
              },
            ],
            toPorts: port(5432),
          },
          { toCIDR: ['203.0.113.10/32'], toPorts: port(19443) },
          { toEntities: ['host'], toPorts: port(8443) },
        ],
      },
    },
  );
  assert.deepEqual(
    cilium.find(({ metadata }) => metadata.name === `${name}-postgres`),
    {
      apiVersion: 'cilium.io/v2',
      kind: 'CiliumNetworkPolicy',
      metadata: { name: `${name}-postgres`, namespace: data },
      spec: {
        endpointSelector: { matchLabels: database },
        ingress: [
          {
            fromEndpoints: [
              {
                matchLabels: {
                  'k8s:io.kubernetes.pod.namespace': apps,
                  ...observerLabels,
                },
              },
            ],
            toPorts: port(5432),
          },
        ],
      },
    },
  );
  assert.equal(rendered.length, baseline.length + 5);
  assert.deepEqual(
    rendered
      .filter(({ metadata }) => ![name, `${name}-postgres`].includes(metadata.name))
      .map((resource) => (resource.kind === 'HTTPRoute' ? baselineRoute : resource)),
    baseline,
    'The observer changes only the selected route and adds its reviewed resources',
  );
  return { resources: rendered.length, schemas: validateSchemas(tools, rendered) };
}
