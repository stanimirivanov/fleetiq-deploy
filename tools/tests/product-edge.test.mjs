import assert from 'node:assert/strict';
import test from 'node:test';
import { lock } from '../policy.mjs';
import { productEdgeIdentity, productEdgeTemplate } from '../product/edge.mjs';

// Independent miniature upstream input: adapter changes transport/map root only.
const upstream = `server {
  listen 8080 default_server;
  include /usr/share/fleetiq/csp.conf;
  location /maps/ { try_files $uri =404; }
  location / { try_files $uri /index.html; }
}`;
test('TLS adapter preserves upstream routing/CSP and LF/CRLF semantics', () => {
  const adapted = productEdgeTemplate(upstream);
  assert.equal(productEdgeTemplate(upstream.replaceAll('\n', '\r\n')), adapted);
  assert(adapted.includes('listen 8443 ssl default_server;'));
  assert(adapted.includes('ssl_certificate_key /run/tls/tls.key;'));
  assert(adapted.includes('ssl_protocols TLSv1.2 TLSv1.3;'));
  assert(adapted.includes('root /fixture;'));
  for (const policy of [
    'include /usr/share/fleetiq/csp.conf;',
    'try_files $uri =404;',
    'try_files $uri /index.html;',
  ])
    assert(adapted.includes(policy));
  for (const anchor of ['listen 8080 default_server;', 'location /maps/ {']) {
    assert.throws(() => productEdgeTemplate(upstream.replace(anchor, '')));
    assert.throws(() => productEdgeTemplate(upstream + anchor));
  }
});
test('native product identity rejects legacy Caddy, stale source, substituted bytes and weaker process config', () => {
  const id = `sha256:${'a'.repeat(64)}`,
    revision = lock.sources.ux.commit,
    fingerprint = 'fixture';
  const image = {
    Id: id,
    Config: {
      User: '10001:10001',
      StopSignal: 'SIGQUIT',
      Entrypoint: ['/usr/local/bin/fleetiq-edge'],
      Labels: {
        'org.opencontainers.image.revision': revision,
        'org.opencontainers.image.source': lock.sources.ux.repository.replace(
          /\.git$/u,
          '',
        ),
        'com.fleetiq.deploy.product-source': fingerprint,
      },
    },
  };
  productEdgeIdentity(image, id, revision, fingerprint);
  for (const mutate of [
    (v) => {
      v.Id = `sha256:${'b'.repeat(64)}`;
    },
    (v) => {
      v.Config.User = '0:0';
    },
    (v) => {
      v.Config.StopSignal = 'SIGTERM';
    },
    (v) => {
      v.Config.Entrypoint = ['caddy'];
    },
    (v) => {
      v.Config.Labels['org.opencontainers.image.revision'] = '0'.repeat(40);
    },
    (v) => {
      v.Config.Labels['org.opencontainers.image.source'] = 'https://foreign.test';
    },
    (v) => {
      v.Config.Labels['com.fleetiq.deploy.product-source'] = 'stale';
    },
  ]) {
    const altered = structuredClone(image);
    mutate(altered);
    assert.throws(() => productEdgeIdentity(altered, id, revision, fingerprint));
  }
});
