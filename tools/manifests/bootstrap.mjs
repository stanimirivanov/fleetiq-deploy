import assert from 'node:assert/strict';
import { lstatSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { root } from '../process.mjs';
import { sourceRegistration } from '../releases/source-graphs.mjs';
import { documents, validateSchemas } from './render.mjs';
import { manifestTools } from './toolchain.mjs';

const directory = resolve(root, 'environments/local-installation/bootstrap');
const labels = {
  'app.kubernetes.io/part-of': 'fleetiq',
  'k8s-infrastructure.io/consumer': 'fleetiq',
};
const annotations = { 'argocd.argoproj.io/sync-options': 'Prune=false,Delete=false' };
const budgets = [
  [
    'fleetiq-apps',
    'fleet-budget',
    {
      'requests.cpu': '1',
      'requests.memory': '1Gi',
      'limits.cpu': '4',
      'limits.memory': '2Gi',
      pods: '6',
    },
  ],
  [
    'fleetiq-data',
    'fleet-data-budget',
    {
      'requests.cpu': '1',
      'requests.memory': '1Gi',
      'limits.cpu': '2',
      'limits.memory': '2Gi',
      'requests.storage': '8Gi',
      persistentvolumeclaims: '4',
      pods: '4',
    },
  ],
  [
    'fleetiq-releases',
    'fleet-release-budget',
    {
      'requests.cpu': '1',
      'requests.memory': '1Gi',
      'limits.cpu': '2',
      'limits.memory': '2Gi',
      pods: '2',
      'count/jobs.batch': '2',
    },
  ],
];

/** Declared ownership is intent, never proof that an existing namespace can be adopted. */
export function bootstrapPolicy(resources) {
  const registration = sourceRegistration('local');
  assert.equal(budgets[0][0], registration.destinations.runtime);
  assert.equal(budgets[1][0], registration.destinations.data);
  const expected = new Map();
  const psa = Object.fromEntries(
    ['enforce', 'audit', 'warn'].flatMap((mode) => [
      [`pod-security.kubernetes.io/${mode}`, 'restricted'],
      [`pod-security.kubernetes.io/${mode}-version`, 'v1.35'],
    ]),
  );
  for (const [namespace, name, hard] of budgets) {
    expected.set(`Namespace//${namespace}`, {
      apiVersion: 'v1',
      kind: 'Namespace',
      metadata: { name: namespace, labels: { ...labels, ...psa }, annotations },
    });
    expected.set(`ResourceQuota/${namespace}/${name}`, {
      apiVersion: 'v1',
      kind: 'ResourceQuota',
      metadata: { name, namespace, labels, annotations },
      spec: { hard },
    });
  }
  assert(
    Array.isArray(resources) && resources.length === expected.size,
    'Bootstrap requires exactly three namespace/quota pairs',
  );
  const seen = new Set();
  for (const resource of resources) {
    const key = `${resource?.kind}/${resource?.metadata?.namespace ?? ''}/${resource?.metadata?.name}`;
    assert(!seen.has(key), 'Duplicate bootstrap resource');
    assert(
      expected.has(key) && isDeepStrictEqual(resource, expected.get(key)),
      'Bootstrap differs from reviewed ownership, retention, security or quota policy',
    );
    seen.add(key);
  }
  return {
    namespaces: budgets.map(([namespace]) => namespace),
    resources: resources.length,
  };
}

/** Reject remotes and transforms before invoking Kustomize. */
export function bootstrapComposition(composition) {
  assert(
    isDeepStrictEqual(composition, [
      {
        apiVersion: 'kustomize.config.k8s.io/v1beta1',
        kind: 'Kustomization',
        resources: ['namespaces.yaml', 'quotas.yaml'],
      },
    ]),
    'Bootstrap composition must use only its two local resource files',
  );
}

/** Native offline rendering only; no kubectl, private state, credentials or network. */
export function checkBootstrap(tools = manifestTools()) {
  for (const path of [directory, resolve(directory, '..')])
    assert(
      lstatSync(path).isDirectory() && !lstatSync(path).isSymbolicLink(),
      'Linked bootstrap directory refused',
    );
  for (const file of ['kustomization.yaml', 'namespaces.yaml', 'quotas.yaml']) {
    const stat = lstatSync(resolve(directory, file));
    assert(
      stat.isFile() && !stat.isSymbolicLink() && stat.size <= 128 * 1024,
      'Bootstrap input must be a bounded ordinary file',
    );
  }
  bootstrapComposition(
    documents(readFileSync(resolve(directory, 'kustomization.yaml'), 'utf8')),
  );
  const resources = documents(tools.kustomize(['build', directory]));
  const policy = bootstrapPolicy(resources);
  return {
    ...policy,
    schemas: validateSchemas(tools, resources),
    execution: 'not-performed',
    ownership: 'not-observed',
    authorization: 'not-granted',
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    assert(process.argv.length === 2, 'Bootstrap check takes no execution arguments');
    console.log(JSON.stringify(checkBootstrap(), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
