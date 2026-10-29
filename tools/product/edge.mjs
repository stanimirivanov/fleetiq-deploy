/** Build the upstream UI runtime; the legacy diagnostic edge is not product evidence. */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { lock } from '../policy.mjs';
import { run } from '../process.mjs';
import { reviewedSource } from '../sources.mjs';

/** Preserve upstream routing/CSP/proxy policy; replace only transport and map root. */
export function productEdgeTemplate(template) {
  let result = template.replaceAll('\r\n', '\n');
  for (const [anchor, replacement] of [
    [
      'listen 8080 default_server;',
      `listen 8443 ssl default_server;
    ssl_certificate /run/tls/tls.crt;
    ssl_certificate_key /run/tls/tls.key;
    ssl_protocols TLSv1.2 TLSv1.3;`,
    ],
    ['location /maps/ {', 'location /maps/ {\n      root /fixture;'],
  ]) {
    assert.equal(
      result.split(anchor).length,
      2,
      'Reviewed UI template changed; review the TLS adapter',
    );
    result = result.replace(anchor, replacement);
  }
  return result;
}

/** Prove the built ID is the selected upstream NGINX runtime, not the legacy adapter. */
export function productEdgeIdentity(image, id, revision, fingerprint) {
  assert.match(id, /^sha256:[a-f0-9]{64}$/u);
  assert.equal(image.Id, id);
  assert.equal(image.Config.Labels['org.opencontainers.image.revision'], revision);
  assert.equal(
    image.Config.Labels['org.opencontainers.image.source'],
    lock.sources.ux.repository.replace(/\.git$/u, ''),
  );
  assert.equal(image.Config.Labels['com.fleetiq.deploy.product-source'], fingerprint);
  assert.equal(image.Config.User, '10001:10001');
  assert.equal(image.Config.StopSignal, 'SIGQUIT');
  assert.deepEqual(image.Config.Entrypoint, ['/usr/local/bin/fleetiq-edge']);
}

export function buildProductEdge(docker, directory, fingerprint) {
  const source = reviewedSource('ux');
  const template = readFileSync(
    resolve(source, 'packaging/nginx/nginx.conf.template'),
    'utf8',
  );
  writeFileSync(
    resolve(directory, 'edge.conf.template'),
    productEdgeTemplate(template),
    { flag: 'wx', mode: 0o644 },
  );
  const iid = resolve(directory, 'edge.iid');
  run(
    'docker',
    [
      '--context',
      docker,
      'buildx',
      'build',
      '--load',
      '--file',
      resolve(source, 'Dockerfile'),
      '--build-arg',
      `SOURCE_REVISION=${lock.sources.ux.commit}`,
      '--label',
      `com.fleetiq.deploy.product-source=${fingerprint}`,
      '--iidfile',
      iid,
      '--tag',
      `fleetiq-product-edge:${lock.sources.ux.commit.slice(0, 12)}-${fingerprint.slice(0, 12)}`,
      source,
    ],
    { timeout: 900000, stdio: 'inherit' },
  );
  const id = readFileSync(iid, 'utf8').trim();
  const [image] = JSON.parse(
    run('docker', ['--context', docker, 'image', 'inspect', id]),
  );
  productEdgeIdentity(image, id, lock.sources.ux.commit, fingerprint);
  return id;
}
