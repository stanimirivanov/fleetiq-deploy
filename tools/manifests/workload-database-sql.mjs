import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  bootstrap,
  databaseIdentities,
  databaseRole,
  runtimeCommands,
} from './workload-database.mjs';

const databaseName = 'fleetiq';
const exporter = 'cnpg_metrics_exporter';
const identifierPattern = /^[a-z_][a-z_0-9]{0,62}$/u;
const configure = `SET LOCAL statement_timeout = '8s'; SET LOCAL lock_timeout = '2s';
SET LOCAL search_path = pg_catalog, public;`;

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
  const selected = [...workloads, bootstrap].map(databaseRole);
  const selectedRoles = `ARRAY[${selected.map((name) => `'${name}'`).join(', ')}]::name[]`;
  const requiredRoles = requireScopedRoles(selected);
  const checkGrants = `SELECT pg_temp.fleetiq_verify_runtime_grants(${selectedRoles});
DO $$ BEGIN
${requiredRoles}
  IF has_database_privilege('${legacy}', current_database(), 'CONNECT')
      OR NOT has_database_privilege('${exporter}', current_database(), 'CONNECT') THEN
    RAISE EXCEPTION 'Legacy or monitoring database admission differs';
  END IF;
END $$;`;
  if (operation === 'fence')
    return `
BEGIN;
${configure}
SELECT pg_advisory_xact_lock(120, 1);
${ownerAndDrain(owner)}
SELECT pg_temp.fleetiq_check_ledger(true);
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
SELECT pg_temp.fleetiq_check_ledger(true);
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
SELECT pg_temp.fleetiq_check_ledger(false);
${checkGrants}
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
SELECT pg_temp.fleetiq_check_ledger(false);
DO $$ BEGIN
${requiredRoles}
END $$;
SELECT pg_temp.fleetiq_apply_runtime_grants(${selectedRoles});
${checkGrants}
${ownerAndDrain(owner)}
COMMIT;`;
}

function requireScopedRoles(names) {
  const roles = names.map((name) => `'${name}'`).join(', ');
  return `
  IF EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname IN (${roles}) AND (rolsuper OR rolinherit OR rolcreaterole OR rolcreatedb OR rolreplication OR rolbypassrls)
  ) OR (SELECT count(*) FROM pg_roles WHERE rolname IN (${roles})) <> ${names.length}
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

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [operation, owner, legacy, ...workloads] = process.argv.slice(2);
  console.log(databaseSql(operation, workloads, { owner, legacy }));
}
