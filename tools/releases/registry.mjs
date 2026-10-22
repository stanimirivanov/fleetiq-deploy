import assert from 'node:assert/strict';
import { digest } from './contracts.mjs';

export function blobLocation(location) {
  const url = new URL(location);
  assert(
    url.protocol === 'https:' &&
      url.hostname === 'pkg-containers.githubusercontent.com' &&
      !url.username &&
      !url.password &&
      !url.port,
    'Untrusted registry blob redirect',
  );
  return url;
}

export async function boundedBytes(response, limit = 8 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    assert(size <= limit, 'Registry/evidence response exceeds bound');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/** Production is GHCR only. HTTP is permitted solely for an explicitly owned loopback fixture. */
export function registryClient(repository, { loopback = false, credential } = {}) {
  const local = /^127\.0\.0\.1:[1-9][0-9]{0,4}\/[a-z0-9/-]+$/u.test(repository);
  assert(
    local ? loopback : /^ghcr\.io\/stanimirivanov\/[a-z0-9/-]+$/u.test(repository),
    'Unreviewed OCI registry',
  );
  const [host, ...parts] = repository.split('/');
  const name = parts.join('/');
  const base = `${local ? 'http' : 'https'}://${host}/v2/${name}`;
  let bearer;
  async function request(path, method = 'GET') {
    assert(
      /^\/(?:manifests|blobs)\/(?:sha256:[a-f0-9]{64}|[a-zA-Z0-9][a-zA-Z0-9._-]{0,200})$/u.test(
        path,
      ),
      'Unsafe registry object',
    );
    if (!local && !bearer) {
      const response = await fetch(
        `https://ghcr.io/token?service=ghcr.io&scope=repository:${name}:pull`,
        {
          headers: credential
            ? {
                Authorization: `Basic ${Buffer.from(`${credential.actor}:${credential.token}`).toString('base64')}`,
              }
            : {},
          redirect: 'error',
          signal: AbortSignal.timeout(30_000),
        },
      );
      assert(response.ok, `OCI authorization unavailable (HTTP ${response.status})`);
      bearer = JSON.parse(await boundedBytes(response, 64 * 1024)).token;
      assert(
        typeof bearer === 'string' && bearer.length < 16384,
        'Invalid registry grant',
      );
    }
    return await fetch(`${base}${path}`, {
      method,
      headers: {
        Accept:
          'application/vnd.oci.image.manifest.v1+json, application/vnd.oci.image.index.v1+json, application/vnd.docker.distribution.manifest.v2+json',
        ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
      },
      // Inspect redirects here so only the blob callers below may follow the
      // approved storage host, without forwarding the registry credential.
      redirect: 'manual',
      signal: AbortSignal.timeout(30_000),
    });
  }
  return {
    async descriptor(descriptor) {
      assert(
        /^sha256:[a-f0-9]{64}$/u.test(descriptor?.digest) &&
          Number.isSafeInteger(descriptor.size) &&
          descriptor.size >= 0,
        'Invalid OCI blob descriptor',
      );
      let response = await request(`/blobs/${descriptor.digest}`, 'HEAD');
      if (!local && [302, 307].includes(response.status))
        response = await fetch(blobLocation(response.headers.get('location')), {
          method: 'HEAD',
          redirect: 'error',
          signal: AbortSignal.timeout(30_000),
        });
      assert(response.ok, 'Referenced OCI blob is unavailable');
      assert.equal(
        response.headers.get('content-length'),
        String(descriptor.size),
        'OCI blob size differs from descriptor',
      );
      const header = response.headers.get('docker-content-digest');
      if (header) assert.equal(header, descriptor.digest, 'OCI blob identity differs');
    },
    async absent(tag) {
      const response = await request(`/manifests/${tag}`, 'HEAD');
      assert.equal(
        response.status,
        404,
        'OCI discovery tag exists or absence is unproven',
      );
    },
    async object(reference, kind = 'manifests') {
      let response = await request(`/${kind}/${reference}`);
      if (!local && kind === 'blobs' && [302, 307].includes(response.status)) {
        response = await fetch(blobLocation(response.headers.get('location')), {
          redirect: 'error',
          signal: AbortSignal.timeout(30_000),
        });
      }
      assert(response.ok, `OCI object unavailable (HTTP ${response.status})`);
      const bytes = await boundedBytes(response);
      const actual = digest(bytes);
      if (reference.startsWith('sha256:'))
        assert.equal(actual, reference, 'OCI content digest mismatch');
      if (kind === 'manifests')
        assert.equal(
          response.headers.get('docker-content-digest'),
          actual,
          'OCI registry descriptor mismatch',
        );
      return { bytes, digest: actual, value: JSON.parse(bytes) };
    },
  };
}

/** Fail before deployment if any image/package config or layer was removed. */
export async function verifyBlobs(registry, manifest) {
  assert(
    manifest.config && Array.isArray(manifest.layers) && manifest.layers.length <= 256,
    'Unsupported OCI manifest shape',
  );
  const descriptors = [manifest.config, ...manifest.layers];
  for (let index = 0; index < descriptors.length; index += 4)
    await Promise.all(
      descriptors
        .slice(index, index + 4)
        .map((descriptor) => registry.descriptor(descriptor)),
    );
}
