import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  bootstrap,
  commands,
  contractDigest,
  databaseIdentities,
  databaseRole,
  runtimeCommands,
} from './workload-database.mjs';

const databaseName = 'fleetiq';
const exporter = 'cnpg_metrics_exporter';
const inventory = readFileSync(
  new URL('../../contracts/postgresql/migrations.v1.json', import.meta.url),
);
assert.equal(
  contractDigest,
  'd84aac89be4cc42f185c441355cfb3a504dc77e6eeb43086751161b4e3b21821',
);
assert.equal(
  createHash('sha256').update(inventory).digest('hex'),
  '67772e214e26fdc892b65b1636acd721d14ca1291bb49f1c209c9ffba8f64927',
);
const { migrations } = JSON.parse(inventory);

const identifier = '[a-z_][a-z_0-9]*';
const relation = `${identifier}\\.${identifier}`;
const identifierPattern = new RegExp(`^${identifier}$`, 'u');
const relationPattern = new RegExp(`^${relation}$`, 'u');
const routinePattern = new RegExp(`^${relation}\\((?:[a-z]+(?:,[a-z]+)*)?\\)$`, 'u');

function names(items, pattern) {
  return items
    .map((item) => {
      assert.match(item, pattern);
      return item;
    })
    .join(', ');
}

export function ledgerCheck({ prefix = false } = {}) {
  const expected = migrations
    .map(({ version, checksum }) => `(${version}, '${checksum}')`)
    .join(',');
  return `
DO $$ BEGIN
  IF current_database() <> '${databaseName}'
      OR current_setting('server_version_num')::integer / 10000 <> 18
      OR pg_is_in_recovery() THEN
    RAISE EXCEPTION 'Expected the PostgreSQL 18 FleetIQ primary';
  END IF;
  IF to_regclass('public._sqlx_migrations') IS NULL THEN
    ${prefix ? 'RETURN;' : "RAISE EXCEPTION 'FleetIQ migration ledger missing';"}
  END IF;
  IF EXISTS (
    SELECT 1 FROM public._sqlx_migrations a
    LEFT JOIN (VALUES ${expected}) e(version, checksum) USING (version)
    WHERE a.success IS DISTINCT FROM true OR encode(a.checksum, 'hex') IS DISTINCT FROM e.checksum
  ) OR EXISTS (
    SELECT 1 FROM (VALUES ${expected}) e(version, checksum)
    WHERE ${prefix ? 'e.version <= (SELECT max(version) FROM public._sqlx_migrations) AND' : ''}
          NOT EXISTS (SELECT FROM public._sqlx_migrations a WHERE a.version = e.version)
  ) THEN
    RAISE EXCEPTION 'FleetIQ migration ledger differs';
  END IF;
END $$;`;
}

const productSchemas = 'analytics, history, identity, ingestion, metadata, projection';
const configure = `SET LOCAL statement_timeout = '8s'; SET LOCAL lock_timeout = '2s';
SET LOCAL search_path = pg_catalog, public;`;

