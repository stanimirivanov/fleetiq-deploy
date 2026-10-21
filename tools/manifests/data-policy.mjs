import assert from 'node:assert/strict';
import { digestImage, resources } from './resource-policy.mjs';

/** Database ownership, authentication and resources remain separate from application Pods. */
export function dataPolicy(cluster, { nonlocal, providerLocal = false }) {
  const spec = cluster.spec;
  digestImage(spec.imageName);
  assert.match(
    spec.imageName,
    /:[1-9]\d*\.\d+(?:-[a-z0-9.-]+)?@sha256:/u,
    'CNPG requires a PostgreSQL version tag alongside the immutable digest',
  );
  assert.equal(spec.instances, nonlocal ? 3 : 1);
  assert.equal(spec.enableSuperuserAccess, false);
  assert.equal(spec.primaryUpdateStrategy, 'supervised');
  assert(spec.storage.storageClass && /^[1-9]\d*Gi$/u.test(spec.storage.size));
  if (providerLocal) {
    assert.equal(spec.storage.storageClass, 'local-retained');
    assert.match(
      spec.storage.size,
      /^[1-4]Gi$/u,
      'Local provider permits only whole 1-4Gi claims',
    );
  }
  resources(spec.resources);
  assert.deepEqual(Object.keys(spec.bootstrap), ['initdb']);
  const initdb = spec.bootstrap.initdb;
  assert.deepEqual(Object.keys(initdb).sort(), ['database', 'owner', 'secret']);
  assert(initdb.owner && initdb.owner !== 'postgres' && initdb.secret.name);
  assert.equal(spec.managed.roles.length, 1);
  const role = spec.managed.roles[0];
  assert(role.name !== initdb.owner && role.name !== 'postgres');
  assert(role.passwordSecret.name && role.passwordSecret.name !== initdb.secret.name);
  for (const privilege of [
    'superuser',
    'createdb',
    'createrole',
    'replication',
    'bypassrls',
    'inherit',
  ])
    assert.equal(role[privilege], false);
  assert.equal(role.login, true);
  assert.deepEqual(role.inRoles, []);
  assert.deepEqual(spec.postgresql, {
    parameters: { password_encryption: 'scram-sha-256' },
    pg_hba: ['hostssl all all all scram-sha-256'],
  });
  assert(
    !spec.externalClusters && !spec.backup,
    'Recovery/backup acceptance belongs to D07',
  );
}
