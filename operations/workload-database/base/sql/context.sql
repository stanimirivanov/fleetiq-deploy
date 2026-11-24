\getenv expected_release FLEETIQ_RELEASE_DIGEST
\getenv database_oid FLEETIQ_DATABASE_OID
\getenv owner PGUSER
\getenv legacy FLEETIQ_LEGACY_ROLE
\getenv workloads FLEETIQ_WORKLOADS
\getenv inventory FLEETIQ_MIGRATION_INVENTORY

SET statement_timeout = '8s';
SET lock_timeout = '2s';
SET search_path = pg_catalog, public;

SELECT set_config('fleetiq.request', :'release_digest', false) AS request,
       set_config('fleetiq.expected_release', :'expected_release', false) AS release,
       set_config('fleetiq.database_oid', :'database_oid', false) AS database_oid,
       set_config('fleetiq.owner', :'owner', false) AS owner,
       set_config('fleetiq.legacy', :'legacy', false) AS legacy,
       set_config('fleetiq.workloads', :'workloads', false) AS workloads,
       set_config('fleetiq.inventory', :'inventory', false) AS inventory
\gset reviewed_

DO $$ BEGIN
  IF current_setting('fleetiq.request') <> current_setting('fleetiq.expected_release') THEN
    RAISE EXCEPTION 'Request digest does not match the reviewed workflow';
  END IF;
  IF current_database() <> 'fleetiq' OR pg_is_in_recovery()
      OR current_setting('server_version_num')::integer / 10000 <> 18
      OR session_user <> current_setting('fleetiq.owner')
      OR current_user <> session_user
      OR NOT EXISTS (
        SELECT FROM pg_database
        WHERE datname = current_database()
          AND oid = current_setting('fleetiq.database_oid')::oid
          AND datdba = session_user::regrole
      )
  THEN RAISE EXCEPTION 'Expected the reviewed PostgreSQL 18 primary and migration owner'; END IF;
END $$;

CREATE TEMP VIEW migration_inventory AS
SELECT version::bigint AS version, checksum
FROM jsonb_to_recordset(current_setting('fleetiq.inventory')::jsonb -> 'migrations')
  AS entry(version text, checksum text);

CREATE FUNCTION pg_temp.check_ledger(prefix boolean) RETURNS void
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$ BEGIN
  IF current_setting('fleetiq.inventory')::jsonb ->> 'format' IS DISTINCT FROM 'fleetiq-migrations.v1'
      OR current_setting('fleetiq.inventory')::jsonb ->> 'checksum_algorithm' IS DISTINCT FROM 'sha384'
      OR NOT EXISTS (SELECT FROM pg_temp.migration_inventory)
      OR EXISTS (
        SELECT FROM pg_temp.migration_inventory
        WHERE version IS NULL OR version < 1 OR checksum IS NULL OR checksum !~ '^[0-9a-f]{96}$'
      )
      OR EXISTS (SELECT FROM pg_temp.migration_inventory GROUP BY version HAVING count(*) > 1)
  THEN RAISE EXCEPTION 'Reviewed migration inventory is invalid'; END IF;
  IF to_regclass('public._sqlx_migrations') IS NULL THEN
    IF prefix THEN RETURN; END IF;
    RAISE EXCEPTION 'FleetIQ migration ledger missing';
  END IF;
  IF EXISTS (
    SELECT FROM public._sqlx_migrations a
    LEFT JOIN pg_temp.migration_inventory e USING (version)
    WHERE a.success IS DISTINCT FROM true OR encode(a.checksum, 'hex') IS DISTINCT FROM e.checksum
  ) OR EXISTS (
    SELECT FROM pg_temp.migration_inventory e
    WHERE (NOT prefix OR e.version <= (SELECT max(version) FROM public._sqlx_migrations))
      AND NOT EXISTS (SELECT FROM public._sqlx_migrations a WHERE a.version = e.version)
  ) THEN RAISE EXCEPTION 'FleetIQ migration ledger differs'; END IF;
END $$;

CREATE FUNCTION pg_temp.check_drained() RETURNS void
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$ BEGIN
  PERFORM pg_stat_clear_snapshot();
  IF EXISTS (
    SELECT FROM pg_stat_activity
    WHERE datid = current_setting('fleetiq.database_oid')::oid AND pid <> pg_backend_pid()
      AND usesysid IS DISTINCT FROM to_regrole('cnpg_metrics_exporter')::oid
  ) OR EXISTS (SELECT FROM pg_prepared_xacts WHERE database = current_database())
  THEN RAISE EXCEPTION 'Grant application requires a drained database'; END IF;
END $$;

CREATE FUNCTION pg_temp.check_fence() RETURNS void
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$ BEGIN
  IF NOT has_database_privilege('cnpg_metrics_exporter', current_database(), 'CONNECT')
      OR EXISTS (
    SELECT FROM pg_database d, LATERAL aclexplode(coalesce(d.datacl, acldefault('d', d.datdba))) a
    WHERE d.oid = current_setting('fleetiq.database_oid')::oid AND a.privilege_type = 'CONNECT'
      AND a.grantee NOT IN (session_user::regrole::oid, 'cnpg_metrics_exporter'::regrole::oid)
  ) THEN RAISE EXCEPTION 'Application database connection fence is missing'; END IF;
END $$;
