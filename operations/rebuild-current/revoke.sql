\set rebuild_acl_action REVOKE
\set rebuild_acl_direction FROM
\ir acl.sql

DO $$ BEGIN
  IF has_database_privilege('fleetiq_rebuild_current', current_database(), 'CONNECT')
      OR EXISTS (
        SELECT FROM pg_shdepend d WHERE d.refclassid = 'pg_authid'::regclass
          AND d.refobjid = 'fleetiq_rebuild_current'::regrole
      )
  THEN RAISE EXCEPTION 'Unexpected retained authority for the rebuild login'; END IF;
END $$;
