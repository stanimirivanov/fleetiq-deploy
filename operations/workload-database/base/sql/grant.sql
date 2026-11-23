\ir policy.sql
\ir verification.sql

BEGIN;
SELECT pg_advisory_xact_lock(120, 1);
SELECT pg_temp.check_drained(), pg_temp.check_fence(), pg_temp.check_ledger(false), pg_temp.check_scoped_roles();
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
SELECT format('REVOKE EXECUTE ON ALL ROUTINES IN SCHEMA %I FROM PUBLIC', name)
FROM pg_temp.product_schemas WHERE name <> 'public'
\gexec
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- Object and role names are resolved or quoted by PostgreSQL. Verbs come from
-- the reviewed policy relation and are exercised by the verification query.
SELECT CASE kind
  WHEN 'database' THEN format('GRANT CONNECT ON DATABASE %I TO %I', object, role_name)
  WHEN 'schema' THEN format('GRANT USAGE ON SCHEMA %I TO %I', object, role_name)
  WHEN 'relation' THEN format('GRANT %s ON TABLE %s TO %I', privilege, object::regclass, role_name)
  WHEN 'column' THEN format('GRANT UPDATE (%I) ON TABLE %s TO %I',
    split_part(object, '.', 3), (split_part(object, '.', 1) || '.' || split_part(object, '.', 2))::regclass, role_name)
  WHEN 'function' THEN format('GRANT EXECUTE ON FUNCTION %s TO %I', object::regprocedure, role_name)
END
FROM pg_temp.desired_acl
ORDER BY kind, object, role_name, privilege
\gexec
SELECT pg_temp.verify_acl(), pg_temp.check_drained();
COMMIT;
