import assert from 'node:assert/strict';
import { budgetPolicy } from './budget-policy.mjs';
import { dataPolicy } from './data-policy.mjs';
import { networkPolicy } from './network-policy.mjs';
import { workloadPolicy } from './workload-policy.mjs';

const expected = [
  ['v1', 'Namespace', '', 'fleetiq-local'],
  ['v1', 'Namespace', '', 'fleetiq-data'],
  ['v1', 'ResourceQuota', 'fleetiq-local', 'fleet-budget'],
  ['v1', 'ResourceQuota', 'fleetiq-data', 'fleet-data-budget'],
  ...['backend', 'edge'].flatMap((component) =>
    ['ServiceAccount', 'Deployment', 'Service'].map((kind) => [
      kind === 'Deployment' ? 'apps/v1' : 'v1',
      kind,
      'fleetiq-local',
      `fleetiq-${component}`,
    ]),
  ),
  ...['default-deny', 'backend', 'edge'].map((name) => [
    'networking.k8s.io/v1',
    'NetworkPolicy',
    'fleetiq-local',
    `fleetiq-${name}`,
  ]),
  ...['default-deny', 'instances'].map((name) => [
    'networking.k8s.io/v1',
    'NetworkPolicy',
    'fleetiq-data',
    `fleetiq-db-${name}`,
  ]),
  ['gateway.networking.k8s.io/v1', 'Gateway', 'fleetiq-local', 'fleetiq'],
  ['gateway.networking.k8s.io/v1', 'HTTPRoute', 'fleetiq-local', 'fleetiq'],
  ['postgresql.cnpg.io/v1', 'Cluster', 'fleetiq-data', 'fleetiq-db'],
]
  .map((identity) => identity.join('|'))
  .sort();

