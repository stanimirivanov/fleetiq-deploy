import assert from 'node:assert/strict';
import { digestImage, resources } from './resource-policy.mjs';
import {
  bootstrap,
  databaseIdentities,
  databaseRole,
  runtimeCommands,
} from './workload-database.mjs';

function scopedRoles(initdb, selection) {
  const { workloads, migrationLogin, bootstrapLogin, retireLegacy } = selection;
  const role = (name, secret, login) => [
    name,
    login
      ? { login: true, passwordSecret: { name: secret } }
      : { login: false, disablePassword: true },
  ];
  const legacy = selection.legacy ?? {
    name: 'fleetiq_runtime',
    secret: 'fleet-database-runtime',
  };
  return Object.fromEntries([
    role(initdb.owner, initdb.secret.name, migrationLogin),
    role(legacy.name, legacy.secret, !retireLegacy),
    role(
      databaseRole(bootstrap),
      'fleetiq-db-bootstrap-platform-operator',
      bootstrapLogin,
    ),
    ...databaseIdentities(runtimeCommands).map(({ name, passwordSecret, command }) =>
      role(name, passwordSecret, workloads.includes(command)),
    ),
  ]);
}

/** Database ownership, authentication and resources remain separate from application Pods. */
export function dataPolicy(
  cluster,
  { nonlocal, providerLocal = false, workloadDatabase },
) {
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
  const roles = spec.managed.roles;
  for (const role of roles) {
    assert.notEqual(role.name, 'postgres');
    assert.equal(role.ensure, 'present');
    for (const privilege of [
      'superuser',
      'createdb',
      'createrole',
      'replication',
      'bypassrls',
      'inherit',
    ])
      assert.equal(role[privilege], false, `${role.name}: ${privilege}`);
    assert.deepEqual(role.inRoles, []);
  }
  let hba = ['hostssl all all all scram-sha-256'];
  if (workloadDatabase) {
    const expected = scopedRoles(initdb, workloadDatabase);
    assert.equal(roles.length, Object.keys(expected).length);
    const observed = roles.map(({ name, login, passwordSecret, disablePassword }) => [
      name,
      {
        login,
        ...(passwordSecret ? { passwordSecret } : {}),
        ...(disablePassword ? { disablePassword } : {}),
      },
    ]);
    assert.deepEqual(
      Object.fromEntries(observed),
      expected,
      'Scoped managed roles differ',
    );
    if (workloadDatabase.maintenance) {
      const temporaryRole = workloadDatabase.migrationLogin
        ? initdb.owner
        : workloadDatabase.bootstrapLogin
          ? databaseRole(bootstrap)
          : null;
      hba = [
        ...(temporaryRole
          ? [`hostssl fleetiq ${temporaryRole} all scram-sha-256`]
          : []),
        'host all all all reject',
      ];
    }
  } else {
    assert.equal(roles.length, 1);
    const role = roles[0];
    assert(role.name !== initdb.owner);
    assert(role.passwordSecret.name && role.passwordSecret.name !== initdb.secret.name);
    assert.equal(role.login, true);
  }
  assert.deepEqual(spec.postgresql, {
    parameters: { password_encryption: 'scram-sha-256' },
    pg_hba: hba,
  });
  assert(
    !spec.externalClusters && !spec.backup,
    'Recovery/backup acceptance belongs to D07',
  );
}
