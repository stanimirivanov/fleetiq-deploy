import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  databaseConnectionSettings,
  selectedMinimalDemoBackend,
} from './minimal-demo-data.mjs';

export const databaseName = 'fleetiq';
export const migrator = 'fleetiq_migrator';
export const bootstrap = 'bootstrap-platform-operator --check-schema';
export const runtimeCommands = [
  'serve --check-schema',
  'ingest-tcp',
  'replay-worker',
  'semantic-worker',
  'project-current',
  'analytics-worker',
  'notification-worker',
  'archive-worker',
];

export const roleName = (command) =>
  command === 'migrate'
    ? migrator
    : `fleetiq_${command.split(' ')[0].replaceAll('-', '_')}`;
export const secretName = (command) =>
  `fleetiq-db-${roleName(command).slice('fleetiq_'.length).replaceAll('_', '-')}`;

export function managedRoles(phase) {
  assert(
    ['installation', 'bootstrap', 'runtime'].includes(phase),
    'Select a database phase',
  );
  return [...runtimeCommands, bootstrap, 'migrate'].map((command) => {
    const login =
      command === 'migrate'
        ? phase === 'installation'
        : command === bootstrap
          ? phase === 'bootstrap'
          : phase === 'runtime';
    return {
      name: roleName(command),
      ensure: 'present',
      login,
      superuser: false,
      createdb: false,
      createrole: false,
      replication: false,
      bypassrls: false,
      inherit: false,
      inRoles: [],
      connectionLimit: -1,
      ...(login
        ? { passwordSecret: { name: secretName(command) } }
        : { disablePassword: true }),
    };
  });
}

export const sha256 = (bytes) =>
  `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const identifier = '[a-z_][a-z_0-9]*';
const relation = `${identifier}\\.${identifier}`;
const identifierPattern = new RegExp(`^${identifier}$`, 'u');
const relationPattern = new RegExp(`^${relation}$`, 'u');
const routinePattern = new RegExp(`^${relation}\\((?:[a-z]+(?:,[a-z]+)*)?\\)$`, 'u');
const sha384 = /^[a-f0-9]{96}$/u;

export function loadGrantInputs(contractBytes, inventoryBytes) {
  const selection = selectedMinimalDemoBackend();
  assert.equal(
    sha256(contractBytes),
    selection.grantContract.digest,
    'Grant contract digest differs',
  );
  assert.equal(
    sha256(inventoryBytes),
    selection.migrationInventory.digest,
    'Migration inventory digest differs',
  );
  const contract = JSON.parse(contractBytes);
  const inventory = JSON.parse(inventoryBytes);
  assert.equal(contract.format, 'fleetiq-postgresql-runtime-grants.v1');
  assert.equal(contract.postgresMajor, 18);
  assert.deepEqual(contract.common, {
    database: ['CONNECT'],
    select: ['public._sqlx_migrations'],
  });
  assert.deepEqual(contract.migrationHead, selection.grantContract.migrationHead);
  assert.equal(inventory.format, 'fleetiq-migrations.v1');
  assert.equal(inventory.checksum_algorithm, 'sha384');
  assert.equal(inventory.migrations.length, selection.migrationInventory.count);
  let previous = 0n;
  for (const { version, checksum } of inventory.migrations) {
    assert.match(version, /^[1-9][0-9]*$/u);
    const number = BigInt(version);
    assert(
      number > previous && number <= 9223372036854775807n,
      'Migration inventory versions differ',
    );
    previous = number;
    assert.match(checksum, sha384);
  }
  const head = inventory.migrations.at(-1);
  assert.equal(head.version, String(contract.migrationHead.version));
  assert.equal(head.checksum, contract.migrationHead.sha384);
  assert.deepEqual(
    Object.keys(contract.commands).sort(),
    [...runtimeCommands, bootstrap].sort(),
  );
  return { contract, inventory, selection };
}

function names(items, pattern) {
  return items
    .map((item) => {
      assert.match(item, pattern);
      return item;
    })
    .join(', ');
}

export function ledgerCheck({ inventory }) {
  const expected = inventory.migrations
    .map(({ version, checksum }) => `(${version}, '${checksum}')`)
    .join(',');
  return `
