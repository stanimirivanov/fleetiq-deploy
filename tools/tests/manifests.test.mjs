import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { manifestPolicy } from '../manifests/policy.mjs';
import { documents, renderFixture, validateSchemas } from '../manifests/render.mjs';
import {
  assertLocalReferences,
  manifestTools,
  plainDirectory,
  sha256,
  toolsLock,
  verifiedBytes,
} from '../manifests/toolchain.mjs';
import { root } from '../process.mjs';

// Real prerequisites are mandatory. No mock executable or missing-tool skip.
const tools = manifestTools();
const active = renderFixture(tools, { lint: true });
const resource = (resources, kind, name) =>
  resources.find(
    (item) => item.kind === kind && (!name || item.metadata.name === name),
  );
const backend = (resources) =>
  resource(resources, 'Deployment', 'fleetiq-backend').spec.template.spec;

test('real Helm, Kustomize and pinned schemas qualify the complete active, maintenance and nonlocal compositions', () => {
  for (const state of [
    { maintenance: false, nonlocal: false },
    { maintenance: true, nonlocal: false },
    { maintenance: false, nonlocal: true },
    { maintenance: true, nonlocal: true },
  ]) {
    const rendered =
      state.maintenance || state.nonlocal
        ? renderFixture(tools, { ...state, lint: true })
        : active;
    assert.equal(validateSchemas(tools, rendered), 18);
    assert.equal(manifestPolicy(rendered, state), 18);
  }
});

test('public OIDC roots are optional; explicit additional trust stays mounted and scoped', () => {
  const rendered = renderFixture(tools, {
    runtime: { backend: { oidc: { additionalTrust: { name: '' } } } },
  });
  assert.equal(validateSchemas(tools, rendered), 18);
  manifestPolicy(rendered);
  assert(!backend(rendered).volumes.some((volume) => volume.name === 'oidc-trust'));
});

for (const [label, change] of [
  [
    'floating backend image',
    {
      runtime: { backend: { image: 'ghcr.io/stanimirivanov/fleetiq-platform:latest' } },
    },
  ],
  ['floating database image', { data: { image: 'postgres:18' } }],
  [
    'versionless database digest',
    { data: { image: `ghcr.io/cloudnative-pg/postgresql@sha256:${'c'.repeat(64)}` } },
  ],
  ['shared database roles', { data: { runtime: { role: 'fleetiq_migrator' } } }],
  [
    'shared database password secret',
    { data: { runtime: { passwordSecret: 'fleet-migration-owner' } } },
  ],
  ['missing gateway certificate', { runtime: { gateway: { certificateSecret: '' } } }],
  [
    'missing OIDC client secret reference',
    { runtime: { backend: { oidc: { clientSecret: { name: '' } } } } },
  ],
  [
    'plaintext OIDC',
    { runtime: { backend: { oidc: { issuer: 'http://identity.local.test' } } } },
  ],
  ['missing database trust', { runtime: { backend: { databaseTrust: { name: '' } } } }],
  [
    'zero backend resource request',
    { runtime: { backend: { resources: { requests: { cpu: '0' } } } } },
  ],
  [
    'empty peer selector',
    { runtime: { network: { gatewayPodLabels: { 'app.kubernetes.io/name': null } } } },
  ],
  ['unknown settings', { runtime: { allowInsecure: true } }],
  [
    'unknown identity settings',
    { runtime: { backend: { oidc: { skipTlsVerification: true } } } },
  ],
  ['nonlocal single backend', { runtime: { profile: 'nonlocal' } }],
  ['nonlocal single database', { data: { profile: 'nonlocal' } }],
]) {
  test(`real Helm values validation rejects ${label}`, () => {
    assert.throws(() => renderFixture(tools, change));
  });
}

test('chart defaults alone refuse to render; no identity-disabled or image fallback', () => {
  for (const chart of ['runtime', 'data'])
    assert.throws(() =>
      tools.helm([
        'template',
        'fleetiq',
        resolve(root, `charts/fleetiq-${chart}`),
        '--kube-version',
        toolsLock.kubernetes,
      ]),
    );
});