function privileges(command, grants) {
  const role = databaseRole(command);
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

function ownerAndDrain(owner) {
  return `
SELECT pg_stat_clear_snapshot();
DO $$ BEGIN
  IF current_database() <> '${databaseName}' OR pg_is_in_recovery()
      OR session_user <> '${owner}' OR current_user <> session_user
      OR NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = current_database() AND datdba = session_user::regrole)
      OR EXISTS (
        SELECT FROM pg_stat_activity
        WHERE datid = (SELECT oid FROM pg_database WHERE datname = current_database())
          AND pid <> pg_backend_pid()
          AND usesysid IS DISTINCT FROM to_regrole('${exporter}')::oid
      ) OR EXISTS (SELECT FROM pg_prepared_xacts WHERE database = current_database())
  THEN RAISE EXCEPTION 'Grant application requires the primary migration owner and a drained database'; END IF;
END $$;`;
}

function fenceCheck(owner) {
  return `
DO $$ BEGIN
  IF NOT has_database_privilege('${exporter}', current_database(), 'CONNECT') OR EXISTS (
    SELECT FROM pg_database d, LATERAL aclexplode(coalesce(d.datacl, acldefault('d', d.datdba))) acl
    WHERE d.datname = current_database() AND acl.privilege_type = 'CONNECT'
      AND acl.grantee NOT IN (to_regrole('"${owner}"')::oid, '${exporter}'::regrole::oid)
  ) THEN RAISE EXCEPTION 'Application database connection fence is missing'; END IF;
END $$;`;
}

export function databaseSql(operation, workloads, { owner, legacy }) {
  databaseIdentities(workloads);
  const roles = [
    ...databaseIdentities(runtimeCommands).map(({ name }) => name),
    databaseRole(bootstrap),
  ];
  for (const role of [owner, legacy]) assert.match(role, identifierPattern);
  assert.equal(
    new Set([...roles, owner, legacy, exporter, 'postgres']).size,
    roles.length + 4,
    'Database identities must differ',
  );
  const inputs = {
    commands: Object.fromEntries(
      [...workloads, bootstrap].map((command) => [command, commands[command]]),
    ),
  };
  const requiredRoles = requireScopedRoles(Object.keys(inputs.commands));
  if (operation === 'fence')
    return `
BEGIN;
${configure}
SELECT pg_advisory_xact_lock(120, 1);
${ownerAndDrain(owner)}
${ledgerCheck({ prefix: true })}
DO $$ BEGIN
${requiredRoles}
END $$;
REVOKE CONNECT, TEMPORARY ON DATABASE ${databaseName} FROM PUBLIC;
DO $$ DECLARE affected_role name;
BEGIN
  FOR affected_role IN
    SELECT rolname FROM pg_roles WHERE rolname IN (${[legacy, ...roles].map((name) => `'${name}'`).join(', ')})
  LOOP
    EXECUTE format('REVOKE CONNECT, TEMPORARY ON DATABASE %I FROM %I', current_database(), affected_role);
  END LOOP;
END $$;
GRANT CONNECT ON DATABASE ${databaseName} TO ${exporter};
${fenceCheck(owner)}
${ownerAndDrain(owner)}
COMMIT;`;
  if (operation === 'inspect')
    return `BEGIN TRANSACTION READ ONLY;
${configure}
${ledgerCheck({ prefix: true })}
DO $$ DECLARE head bigint;
BEGIN
  IF to_regclass('public._sqlx_migrations') IS NOT NULL THEN
    SELECT max(version) INTO head FROM public._sqlx_migrations;
  END IF;
  RAISE NOTICE 'Verified migration head: %', coalesce(head, 0);
END $$;
COMMIT;`;
  if (operation === 'withdrawn' || operation === 'retired') {
    const withdrawn = [owner, databaseRole(bootstrap)];
    if (operation === 'retired') withdrawn.push(legacy);
    const names = withdrawn.map((name) => `('${name}')`).join(', ');
    return `BEGIN TRANSACTION READ ONLY;
${configure}
DO $$ BEGIN
  IF current_database() <> '${databaseName}' OR pg_is_in_recovery()
      OR EXISTS (
        SELECT FROM (VALUES ${names}) AS expected(name)
        LEFT JOIN pg_authid r ON r.rolname = expected.name
        WHERE r.rolcanlogin IS DISTINCT FROM false OR r.rolpassword IS NOT NULL
          OR EXISTS (SELECT FROM pg_stat_activity a WHERE a.usesysid = r.oid)
      )
  THEN RAISE EXCEPTION 'Retired database identities still have authority or sessions'; END IF;
END $$;
COMMIT;`;
  }
  if (operation === 'verify')
    return `
BEGIN TRANSACTION READ ONLY;
${configure}
${ledgerCheck()}
${verifyPrivileges(inputs, legacy)}
COMMIT;`;
  assert.equal(
    operation,
    'grant',
    'Choose inspect, fence, grant, verify, withdrawn or retired',
  );
  return `
BEGIN;
${configure}
SELECT pg_advisory_xact_lock(120, 1);
${ownerAndDrain(owner)}
${fenceCheck(owner)}
${ledgerCheck()}
DO $$ BEGIN
${requiredRoles}
END $$;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE EXECUTE ON ALL ROUTINES IN SCHEMA ${productSchemas} FROM PUBLIC;
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
${Object.entries(inputs.commands)
  .map(([command, grants]) => privileges(command, grants))
  .join('\n')}
${verifyPrivileges(inputs, legacy)}
${ownerAndDrain(owner)}
COMMIT;`;
}

function roleValues(commands) {
  return commands.map((command) => `'${databaseRole(command)}'`).join(', ');
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
    const role = databaseRole(command);
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

function verifyPrivileges(inputs, legacy) {
  const selected = Object.keys(inputs.commands);
  const roles = roleValues(selected);
  const schemas =
    "'analytics', 'history', 'identity', 'ingestion', 'metadata', 'projection', 'public'";
  return `
DO $$ BEGIN
${requireScopedRoles(selected)}
  IF EXISTS (
    SELECT FROM pg_roles r
     WHERE r.rolname IN (${roleValues(runtimeCommands)}) AND r.rolname NOT IN (${roles})
       AND (r.rolcanlogin OR has_database_privilege(r.oid, current_database(), 'CONNECT')
         OR EXISTS (SELECT FROM pg_auth_members m WHERE m.roleid = r.oid))
  ) THEN RAISE EXCEPTION 'An unselected database identity still has authority'; END IF;
  IF has_database_privilege('${legacy}', current_database(), 'CONNECT')
      OR NOT has_database_privilege('${exporter}', current_database(), 'CONNECT') THEN
    RAISE EXCEPTION 'Legacy or monitoring database admission differs';
  END IF;
  IF EXISTS (
    SELECT FROM pg_namespace n CROSS JOIN pg_roles r
    WHERE n.nspname NOT IN (${schemas}, 'information_schema')
      AND left(n.nspname, 3) <> 'pg_'
      AND r.rolname IN (${roles})
      AND (has_schema_privilege(r.oid, n.oid, 'USAGE')
        OR has_schema_privilege(r.oid, n.oid, 'CREATE'))
  ) THEN RAISE EXCEPTION 'Unintended access to an additional user schema'; END IF;
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
    ), expected AS (VALUES ${expectedPrivileges(inputs)})
    (SELECT * FROM expected EXCEPT SELECT * FROM observed)
      UNION ALL
    (SELECT * FROM observed EXCEPT SELECT * FROM expected)
  ) THEN RAISE EXCEPTION 'FleetIQ object grants differ from the producer contract'; END IF;
END $$;`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [operation, owner, legacy, ...workloads] = process.argv.slice(2);
  console.log(databaseSql(operation, workloads, { owner, legacy }));
}
