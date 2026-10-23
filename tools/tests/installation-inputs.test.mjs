import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { win32 } from 'node:path';
import test from 'node:test';
import { sourceRegistration } from '../releases/source-graphs.mjs';

const read = (name) =>
  JSON.parse(
    readFileSync(
      new URL(`../../environments/local-installation/${name}.json`, import.meta.url),
      'utf8',
    ),
  );
const target = read('target');
const delegation = read('delegation');

test('persistent preparation matches registered Argo namespaces and exact manual source boundary', () => {
  const registered = sourceRegistration(target.environment);
  assert.equal(target.activationRef, registered.ref);
  assert.equal(target.namespaces.gitops, registered.namespace);
  assert.equal(target.namespaces.runtime, registered.destinations.runtime);
  assert.equal(target.namespaces.data, registered.destinations.data);
  assert.deepEqual(delegation.workloadNamespaces, [
    registered.destinations.runtime,
    registered.destinations.data,
  ]);
  assert.deepEqual(delegation.databaseNamespaces, [registered.destinations.data]);
  assert.equal(delegation.consumer, target.consumer);
  assert.deepEqual(delegation.approvedTemplates, ['fleetiq-release-v1']);
  assert.equal(target.workflowTemplate, null);
  assert.equal(target.execution, 'not-performed');
  assert.equal(target.authorization, 'pending');
});

test('persistent preparation binds isolated loopback target, budgets and explicit local data retention', () => {
  assert.equal(target.target.cluster, `${target.consumer}-local`);
  assert.equal(target.target.kubernetesContext, `kind-${target.target.cluster}`);
  assert.equal(target.target.dockerContext, 'desktop-linux');
  assert.equal(target.target.profile, 'isolated-network-local');
  assert.equal(win32.isAbsolute(target.target.stateRoot), true);
  assert.equal(win32.normalize(target.target.stateRoot), target.target.stateRoot);
  const segments = target.target.stateRoot
    .split(win32.sep)
    .map((part) => part.toLowerCase());
  assert(
    !segments.some((part) =>
      ['appdata', 'localcache', 'temp', 'node_modules', 'target', '.local'].includes(
        part,
      ),
    ),
  );
  assert.equal(
    target.target.stateRootSelection,
    'operator-confirmed-outside-redirected-AppData',
  );
  assert.equal(target.https.bindAddress, '127.0.0.1');
  assert.equal(target.https.hostPort, 18443);
  assert.equal(target.https.nodeListenerPort, 8443);
  assert.equal(target.https.hostname, 'fleet.local.test');
  assert.deepEqual(target.capacity.nodes, {
    'control-plane': { cpus: 2, memoryBytes: 4 * 1024 ** 3 },
    worker: { cpus: 2, memoryBytes: 4 * 1024 ** 3 },
  });
  assert.deepEqual(target.capacity.minimumEngine, {
    cpus: 4,
    memoryBytes: 12 * 1024 ** 3,
  });
  assert.equal(target.capacity.pidsPerNode, 2048);
  assert.equal(target.capacity.swap, false);
  assert.equal(target.capacity.bootstrap, 'temporarily-uncapped');
  assert.equal(target.database.instances, 1);
  assert.equal(target.database.storageClass, 'local-retained');
  assert.equal(target.database.storage, '2Gi');
  assert.match(
    target.database.image,
    /^ghcr\.io\/cloudnative-pg\/postgresql:18\.4-system-trixie@sha256:[a-f0-9]{64}$/u,
  );
  assert.match(target.releaseBomDigest, /^sha256:[a-f0-9]{64}$/u);
  assert.match(target.provider.revision, /^[a-f0-9]{40}$/u);
  assert.match(target.provider.archiveSha256, /^[a-f0-9]{64}$/u);
  assert.match(target.disposal, /no automatic cluster removal/u);
});

test('identity preparation contains references only and uses the application namespace', () => {
  assert.equal(new URL(target.identity.issuer).protocol, 'https:');
  assert.equal(target.identity.authority, 'auth0-fleetiq-local');
  assert.deepEqual(target.identity.clientSecret, {
    namespace: target.namespaces.runtime,
    name: 'fleetiq-oidc',
    key: 'client-secret',
  });
  assert.deepEqual(Object.keys(target.identity).sort(), [
    'authority',
    'clientSecret',
    'issuer',
  ]);
});
