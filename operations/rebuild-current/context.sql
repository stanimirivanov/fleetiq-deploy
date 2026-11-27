-- For use by grant.sql and withdraw.sql in the fenced owner phase.
BEGIN;
\ir ../workload-database/base/sql/context.sql
\ir ../workload-database/base/sql/policy.sql
\ir acl.sql

SELECT pg_advisory_xact_lock(120, 1);
SELECT pg_temp.check_ledger(false), pg_temp.check_drained();

CREATE FUNCTION pg_temp.check_rebuild_disabled() RETURNS void
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$ BEGIN
  IF NOT EXISTS (
    SELECT FROM pg_roles r
    WHERE r.rolname = 'fleetiq_rebuild_current'
      AND NOT (r.rolcanlogin OR r.rolsuper OR r.rolinherit OR r.rolcreaterole
               OR r.rolcreatedb OR r.rolreplication OR r.rolbypassrls)
      AND r.rolconnlimit = 2
      AND NOT EXISTS (SELECT FROM pg_auth_members m WHERE r.oid IN (m.member, m.roleid))
      AND NOT EXISTS (
        SELECT FROM pg_shdepend d WHERE d.refclassid = 'pg_authid'::regclass
          AND d.deptype = 'o' AND d.refobjid = r.oid
      )
  ) OR EXISTS (
    SELECT FROM pg_roles
    WHERE rolcanlogin
      AND (rolname = current_setting('fleetiq.legacy')
           OR rolname IN (SELECT name FROM pg_temp.known_roles))
  ) THEN RAISE EXCEPTION 'Rebuild and product logins must be disabled in the fenced owner phase'; END IF;
END $$;

SELECT pg_temp.check_rebuild_disabled();
