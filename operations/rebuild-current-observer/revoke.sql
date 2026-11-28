-- Shared REVOKE consumes the v2 ACL and checks the rebuild role as before.
\ir rebuild-revoke-v1.sql

DO $$ BEGIN
  IF has_database_privilege('fleetiq_rebuild_current_observer', current_database(), 'CONNECT,TEMP,CREATE')
      OR has_function_privilege('fleetiq_rebuild_current_observer', 'projection.rebuild_current(text)', 'EXECUTE')
      OR EXISTS (
        SELECT FROM pg_shdepend d WHERE d.refclassid = 'pg_authid'::regclass
          AND d.refobjid = 'fleetiq_rebuild_current_observer'::regrole
      )
  THEN RAISE EXCEPTION 'Unexpected retained authority for the rebuild-current observer'; END IF;
END $$;