DO $$ BEGIN
  IF current_database() <> '${databaseName}'
      OR current_setting('server_version_num')::integer / 10000 <> 18
      ${Object.entries(databaseConnectionSettings)
        .map(([name, value]) => `OR current_setting('${name}') <> '${value}'`)
        .join('\n      ')} THEN
    RAISE EXCEPTION 'Wrong FleetIQ database, version, or connection settings';
  END IF;
  IF (SELECT count(*) FROM public._sqlx_migrations) <> ${inventory.migrations.length}
      OR EXISTS (
        SELECT 1 FROM (VALUES ${expected}) e(version, checksum)
        LEFT JOIN public._sqlx_migrations a USING (version)
        WHERE a.success IS DISTINCT FROM true OR encode(a.checksum, 'hex') IS DISTINCT FROM e.checksum
      ) THEN
    RAISE EXCEPTION 'FleetIQ migration ledger differs';
  END IF;
END $$;`;
}

const productSchemas = 'analytics, history, identity, ingestion, metadata, projection';
const configure = `SET LOCAL statement_timeout = '8s'; SET LOCAL lock_timeout = '2s';
SET LOCAL search_path = pg_catalog, public;`;

function privileges(command, grants) {
  const role = roleName(command);
  const acl = [
    `GRANT CONNECT ON DATABASE ${databaseName} TO ${role};`,
    `GRANT USAGE ON SCHEMA ${names(grants.schemas, identifierPattern)} TO ${role};`,
    `GRANT SELECT ON TABLE public._sqlx_migrations TO ${role};`,
  ];
  for (const action of ['select', 'insert', 'update', 'delete']) {
    if (grants[action]?.length)
      acl.push(
        `GRANT ${action.toUpperCase()} ON TABLE ${names(grants[action], relationPattern)} TO ${role};`,
      );
  }
  for (const [table, columns] of Object.entries(grants.updateColumns ?? {}))
    acl.push(
      `GRANT UPDATE (${names(columns, identifierPattern)}) ON TABLE ${names([table], relationPattern)} TO ${role};`,
    );
  if (grants.execute?.length)
    acl.push(
      `GRANT EXECUTE ON FUNCTION ${names(grants.execute, routinePattern)} TO ${role};`,
    );
  return acl.join('\n');
}

function requireDatabaseIdentity({ databaseOid, startedMicros }) {
  assert.match(databaseOid, /^[1-9][0-9]{0,11}$/u);
  assert.match(startedMicros, /^[1-9][0-9]{0,19}$/u);
  return `
  IF (SELECT oid::text FROM pg_database WHERE datname = current_database()) IS DISTINCT FROM '${databaseOid}'
     OR (extract(epoch FROM pg_postmaster_start_time()) * 1000000)::bigint::text IS DISTINCT FROM '${startedMicros}'
     OR pg_is_in_recovery() THEN RAISE EXCEPTION 'Primary identity changed before database writes'; END IF;`;
}

export function grantSql(inputs, identity) {
  return `
BEGIN;
${configure}
${ledgerCheck(inputs)}
DO $$ BEGIN
${requireDatabaseIdentity(identity)}
  IF session_user <> '${migrator}' OR current_user <> session_user
      OR NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = current_database() AND datdba = session_user::regrole)
      OR EXISTS (SELECT 1 FROM pg_stat_activity WHERE datname = current_database() AND backend_type = 'client backend' AND pid <> pg_backend_pid()) THEN
    RAISE EXCEPTION 'Grant application requires the fenced migration owner';
  END IF;
END $$;
REVOKE CONNECT, TEMPORARY ON DATABASE ${databaseName} FROM PUBLIC;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA ${productSchemas} FROM PUBLIC;
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
${Object.entries(inputs.contract.commands)
  .map(([command, grants]) => privileges(command, grants))
  .join('\n')}
