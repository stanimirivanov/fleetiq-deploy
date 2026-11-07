import assert from 'node:assert/strict';
import { lstatSync } from 'node:fs';
import { resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { ownedPath } from './policy.mjs';
import { root } from './process.mjs';

export const archiveService = 'archive-worker';

function secretPath(path, name) {
  try {
    const candidate = resolve(path, name);
    const stat = lstatSync(candidate);
    if (
      stat.isFile() &&
      stat.nlink === 1 &&
      stat.size > 0 &&
      stat.size <= 4096 &&
      (stat.mode & 0o022) === 0
    )
      return ownedPath(path, candidate);
  } catch {
    // Suppress path and filesystem diagnostics from the private input boundary.
  }
  throw new Error('Expected a bounded private archive secret file');
}

export function archiveInputs(path, settings) {
  const directory = lstatSync(path);
  assert(
    directory.isDirectory() && (directory.mode & 0o077) === 0,
    'Archive inputs require a private instance directory',
  );
  const invalid = 'Invalid archive configuration';
  assert(
    settings &&
      Object.keys(settings).sort().join(',') === 'bucket,endpoint,region,tenantId',
    invalid,
  );
  const { endpoint, tenantId, bucket, region } = settings;
  assert(
    Object.values(settings).every((value) => typeof value === 'string'),
    invalid,
  );
  let url;
  try {
    url = new URL(endpoint);
  } catch {
    throw new Error(invalid);
  }
  assert(
    url.protocol === 'https:' &&
      url.hostname &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      url.pathname === '/' &&
      endpoint.length <= 2048 &&
      !/[?#\s\p{Cc}]/u.test(endpoint) &&
      /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/u.test(bucket) &&
      /^[a-zA-Z0-9-]{1,64}$/u.test(region) &&
      /^[a-zA-Z0-9._:-]{1,128}$/u.test(tenantId),
    invalid,
  );
  return {
    tenantId,
    endpoint,
    bucket,
    region,
    accessFile: secretPath(path, 'archive-access-key'),
    secretFile: secretPath(path, 'archive-secret-key'),
  };
}

export function archiveInstallation(site, settings) {
  const input = archiveInputs(site.path, settings);
  const storage = {
    FLEETIQ_ARCHIVE_ENDPOINT: input.endpoint,
    FLEETIQ_ARCHIVE_BUCKET: input.bucket,
    FLEETIQ_ARCHIVE_REGION: input.region,
  };
  const compose = (args, options = {}) =>
    site.compose(['--file', resolve(root, 'local/archive/compose.yaml'), ...args], {
      ...options,
      env: {
        ...options.env,
        ...storage,
        FLEETIQ_ARCHIVE_TENANT_ID: input.tenantId,
        FLEETIQ_ARCHIVE_ACCESS_KEY_FILE: input.accessFile,
        FLEETIQ_ARCHIVE_SECRET_KEY_FILE: input.secretFile,
      },
    });
  const model = JSON.parse(compose(['config', '--format', 'json']));
  archiveComposePolicy(model, site.model, storage, input);
  return { ...site, compose, model };
}

function archiveComposePolicy(model, base, storage, input) {
  const same = (actual, expected) =>
    assert(
      isDeepStrictEqual(actual, expected),
      'Archive Compose model violates its reviewed boundary',
    );
  same(model.name, base.name);
  same(model.configs, base.configs);
  const { [archiveService]: worker, backend, ...otherServices } = model.services;
  const { backend: original, ...otherOriginal } = base.services;
  same(otherServices, otherOriginal);
  const storageSecrets = ['archive_access_key', 'archive_secret_key'].map((source) => ({
    source,
    target: `/run/secrets/${source}`,
  }));
  same(backend, {
    ...original,
    environment: { ...original.environment, ...storage },
    secrets: [...original.secrets, ...storageSecrets],
  });
  same(model.volumes, base.volumes);
  const { 'archive-egress': egress, ...otherNetworks } = model.networks;
  same(otherNetworks, base.networks);
  same(egress, {
    name: `${model.name}_archive-egress`,
    ipam: {},
    labels: original.labels,
  });
  same(model.secrets, {
    ...base.secrets,
    archive_access_key: {
      name: `${model.name}_archive_access_key`,
      file: input.accessFile,
    },
    archive_secret_key: {
      name: `${model.name}_archive_secret_key`,
      file: input.secretFile,
    },
  });
  same(worker, {
    image: original.image,
    pull_policy: 'never',
    user: original.user,
    entrypoint: ['/bin/bash', '/opt/fleetiq/backend-entrypoint.sh'],
    command: [archiveService],
    labels: original.labels,
    init: true,
    read_only: true,
    cap_drop: ['ALL'],
    security_opt: ['no-new-privileges:true'],
    restart: 'unless-stopped',
    stop_grace_period: '30s',
    tmpfs: original.tmpfs,
    environment: { ...storage, FLEETIQ_ARCHIVE_TENANT_ID: input.tenantId },
    secrets: [
      original.secrets.find(({ source }) => source === 'database_password'),
      ...storageSecrets,
    ],
    volumes: original.volumes.filter(
      (volume) => volume.target === '/opt/fleetiq/backend-entrypoint.sh',
    ),
    mem_limit: '268435456',
    pids_limit: 128,
    depends_on: { backend: { condition: 'service_healthy', required: true } },
    networks: { database: null, 'archive-egress': null },
  });
}
