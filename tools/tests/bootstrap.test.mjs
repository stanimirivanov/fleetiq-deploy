import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  bootstrapComposition,
  bootstrapPolicy,
  checkBootstrap,
} from '../manifests/bootstrap.mjs';
import { documents } from '../manifests/render.mjs';

function inputs() {
  return ['namespaces', 'quotas'].flatMap((name) =>
    documents(
      readFileSync(
        new URL(
          `../../environments/local-installation/bootstrap/${name}.yaml`,
          import.meta.url,
        ),
        'utf8',
      ),
    ),
  );
}

test('real Kustomize/schema bootstrap check qualifies six resources without cluster or ownership claims', () => {
  const result = checkBootstrap();
  assert.deepEqual(result.namespaces, [
    'fleetiq-apps',
    'fleetiq-data',
    'fleetiq-releases',
  ]);
  const target = JSON.parse(
    readFileSync(
      new URL('../../environments/local-installation/target.json', import.meta.url),
      'utf8',
    ),
  );
  assert.deepEqual(result.namespaces, [
    target.namespaces.runtime,
    target.namespaces.data,
    target.namespaces.releases,
  ]);
  assert.equal(result.resources, 6);
  assert.equal(result.schemas, 6);
  assert.equal(result.execution, 'not-performed');
  assert.equal(result.ownership, 'not-observed');
  assert.equal(result.authorization, 'not-granted');
});

for (const [name, mutate] of [
  [
    'foreign namespace',
    (v) => {
      v[0].metadata.name = 'foreign-apps';
    },
  ],
  [
    'missing consumer ownership label',
    (v) => {
      delete v[0].metadata.labels['k8s-infrastructure.io/consumer'];
    },
  ],
  [
    'foreign owner label',
    (v) => {
      v[1].metadata.labels['k8s-infrastructure.io/consumer'] = 'other';
    },
  ],
  [
    'privileged Pod Security',
    (v) => {
      v[0].metadata.labels['pod-security.kubernetes.io/enforce'] = 'privileged';
    },
  ],
  [
    'unversioned Pod Security',
    (v) => {
      delete v[0].metadata.labels['pod-security.kubernetes.io/enforce-version'];
    },
  ],
  [
    'weaker retention',
    (v) => {
      v[1].metadata.annotations['argocd.argoproj.io/sync-options'] = 'Prune=true';
    },
  ],
  [
    'injected namespace finalizer',
    (v) => {
      v[1].spec = { finalizers: [] };
    },
  ],
  [
    'broader storage',
    (v) => {
      v[4].spec.hard['requests.storage'] = '40Gi';
    },
  ],
  [
    'insufficient runtime quota',
    (v) => {
      v[3].spec.hard['limits.memory'] = '64Mi';
    },
  ],
  [
    'unbounded jobs',
    (v) => {
      delete v[5].spec.hard['count/jobs.batch'];
    },
  ],
  [
    'missing resource',
    (v) => {
      v.pop();
    },
  ],
  [
    'duplicate pair',
    (v) => {
      v[2] = structuredClone(v[0]);
    },
  ],
  [
    'extra credentials',
    (v) => {
      v.push({ apiVersion: 'v1', kind: 'Secret', metadata: { name: 'injected' } });
    },
  ],
])
  test(`bootstrap policy rejects ${name}`, () => {
    const resources = inputs();
    mutate(resources);
    assert.throws(() => bootstrapPolicy(resources));
  });

test('bootstrap rejection diagnostics do not echo injected resource values', () => {
  const resources = inputs();
  resources[0].metadata.labels.private = 'DO-NOT-ECHO';
  assert.throws(
    () => bootstrapPolicy(resources),
    (error) => !error.message.includes('DO-NOT-ECHO'),
  );
});

test('bootstrap composition rejects remote resources, extra files and transforms', () => {
  const composition = [
    {
      apiVersion: 'kustomize.config.k8s.io/v1beta1',
      kind: 'Kustomization',
      resources: ['namespaces.yaml', 'quotas.yaml'],
    },
  ];
  for (const mutate of [
    (v) => {
      v[0].resources[0] = 'https://example.invalid/remote';
    },
    (v) => {
      v[0].resources.push('../foreign.yaml');
    },
    (v) => {
      v[0].transformers = ['plugin.yaml'];
    },
    (v) => {
      v[0].patches = [{ path: 'override.yaml' }];
    },
  ]) {
    const value = structuredClone(composition);
    mutate(value);
    assert.throws(() => bootstrapComposition(value));
  }
});