${verifyPrivileges(inputs)}
COMMIT;`;
}

function roleValues(commands) {
  return commands.map((command) => `'${roleName(command)}'`).join(', ');
}

function requireScopedRoles(commands) {
  const roles = roleValues(commands);
  return `
  IF EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname IN (${roles}) AND (rolsuper OR rolinherit OR rolcreaterole OR rolcreatedb OR rolreplication OR rolbypassrls)
  ) OR (SELECT count(*) FROM pg_roles WHERE rolname IN (${roles})) <> ${commands.length}
    OR EXISTS (
      SELECT 1 FROM pg_auth_members m JOIN pg_roles r ON r.oid IN (m.member, m.roleid)
      WHERE r.rolname IN (${roles})
    )
    OR EXISTS (
      SELECT 1 FROM pg_shdepend d JOIN pg_roles r ON r.oid = d.refobjid
      WHERE d.refclassid = 'pg_authid'::regclass AND d.deptype = 'o' AND r.rolname IN (${roles})
    )
  THEN RAISE EXCEPTION 'Scoped identities, memberships or ownership differ';
  END IF;`;
}

function expectedPrivileges(contract) {
  const values = [];
  for (const [command, grants] of Object.entries(contract.commands)) {
    const role = roleName(command);
    const add = (type, object, privilege) =>
      values.push(`('${role}', '${type}', '${object}', '${privilege}', false)`);
    add('database', databaseName, 'CONNECT');
    add('relation', 'public._sqlx_migrations', 'SELECT');
    for (const schema of grants.schemas) add('schema', schema, 'USAGE');
    for (const privilege of ['select', 'insert', 'update', 'delete'])
      for (const name of grants[privilege] ?? [])
        add('relation', name, privilege.toUpperCase());
    for (const [table, columns] of Object.entries(grants.updateColumns ?? {}))
      for (const column of columns) add('column', `${table}.${column}`, 'UPDATE');
    for (const routine of grants.execute ?? []) add('function', routine, 'EXECUTE');
  }
  values.push("('PUBLIC', 'schema', 'public', 'USAGE', false)");
  return values.join(',\n');
}

export function verifyPrivileges(inputs) {
  const roles = roleValues([...runtimeCommands, bootstrap]);
  const schemas =
    "'analytics', 'history', 'identity', 'ingestion', 'metadata', 'projection', 'public'";
  return `
DO $$ BEGIN
${requireScopedRoles([...runtimeCommands, bootstrap])}
  IF EXISTS (
    WITH acl(kind, object, grantee, privilege, grantable) AS (
      SELECT 'database', d.datname::text, x.grantee, x.privilege_type, x.is_grantable
        FROM pg_database d, LATERAL aclexplode(coalesce(d.datacl, acldefault('d', d.datdba))) x
       WHERE d.datname = current_database()
      UNION ALL
      SELECT 'schema', n.nspname, x.grantee, x.privilege_type, x.is_grantable
        FROM pg_namespace n, LATERAL aclexplode(coalesce(n.nspacl, acldefault('n', n.nspowner))) x
       WHERE n.nspname IN (${schemas})
      UNION ALL
      SELECT 'relation', n.nspname || '.' || c.relname, x.grantee, x.privilege_type, x.is_grantable
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace,
             LATERAL aclexplode(c.relacl) x WHERE n.nspname IN (${schemas})
      UNION ALL
      SELECT 'column', n.nspname || '.' || c.relname || '.' || a.attname, x.grantee, x.privilege_type, x.is_grantable
        FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace,
             LATERAL aclexplode(a.attacl) x WHERE n.nspname IN (${schemas})
      UNION ALL
      SELECT 'function', n.nspname || '.' || p.proname || '(' || replace(oidvectortypes(p.proargtypes), ', ', ',') || ')',
             x.grantee, x.privilege_type, x.is_grantable
        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace,
             LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) x
       WHERE n.nspname IN (${schemas})
    ), observed AS (
      SELECT coalesce(r.rolname::text, 'PUBLIC'), a.kind, a.object, a.privilege, a.grantable
        FROM acl a LEFT JOIN pg_roles r ON a.grantee = r.oid
       WHERE a.grantee = 0 OR r.rolname IN (${roles})
    ), expected AS (VALUES ${expectedPrivileges(inputs.contract)})
    (SELECT * FROM expected EXCEPT SELECT * FROM observed)
      UNION ALL
    (SELECT * FROM observed EXCEPT SELECT * FROM expected)
  ) THEN RAISE EXCEPTION 'FleetIQ object grants differ from the producer contract'; END IF;
