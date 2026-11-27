\set ON_ERROR_STOP on
\ir context.sql
\ir ../workload-database/base/sql/verification.sql

SELECT pg_temp.verify_acl();
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT FROM pg_trigger
    WHERE tgrelid = 'history.asset_property_changes'::regclass
      AND tgname = 'asset_property_changes_prevent_mutation'
      AND tgfoid = to_regprocedure('history.prevent_property_change_mutation()')
      -- PostgreSQL mask for BEFORE UPDATE OR DELETE FOR EACH ROW.
      AND tgtype = 27
      AND tgattr = ''::int2vector
      AND tgenabled IN ('O', 'A')
      AND tgqual IS NULL
  ) THEN RAISE EXCEPTION 'The history immutability trigger must protect the rebuild row lock'; END IF;
END $$;
\ir revoke.sql

\set rebuild_acl_action GRANT
\set rebuild_acl_direction TO
\ir apply-acl.sql

-- PostgreSQL can issue a warning and grant only the privileges the owner holds
-- with grant option. Require every reviewed privilege before committing.
DO $$
DECLARE missing record;
BEGIN
  SELECT kind, object, privilege, column_name INTO missing
  FROM pg_temp.rebuild_acl
  WHERE (CASE kind
    WHEN 'database' THEN has_database_privilege(role_name, object, privilege)
    WHEN 'schema' THEN has_schema_privilege(role_name, object, privilege)
    WHEN 'relation' THEN has_table_privilege(role_name, object, privilege)
    WHEN 'column' THEN has_column_privilege(role_name, object, column_name, privilege)
    WHEN 'function' THEN has_function_privilege(role_name, object, privilege)
  END) IS NOT TRUE
  ORDER BY kind, object, privilege, column_name
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'Missing effective rebuild privilege % on %',
      missing.privilege, concat_ws('.', missing.object, missing.column_name);
  END IF;
END $$;

SELECT pg_temp.check_rebuild_disabled(), pg_temp.check_drained();
COMMIT;
