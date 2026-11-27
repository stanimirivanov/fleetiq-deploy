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
      AND tgenabled IN ('O', 'A')
      AND tgqual IS NULL
  ) THEN RAISE EXCEPTION 'The history immutability trigger must protect the rebuild row lock'; END IF;
END $$;
\ir revoke.sql

\set rebuild_acl_action GRANT
\set rebuild_acl_direction TO
\ir acl.sql

SELECT pg_temp.check_rebuild_disabled(), pg_temp.check_drained();
COMMIT;
