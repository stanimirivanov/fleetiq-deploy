import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';
import { documents } from '../manifests/render.mjs';
import { digest } from './contracts.mjs';

const repository = 'https://github.com/stanimirivanov/fleetiq-deploy.git';
const permissions = {
  runtime: [
    ['', 'ServiceAccount'],
    ['', 'Service'],
    ['apps', 'Deployment'],
    ['networking.k8s.io', 'NetworkPolicy'],
    ['gateway.networking.k8s.io', 'Gateway'],
    ['gateway.networking.k8s.io', 'HTTPRoute'],
    ['cilium.io', 'CiliumNetworkPolicy'],
  ],
  data: [
    ['postgresql.cnpg.io', 'Cluster'],
    ['networking.k8s.io', 'NetworkPolicy'],
  ],
};

/** Reviewed policy registration, not a live cluster or promotion record. */
export function sourceRegistration(environment) {
  assert.equal(environment, 'local', 'Unregistered source-graph environment');
  return {
    environment,
    repository,
    namespace: 'fleetiq-gitops-system',
    branch: 'environments/local/active',
    ref: 'refs/heads/environments/local/active',
    destinations: { runtime: 'fleetiq-apps', data: 'fleetiq-data' },
  };
}

/** Closed control graph. Workload manifests are rendered from verified Helm artifacts. */
export function registeredGraph(environment) {
  const registration = sourceRegistration(environment);
  const result = new Map();
  for (const [role, namespace] of Object.entries(registration.destinations)) {
    const name = `fleetiq-${environment}-${role}`;
    const metadata = {
      name,
      namespace: registration.namespace,
      labels: { 'k8s-infrastructure.io/consumer': 'fleetiq' },
    };
    result.set(`gitops/${environment}/${role}-project.yaml`, {
      apiVersion: 'argoproj.io/v1alpha1',
      kind: 'AppProject',
      metadata,
      spec: {
        sourceRepos: [repository],
        sourceNamespaces: [registration.namespace],
        destinations: [{ server: 'https://kubernetes.default.svc', namespace }],
        clusterResourceWhitelist: [],
        namespaceResourceWhitelist: permissions[role].map(([group, kind]) => ({
          group,
          kind,
        })),
        roles: [],
      },
    });
    result.set(`gitops/${environment}/${role}-application.yaml`, {
      apiVersion: 'argoproj.io/v1alpha1',
      kind: 'Application',
      metadata: structuredClone(metadata),
      spec: {
        project: name,
        source: {
          repoURL: repository,
          targetRevision: registration.ref,
          path: `releases/active/${environment}/${role}`,
          directory: { recurse: false, include: 'manifests.yaml' },
        },
        destination: { server: 'https://kubernetes.default.svc', namespace },
        syncPolicy: { syncOptions: ['FailOnSharedResource=true'] },
      },
    });
  }
  return result;
}

/** Reject unregistered/hidden graphs without echoing untrusted manifest values. */
export function sourceGraphPolicy(files) {
  const expected = registeredGraph('local');
  const present = new Map();
  const controls = new Set(['Application', 'ApplicationSet', 'AppProject']);
  function visit(value, file, nested = false) {
    if (Array.isArray(value)) {
      for (const item of value) visit(item, file, true);
      return;
    }
    if (!value || typeof value !== 'object') return;
    if (value.kind === 'List' && Array.isArray(value.items)) {
      for (const item of value.items) visit(item, file, true);
      return;
    }
    if (
      typeof value.apiVersion === 'string' &&
      value.apiVersion.startsWith('argoproj.io/') &&
      controls.has(value.kind)
    ) {
      assert(!nested && expected.has(file), 'Unregistered or nested Argo source graph');
      assert(!present.has(file), 'Duplicate Argo source graph');
      assert(
        isDeepStrictEqual(value, expected.get(file)),
        'Argo source graph differs from reviewed registration',
      );
      present.set(file, true);
    }
  }
  const hashes = [];
  for (const [file, text] of files) {
    if (!/\.(?:json|ya?ml)$/u.test(file)) continue;
    if (file.startsWith('charts/') && file.includes('/templates/')) {
      assert(
        !/(?:\bapiVersion|["']apiVersion["'])\s*:\s*["']?argoproj\.io\//u.test(text),
        'Argo resources are not allowed in workload charts',
      );
      continue;
    }
    const parsed = documents(text);
    for (const value of parsed) visit(value, file);
    if (file.startsWith('gitops/')) {
      assert(
        expected.has(file) && parsed.length === 1 && present.has(file),
        'Unknown or incomplete control-graph file',
      );
      hashes.push([file, digest(Buffer.from(text))]);
    }
  }
  assert(
    present.size === 0 || present.size === expected.size,
    'Both complete project/application pairs are required',
  );
  hashes.sort(([a], [b]) => a.localeCompare(b));
  return {
    environments: present.size ? ['local'] : [],
    graphDigest: digest(Buffer.from(JSON.stringify(hashes))),
    resources: present.size,
  };
}

/** Scope check only; complete workload, publisher and live admission are separate gates. */
export function phaseManifestPolicy(role, resources) {
  assert(Object.hasOwn(permissions, role), 'Unknown phase manifest role');
  const namespace = sourceRegistration('local').destinations[role];
  const seen = new Set();
  assert(
    resources.length > 0 && resources.length <= 32,
    'Missing or excessive phase resources',
  );
  for (const item of resources) {
    assert(
      item && typeof item === 'object' && !Array.isArray(item),
      'Invalid phase resource',
    );
    const version = typeof item.apiVersion === 'string' ? item.apiVersion : '';
    const group = version.includes('/') ? version.split('/')[0] : '';
    const versions = {
      '': 'v1',
      apps: 'apps/v1',
      'networking.k8s.io': 'networking.k8s.io/v1',
      'gateway.networking.k8s.io': 'gateway.networking.k8s.io/v1',
      'cilium.io': 'cilium.io/v2',
      'postgresql.cnpg.io': 'postgresql.cnpg.io/v1',
    };
    assert(version === versions[group], 'Unregistered phase API version');
    assert(
      permissions[role].some(([g, k]) => g === group && k === item.kind),
      'Phase resource outside project scope',
    );
    assert(
      item.metadata?.namespace === namespace &&
        typeof item.metadata.name === 'string' &&
        item.metadata.name.length > 0,
      'Wrong phase namespace or resource identity',
    );
    assert(
      !item.metadata.annotations?.['argocd.argoproj.io/hook'] &&
        !item.metadata.annotations?.['helm.sh/hook'],
      'Phase hooks are forbidden',
    );
    const identity = `${version}/${item.kind}/${item.metadata.name}`;
    assert(!seen.has(identity), 'Duplicate phase resource');
    seen.add(identity);
  }
  return resources.length;
}