for (const [label, mutate] of [
  [
    'unrestricted runtime',
    (items) => {
      backend(items).containers[0].securityContext.allowPrivilegeEscalation = true;
    },
  ],
  [
    'writable root',
    (items) => {
      backend(items).containers[0].securityContext.readOnlyRootFilesystem = false;
    },
  ],
  [
    'host networking',
    (items) => {
      backend(items).hostNetwork = true;
    },
  ],
  [
    'service account token',
    (items) => {
      backend(items).automountServiceAccountToken = true;
    },
  ],
  [
    'hidden migration init container',
    (items) => {
      backend(items).initContainers = [
        {
          name: 'migrate',
          image: backend(items).containers[0].image,
          args: ['migrate'],
        },
      ];
    },
  ],
  [
    'implicit startup migrations',
    (items) => {
      backend(items).containers[0].args = ['serve'];
    },
  ],
  [
    'mounted host filesystem',
    (items) => {
      backend(items).volumes.push({ name: 'host', hostPath: { path: '/' } });
    },
  ],
  [
    'literal credentials',
    (items) => {
      const entry = backend(items).containers[0].env.find(
        (env) => env.name === 'DATABASE_URL',
      );
      delete entry.valueFrom;
      entry.value = 'synthetic-not-a-credential';
    },
  ],
  [
    'optional database credentials',
    (items) => {
      backend(items).containers[0].env.find(
        (env) => env.name === 'DATABASE_URL',
      ).valueFrom.secretKeyRef.optional = true;
    },
  ],
  [
    'missing readiness',
    (items) => {
      delete backend(items).containers[0].readinessProbe;
    },
  ],
  [
    'public backend Service',
    (items) => {
      resource(items, 'Service', 'fleetiq-backend').spec.type = 'LoadBalancer';
    },
  ],
  [
    'external database bypass',
    (items) => {
      resource(items, 'Service', 'fleetiq-backend').spec.externalIPs = ['192.0.2.10'];
    },
  ],
  [
    'plaintext gateway listener',
    (items) => {
      resource(items, 'Gateway').spec.listeners[0].protocol = 'HTTP';
    },
  ],
  [
    'cross-namespace certificate',
    (items) => {
      resource(items, 'Gateway').spec.listeners[0].tls.certificateRefs[0].namespace =
        'foreign';
    },
  ],
  [
    'direct public API route',
    (items) => {
      resource(items, 'HTTPRoute').spec.rules[0].backendRefs[0].name =
        'fleetiq-backend';
    },
  ],
  [
    'unsafe database prune',
    (items) => {
      delete resource(items, 'Cluster').metadata.annotations[
        'argocd.argoproj.io/sync-options'
      ];
    },
  ],
  [
    'unsafe database deletion',
    (items) => {
      delete resource(items, 'Cluster').metadata.annotations['helm.sh/resource-policy'];
    },
  ],
  [
    'namespace deletion',
    (items) => {
      delete resource(items, 'Namespace').metadata.annotations;
    },
  ],
  [
    'superuser runtime role',
    (items) => {
      resource(items, 'Cluster').spec.managed.roles[0].superuser = true;
    },
  ],
  [
    'migration-owner membership',
    (items) => {
      resource(items, 'Cluster').spec.managed.roles[0].inRoles = ['fleetiq_migrator'];
    },
  ],
  [
    'shared owner/runtime secret',
    (items) => {
      const spec = resource(items, 'Cluster').spec;
      spec.managed.roles[0].passwordSecret.name = spec.bootstrap.initdb.secret.name;
    },
  ],
  [
    'bootstrap SQL shortcut',
    (items) => {
      resource(items, 'Cluster').spec.bootstrap.initdb.postInitSQL = ['SELECT 1'];
    },
  ],
  [
    'broad network peer',
    (items) => {
      resource(items, 'NetworkPolicy', 'fleetiq-backend').spec.egress[0].to = [{}];
    },
  ],
  [
    'unrestricted destination CIDR',
    (items) => {
      resource(
        items,
        'NetworkPolicy',
        'fleetiq-backend',
      ).spec.egress[2].to[0].ipBlock.cidr = '0.0.0.0/0';
    },
  ],
  [
    'invalid destination CIDR',
    (items) => {
      resource(
        items,
        'NetworkPolicy',
        'fleetiq-backend',
      ).spec.egress[2].to[0].ipBlock.cidr = '999.0.0.1/32';
    },
  ],
  [
    'all-port network allow',
    (items) => {
      resource(items, 'NetworkPolicy', 'fleetiq-edge').spec.ingress[0].ports = [];
    },
  ],
  [
    'edge access to data',
    (items) => {
      resource(items, 'NetworkPolicy', 'fleetiq-edge').spec.egress[0].ports[0].port =
        5432;
    },
  ],
  [
    'insufficient rollout quota',
    (items) => {
      resource(items, 'ResourceQuota', 'fleet-budget').spec.hard['limits.cpu'] = '1';
    },
  ],
  [
    'insufficient retained storage quota',
    (items) => {
      resource(items, 'ResourceQuota', 'fleet-data-budget').spec.hard[
        'requests.storage'
      ] = '1Gi';
    },
  ],
  [
    'weakened default deny',
    (items) => {
      resource(items, 'NetworkPolicy', 'fleetiq-default-deny').spec.egress = [{}];
    },
  ],
  [
    'unexpected privileged resource',
    (items) => {
      items.push({
        apiVersion: 'rbac.authorization.k8s.io/v1',
        kind: 'ClusterRoleBinding',
        metadata: { name: 'unreviewed' },
      });
    },
  ],
  [
    'migration hook',
    (items) => {
      resource(items, 'Deployment').metadata.annotations = {
        'helm.sh/hook': 'pre-install',
      };
    },
  ],
  [
    'duplicate resource',
    (items) => {
      items.push(structuredClone(items[0]));
    },
  ],
]) {
  test(`rendered manifest policy rejects ${label}`, () => {
    const mutated = structuredClone(active);
    mutate(mutated);
    assert.throws(() => manifestPolicy(mutated));
  });
}