/** D04 validates the complete offline composition; it grants no activation authority. */
export function manifestPolicy(
  resources,
  context = { maintenance: false, nonlocal: false },
) {
  assert.deepEqual(
    resources
      .map((r) =>
        [r.apiVersion, r.kind, r.metadata.namespace ?? '', r.metadata.name].join('|'),
      )
      .sort(),
    [
      ...expected,
      ...(context.providerLocal
        ? ['cilium.io/v2|CiliumNetworkPolicy|fleetiq-local|fleetiq-gateway-ingress']
        : []),
    ].sort(),
    'Unexpected/missing resource, namespace, GVK or duplicate identity',
  );
  for (const resource of resources) {
    assert(
      !resource.metadata.annotations?.['helm.sh/hook'],
      'No recurring migration/initialization hooks',
    );
    switch (resource.kind) {
      case 'Namespace':
        assert.equal(
          resource.metadata.labels['pod-security.kubernetes.io/enforce'],
          'restricted',
        );
        assert.equal(
          resource.metadata.labels['pod-security.kubernetes.io/enforce-version'],
          'v1.35',
        );
        break;
      case 'Deployment':
        workloadPolicy(resource, context);
        break;
      case 'Cluster':
        dataPolicy(resource, context);
        assert.equal(resource.metadata.annotations['helm.sh/resource-policy'], 'keep');
        break;
      case 'ServiceAccount':
        assert.equal(resource.automountServiceAccountToken, false);
        break;
      case 'Service':
        assert.equal(resource.spec.type, 'ClusterIP');
        assert(
          !resource.spec.externalIPs &&
            !resource.spec.loadBalancerIP &&
            !resource.spec.externalName,
        );
        assert.deepEqual(resource.spec.ports, [
          { name: 'http', port: 8080, targetPort: 'http', protocol: 'TCP' },
        ]);
        assert.equal(
          resource.spec.selector['app.kubernetes.io/name'],
          resource.metadata.name,
        );
        break;
      case 'NetworkPolicy':
        networkPolicy(resource, context);
        break;
      case 'CiliumNetworkPolicy':
        assert.equal(context.providerLocal, true, 'Unselected Cilium ingress mode');
        assert.deepEqual(
          Object.keys(resource).sort(),
          ['apiVersion', 'kind', 'metadata', 'spec'],
          'Additional Cilium policy specifications refused',
        );
        assert.deepEqual(
          resource.spec,
          {
            endpointSelector: {
              matchLabels: { 'app.kubernetes.io/name': 'fleetiq-edge' },
            },
            ingress: [
              {
                fromEntities: ['ingress'],
                toPorts: [{ ports: [{ port: '8080', protocol: 'TCP' }] }],
              },
            ],
          },
          'Cilium allowance must remain edge-only, ingress-identity-only and port-scoped',
        );
        break;
      case 'Gateway': {
        assert(resource.spec.gatewayClassName);
        assert.equal(resource.spec.listeners.length, 1);
        const listener = resource.spec.listeners[0];
        assert.equal(listener.name, 'https');
        assert.equal(listener.hostname, 'fleet.local.test');
        assert.equal(listener.protocol, 'HTTPS');
        assert.equal(listener.port, context.providerLocal ? 8443 : 443);
        if (context.providerLocal)
          assert.equal(resource.spec.gatewayClassName, 'cilium');
        assert.equal(listener.tls.mode, 'Terminate');
        assert.equal(listener.tls.certificateRefs.length, 1);
        const cert = listener.tls.certificateRefs[0];
        assert(
          cert.name && cert.kind === 'Secret' && cert.group === '' && !cert.namespace,
        );
        assert.deepEqual(listener.allowedRoutes, { namespaces: { from: 'Same' } });
        break;
      }
      case 'HTTPRoute':
        assert.deepEqual(resource.spec, {
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
              matches: [{ path: { type: 'PathPrefix', value: '/' } }],
              backendRefs: [
                {
                  group: '',
                  kind: 'Service',
                  name: 'fleetiq-edge',
                  port: 8080,
                  weight: 1,
                },
              ],
            },
          ],
        });
        break;
      case 'ResourceQuota':
        assert(Object.keys(resource.spec.hard).length >= 5);
        if (context.providerLocal && resource.metadata.namespace === 'fleetiq-data') {
          assert.equal(resource.spec.hard['requests.storage'], '8Gi');
          assert.equal(String(resource.spec.hard.persistentvolumeclaims), '4');
        }
        break;
      default:
        assert.fail('Resource outside D04 boundary');
    }
    if (['Namespace', 'Cluster'].includes(resource.kind))
      assert.equal(
        resource.metadata.annotations['argocd.argoproj.io/sync-options'],
        'Prune=false,Delete=false',
        'Retained data/namespace must not be auto-pruned',
      );
  }
  budgetPolicy(resources);
  const backendNetwork = resources.find(
    (r) => r.kind === 'NetworkPolicy' && r.metadata.name === 'fleetiq-backend',
  ).spec;
  assert.deepEqual(backendNetwork.ingress, [
    {
      from: [
        { podSelector: { matchLabels: { 'app.kubernetes.io/name': 'fleetiq-edge' } } },
      ],
      ports: [{ protocol: 'TCP', port: 8080 }],
    },
  ]);
  assert.deepEqual(backendNetwork.egress[0], {
    to: [
      {
        namespaceSelector: {
          matchLabels: { 'kubernetes.io/metadata.name': 'fleetiq-data' },
        },
        podSelector: { matchLabels: { 'cnpg.io/cluster': 'fleetiq-db' } },
      },
    ],
    ports: [{ protocol: 'TCP', port: 5432 }],
  });
  assert.deepEqual(backendNetwork.egress[2].ports, [
    { protocol: 'TCP', port: context.providerLocal ? 19443 : 443 },
  ]);
  const edgeNetwork = resources.find(
    (r) => r.kind === 'NetworkPolicy' && r.metadata.name === 'fleetiq-edge',
  ).spec;
  assert.deepEqual(edgeNetwork.egress[0], {
    to: [
      { podSelector: { matchLabels: { 'app.kubernetes.io/name': 'fleetiq-backend' } } },
    ],
    ports: [{ protocol: 'TCP', port: 8080 }],
  });
  assert.equal(
    edgeNetwork.egress.length,
    2,
    'Edge cannot gain database/provider egress',
  );
  assert.equal(backendNetwork.egress.length, 3, 'Backend egress remains bounded');
  return resources.length;
}
