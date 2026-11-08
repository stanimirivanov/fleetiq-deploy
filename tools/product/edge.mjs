/** Qualify the same immutable UI image admitted by the nonlocal chart. */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { lock } from '../policy.mjs';
import { root, run } from '../process.mjs';
import { qualifiedEdge } from '../qualified-edge.mjs';

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

/** Verify the platform and source recorded by the immutable publication. */
export function productEdgeIdentity(image) {
  assert(image.RepoDigests?.includes(qualifiedEdge.image));
  assert.equal(`${image.Os}/${image.Architecture}`, qualifiedEdge.platform);
  assert.equal(
    image.Config.Labels['org.opencontainers.image.revision'],
    qualifiedEdge.revision,
  );
  assert.equal(
    image.Config.Labels['org.opencontainers.image.source'],
    lock.sources.ux.repository.replace(/\.git$/u, ''),
  );
  assert.equal(image.Config.User, '10001:10001');
  assert.equal(image.Config.StopSignal, 'SIGQUIT');
  assert.deepEqual(image.Config.Entrypoint, ['/usr/local/bin/fleetiq-edge']);
}

export function prepareProductEdge(docker, directory) {
  const { image, platform } = qualifiedEdge;
  const command = (args, options) =>
    run('docker', ['--context', docker, ...args], options);
  command(['pull', '--platform', platform, image], {
    timeout: 300000,
    stdio: 'inherit',
  });
  const [metadata] = JSON.parse(command(['image', 'inspect', image]));
  productEdgeIdentity(metadata);
  const template = command([
    'run',
    '--rm',
    '--pull=never',
    '--platform',
    platform,
    '--network=none',
    '--read-only',
    '--cap-drop=ALL',
    '--security-opt=no-new-privileges',
    '--entrypoint',
    '/bin/cat',
    image,
    '/etc/fleetiq/nginx.conf.template',
  ]);
  writeFileSync(
    resolve(directory, 'edge.conf.template'),
    productEdgeTemplate(template),
    { flag: 'wx', mode: 0o644 },
  );
  return image;
}

/** Use the normal Caddy routing with the disposable OIDC hostname and CA. */
export function prepareNormalEdge(directory) {
  let config = readFileSync(resolve(root, 'local/Caddyfile'), 'utf8');
  for (const [original, replacement] of [
    ['https://localhost:8443 {', 'https://fleet.test:8443 {'],
    ['tls internal', 'tls /run/tls/tls.crt /run/tls/tls.key'],
  ]) {
    assert.equal(
      config.split(original).length,
      2,
      'Normal edge TLS adapter anchor changed',
    );
    config = config.replace(original, replacement);
  }
  writeFileSync(resolve(directory, 'normal-edge.Caddyfile'), config, {
    flag: 'wx',
    mode: 0o644,
  });
}