END $$;`;
}

function deniedActions() {
  const operations = [
    'UPDATE public._sqlx_migrations SET success = false WHERE false',
    'CREATE TABLE public.fleetiq_grant_probe_unexpected (id integer)',
    'ALTER TABLE metadata.tenants ADD COLUMN fleetiq_grant_probe_unexpected integer',
    'CREATE ROLE fleetiq_grant_probe_unexpected',
    `SET LOCAL ROLE ${migrator}`,
  ];
  return operations
    .map(
      (sql) => `
  BEGIN EXECUTE '${sql}';
    RAISE EXCEPTION 'Unexpected access for scoped role';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;`,
    )
    .join('\n');
}

export function roleLoginSql(inputs, command) {
  assert([...runtimeCommands, bootstrap].includes(command));
  return `BEGIN;
${configure}
${ledgerCheck(inputs)}
DO $$ BEGIN
  IF session_user <> '${roleName(command)}' OR session_user <> current_user
      OR NOT EXISTS (SELECT 1 FROM pg_stat_ssl WHERE pid = pg_backend_pid() AND ssl) THEN
    RAISE EXCEPTION 'Expected a TLS connection authenticated as the exact role';
  END IF;
${deniedActions()}
END $$;
ROLLBACK;`;
}

export function roleFixtureSql(inputs, sourceFixture, retentionQueries, identity) {
  assert.equal(typeof sourceFixture, 'string');
  const fixture = sourceFixture.replace(/\bgrant_test_[a-z_]+\b/gu, (name) => {
    const command = Object.keys(inputs.contract.commands).find(
      (key) => roleName(key) === name.replace('grant_test_', 'fleetiq_'),
    );
    assert(command, 'Producer SQL fixture role differs');
    return roleName(command);
  });
  const [context, candidates] = retentionQueries;
  return `
BEGIN;
${configure}
${ledgerCheck(inputs)}
${verifyPrivileges(inputs)}
DO $$ BEGIN
${requireDatabaseIdentity(identity)}
  IF current_user <> 'postgres' OR session_user <> current_user
     OR EXISTS (SELECT 1 FROM identity.platform_bootstrap)
     OR EXISTS (SELECT 1 FROM pg_stat_activity WHERE datname = current_database() AND backend_type = 'client backend' AND pid <> pg_backend_pid()) THEN
    RAISE EXCEPTION 'Require a writer-fenced database before the initial operator bootstrap';
  END IF;
END $$;
${fixture}
SET LOCAL ROLE ${roleName('serve --check-schema')};
DO $$ DECLARE candidate jsonb; context jsonb;
BEGIN
  EXECUTE $grant_query$SELECT to_jsonb(result) FROM (${context}) result$grant_query$
    INTO STRICT context USING 'grant-contract';
  EXECUTE $grant_query$SELECT to_jsonb(result) FROM (${candidates}) result$grant_query$
    INTO STRICT candidate USING 'grant-contract';
  IF context->>'revision!' IS DISTINCT FROM '1' OR candidate->>'id!' IS NULL THEN
    RAISE EXCEPTION 'Restricted serving failed to collect retention preview';
  END IF;
END $$;
RESET ROLE;
ROLLBACK;`;
}

export function credentialStateSql(phase) {
  const roles = managedRoles(phase);
  const expected = roles.map(({ name, login }) => `('${name}', ${login})`).join(',');
  return `
DO $$ BEGIN
  IF current_user <> 'postgres' OR session_user <> current_user
      OR NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = current_database() AND datdba = '${migrator}'::regrole)
      OR EXISTS (
        SELECT 1 FROM (VALUES ${expected}) e(name, login)
          LEFT JOIN pg_authid r ON r.rolname = e.name
         WHERE r.rolcanlogin IS DISTINCT FROM e.login
            OR (r.rolpassword LIKE 'SCRAM-SHA-256$%') IS DISTINCT FROM CASE WHEN e.login THEN true ELSE null END
      ) OR EXISTS (
        SELECT 1 FROM pg_stat_activity a
          JOIN (VALUES ${expected}) e(name, login) ON e.name = a.usename
         WHERE NOT e.login
      )
  THEN RAISE EXCEPTION 'Credential attributes, ownership or withdrawal differ'; END IF;
END $$;`;
}
