import assert from 'node:assert/strict';
import test from 'node:test';
import { manifestPolicy } from '../manifests/policy.mjs';
import { renderFixture, validateSchemas } from '../manifests/render.mjs';
import { manifestTools } from '../manifests/toolchain.mjs';

const tools = manifestTools();
const selection = {
  providerLocal: true,
  applicationNamespace: 'fleetiq-apps',
  oidcIssuer: 'https://login.example.test/',
};
const rendered = renderFixture(tools, {
  ...selection,
  runtime: {
    backend: {
      oidc: {
        issuer: selection.oidcIssuer,
        clientId: 'public-test-client',
        authority: 'external-oidc',
        additionalTrust: { name: '' },
      },
    },
  },
});
const item = (items, kind, name) =>
  items.find((r) => r.kind === kind && r.metadata.name === name);

test('selected public HTTPS issuer and application namespace pass real native schemas and complete policy', () => {
  assert.equal(validateSchemas(tools, rendered), 19);
  assert.equal(manifestPolicy(rendered, selection), 19);
  const backend = item(rendered, 'Deployment', 'fleetiq-backend');
  assert.equal(backend.metadata.namespace, 'fleetiq-apps');
  const pod = backend.spec.template.spec;
  assert(!pod.volumes.some((v) => v.name === 'oidc-trust'));
  const secret = pod.containers[0].env.find(
    (e) => e.name === 'FLEETIQ_OIDC_CLIENT_SECRET',
  );
  assert(secret.valueFrom.secretKeyRef.name);
  assert.equal(secret.value, undefined);
});

test('real external-issuer render rejects fixture port, wrong issuer, foreign namespaces and weaker isolation', () => {
  for (const change of [
    (items) => {
      item(items, 'NetworkPolicy', 'fleetiq-backend').spec.egress[2].ports[0].port =
        19443;
    },
    (items) => {
      item(
        items,
        'Deployment',
        'fleetiq-backend',
      ).spec.template.spec.containers[0].env.find(
        (e) => e.name === 'FLEETIQ_OIDC_ISSUER',
      ).value = 'https://different.example.test/';
    },
    (items) => {
      item(items, 'Deployment', 'fleetiq-backend').metadata.namespace = 'fleetiq-local';
    },
    (items) => {
      item(
        items,
        'NetworkPolicy',
        'fleetiq-db-instances',
      ).spec.ingress[0].from[0].namespaceSelector.matchLabels[
        'kubernetes.io/metadata.name'
      ] = 'fleetiq-local';
    },
    (items) => {
      item(
        items,
        'NetworkPolicy',
        'fleetiq-backend',
      ).spec.egress[2].to[0].ipBlock.cidr = '0.0.0.0/0';
    },
    (items) => {
      item(items, 'Service', 'fleetiq-backend').spec.type = 'LoadBalancer';
    },
    (items) => {
      item(items, 'Gateway', 'fleetiq').spec.listeners[0].port = 443;
    },
    (items) => {
      item(items, 'ResourceQuota', 'fleet-budget').spec.hard['limits.cpu'] = '1';
    },
  ]) {
    const altered = structuredClone(rendered);
    change(altered);
    assert.throws(() => manifestPolicy(altered, selection));
  }
  assert.throws(() => manifestPolicy(rendered, { providerLocal: true }));
  assert.throws(() =>
    manifestPolicy(rendered, {
      ...selection,
      oidcIssuer: 'https://another.example.test/',
    }),
  );
});

test('trusted selection inputs reject plaintext, embedded credentials, invalid ports and unregistered namespaces', () => {
  for (const oidcIssuer of [
    'http://login.example.test/',
    'https://user:password@login.example.test/',
    'https://login.example.test:0/',
    'https://login.example.test/?query=1',
    'https://login.example.test/?',
    'https://login.example.test/#',
    'https://login.example.test/#fragment',
  ])
    assert.throws(() => manifestPolicy(rendered, { ...selection, oidcIssuer }));
  for (const applicationNamespace of [
    'kube-system',
    'default',
    'fleetiq-data',
    'foreign-apps',
  ])
    assert.throws(() =>
      manifestPolicy(rendered, { ...selection, applicationNamespace }),
    );
});
