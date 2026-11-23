import assert from 'node:assert/strict';
import test from 'node:test';
import { minimalDemoResources } from '../manifests/minimal-demo-network.mjs';

const selection = {
  consumer: 'fleetiq',
  simulatorAttempt: 'demo-launch-0123456789abcdef01234567',
  issuerAddress: '172.18.0.4',
};
const find = (resources, kind, namespace, name) =>
  resources.find(
    (resource) =>
      resource.kind === kind &&
      resource.metadata.namespace === namespace &&
      resource.metadata.name === name,
  );
const app = (name) => ({ 'app.kubernetes.io/name': name });

test('minimal demo strictly isolates the three delegated namespaces and keeps ingest private', () => {
  const resources = minimalDemoResources(selection);
  const spaces = ['fleetiq-apps', 'fleetiq-data', 'fleetiq-demo-support'];
  assert.deepEqual(
    resources
      .filter(({ kind }) => kind === 'Namespace')
      .map(({ metadata }) => metadata.name),
    spaces,
  );
  for (const space of spaces) {
    const desired = find(resources, 'Namespace', undefined, space);
    assert.equal(desired.metadata.labels['k8s-infrastructure.io/consumer'], 'fleetiq');
    assert.equal(
      desired.metadata.labels['pod-security.kubernetes.io/enforce'],
      'baseline',
    );
    assert.equal(
      desired.metadata.labels['pod-security.kubernetes.io/enforce-version'],
      'v1.35',
    );
    assert.equal(
      desired.metadata.annotations['argocd.argoproj.io/sync-options'],
      'Prune=false,Delete=false',
    );
    assert.deepEqual(
      find(resources, 'NetworkPolicy', space, 'fleetiq-default-deny').spec,
      { podSelector: {}, policyTypes: ['Ingress', 'Egress'] },
    );
  }
  assert.deepEqual(find(resources, 'Service', spaces[0], 'tcp-ingestion').spec, {
    type: 'ClusterIP',
    ipFamilyPolicy: 'SingleStack',
    ipFamilies: ['IPv4'],
    selector: app('fleetiq-ingest-tcp'),
    ports: [{ name: 'ingest', protocol: 'TCP', port: 55027, targetPort: 55027 }],
  });
  assert.deepEqual(
    find(resources, 'ConfigMap', spaces[0], 'fleetiq-ingest-tcp-network').data,
    { FLEETIQ_TCP_BIND_ADDRESS: '0.0.0.0:55027' },
  );
  assert.deepEqual(
    resources
      .filter(
        ({ kind }) =>
          !['Namespace', 'NetworkPolicy', 'CiliumNetworkPolicy'].includes(kind),
      )
      .map(({ kind }) => kind)
      .sort(),
    ['ConfigMap', 'Service'],
  );
  const ingress = find(
    resources,
    'CiliumNetworkPolicy',
    spaces[0],
    'fleetiq-ingest-tcp-simulator',
  );
  assert.deepEqual(ingress.spec.ingress[0].fromEndpoints, [
    {
      matchExpressions: [
        { key: 'k8s-infrastructure.io/demo-routine', operator: 'DoesNotExist' },
      ],
      matchLabels: {
        'k8s:io.kubernetes.pod.namespace': spaces[0],
        'k8s-infrastructure.io/demo-attempt': selection.simulatorAttempt,
        'io.cilium.k8s.policy.serviceaccount': 'demo-run-0123456789abcdef01234567',
      },
    },
  ]);
  assert.deepEqual(ingress.spec.ingress[0].toPorts, [
    { ports: [{ protocol: 'TCP', port: '55027' }] },
  ]);
  const simulator = find(
    resources,
    'CiliumNetworkPolicy',
    spaces[0],
    'fleetiq-simulator',
  );
  assert.deepEqual(simulator.spec.endpointSelector.matchLabels, {
    'k8s-infrastructure.io/demo-attempt': selection.simulatorAttempt,
    'io.cilium.k8s.policy.serviceaccount': 'demo-run-0123456789abcdef01234567',
  });
  assert.deepEqual(
    simulator.spec.egress.map(({ toEndpoints, toPorts }) => ({ toEndpoints, toPorts })),
    [
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
              { protocol: 'UDP', port: '53' },
              { protocol: 'TCP', port: '53' },
            ],
          },
        ],
      },
      {
        toEndpoints: [
          {
            matchLabels: {
              'k8s:io.kubernetes.pod.namespace': spaces[0],
              ...app('fleetiq-ingest-tcp'),
            },
            matchExpressions: [
              { key: 'k8s-infrastructure.io/demo-routine', operator: 'DoesNotExist' },
            ],
          },
        ],
        toPorts: [{ ports: [{ protocol: 'TCP', port: '55027' }] }],
      },
    ],
  );
});

test('minimal demo inventory rejects cross-namespace, broad and untranslated policy drift', async () => {
  const { assertMinimalDemoResources } = await import(
    '../manifests/minimal-demo-network.mjs'
  );
  const resources = minimalDemoResources(selection);
  assert.equal(assertMinimalDemoResources(resources.toReversed(), selection), 27);
  const mutations = [
    (copy) => copy.push(structuredClone(copy[0])),
    (copy) => {
      copy.pop();
    },
    (copy) => {
      copy.find((item) => item.kind === 'Service').spec.type = 'NodePort';
    },
    (copy) => {
      delete find(
        copy,
        'CiliumNetworkPolicy',
        'fleetiq-apps',
        'fleetiq-ingest-tcp-simulator',
      ).spec.ingress[0].fromEndpoints[0].matchLabels['k8s:io.kubernetes.pod.namespace'];
    },
    (copy) => {
      find(
        copy,
        'CiliumNetworkPolicy',
        'fleetiq-apps',
        'fleetiq-simulator',
      ).spec.egress.push({});
    },
    (copy) => {
      find(
        copy,
        'NetworkPolicy',
        'fleetiq-apps',
        'fleetiq-alertmanager',
      ).spec.egress[1].ports[0].port = 443;
    },
    (copy) => {
      find(
        copy,
        'CiliumNetworkPolicy',
        'fleetiq-apps',
        'fleetiq-backend-gateway',
      ).spec.egress[0].toEntities = ['world'];
    },
  ];
  for (const mutate of mutations) {
    const candidate = structuredClone(resources);
    mutate(candidate);
    assert.throws(
      () => assertMinimalDemoResources(candidate, selection),
      /inventory or policy differs/,
    );
  }
});