test('maintenance cannot leave a packaged writer running or remove its retained data', () => {
  const rendered = renderFixture(tools, { maintenance: true });
  resource(rendered, 'Deployment', 'fleetiq-backend').spec.replicas = 1;
  assert.throws(() => manifestPolicy(rendered, { maintenance: true, nonlocal: false }));
});

test('real schema sensor rejects built-in typos, invalid custom fields and missing GVK schemas', () => {
  for (const mutate of [
    (items) => {
      backend(items).containers[0].unknownPrivilege = true;
    },
    (items) => {
      resource(items, 'Cluster').spec.instances = 'three';
    },
    (items) => {
      resource(items, 'Gateway').apiVersion = 'gateway.networking.k8s.io/v999';
    },
  ]) {
    const mutated = structuredClone(active);
    mutate(mutated);
    assert.throws(() => validateSchemas(tools, mutated));
  }
  assert.throws(() => documents('apiVersion: v1\nkind: Service\nkind: Pod\n'));
});

test('tool/schema bytes must exist, match their pin and remain a plain file', (context) => {
  const parent = realpathSync(tmpdir());
  const directory = mkdtempSync(join(parent, 'fleetiq-manifest-bytes-'));
  context.after(() => {
    assert.equal(dirname(realpathSync(directory)), parent);
    rmSync(directory, { recursive: true, force: true });
  });
  const file = join(directory, 'schema.json');
  writeFileSync(file, '{}');
  assert.equal(verifiedBytes(file, sha256(Buffer.from('{}'))).toString(), '{}');
  assert.throws(() => verifiedBytes(file, '0'.repeat(64)));
  assert.throws(() => verifiedBytes(join(directory, 'missing.json'), '0'.repeat(64)));
  // Directory junctions are supported without administrator privileges on Windows.
  const link = join(directory, 'linked');
  symlinkSync(directory, link, process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => verifiedBytes(link, sha256(Buffer.from('{}'))));
  assert.throws(() => plainDirectory(link));
  assert.throws(() =>
    assertLocalReferences({
      properties: { nested: { $ref: 'https://example.invalid/schema.json' } },
    }),
  );
  assert.doesNotThrow(() => assertLocalReferences({ $ref: '#/definitions/pod' }));
});
