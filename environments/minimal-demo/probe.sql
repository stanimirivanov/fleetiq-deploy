-- Run over verified TLS with one reviewed, scoped runtime login.
-- The caller supplies expected_role, expected_database_oid and expected_ledger_entries
-- as psql variables, with ON_ERROR_STOP set. No fixture state survives the transaction.
BEGIN;
SET LOCAL search_path = pg_catalog, public;
SET LOCAL statement_timeout = '8s';
SET LOCAL lock_timeout = '2s';

SELECT set_config('fleetiq_probe.expected_role', :'expected_role', true) AS probe_role,
       set_config('fleetiq_probe.expected_database_oid', :'expected_database_oid', true) AS probe_oid,
       set_config('fleetiq_probe.expected_ledger_entries', :'expected_ledger_entries', true) AS probe_entries
\gset

DO $$ BEGIN
  IF current_database() <> 'fleetiq' OR pg_is_in_recovery()
      OR current_setting('server_version_num')::integer / 10000 <> 18
      OR current_setting('max_connections') <> '64'
      OR NOT EXISTS (SELECT FROM pg_stat_ssl WHERE pid = pg_backend_pid() AND ssl)
  THEN RAISE EXCEPTION 'Expected the PostgreSQL 18 primary over TLS with 64 connections'; END IF;

  IF current_user::text <> current_setting('fleetiq_probe.expected_role')
      OR session_user <> current_user
      OR (SELECT oid FROM pg_database WHERE datname = current_database())
         <> current_setting('fleetiq_probe.expected_database_oid')::oid
  THEN RAISE EXCEPTION 'Runtime role or database OID differs from reviewed inputs'; END IF;

  IF current_setting('fleetiq_probe.expected_ledger_entries')::integer <= 0
      OR (SELECT count(*) FROM public._sqlx_migrations)
         <> current_setting('fleetiq_probe.expected_ledger_entries')::integer
      OR EXISTS (SELECT FROM public._sqlx_migrations WHERE success IS DISTINCT FROM true)
  THEN RAISE EXCEPTION 'Migration ledger differs from the reviewed count or has failed entries'; END IF;

  IF NOT has_database_privilege('cnpg_metrics_exporter', current_database(), 'CONNECT')
      OR EXISTS (
        SELECT FROM pg_roles WHERE rolname IN (
          'fleetiq_runtime', 'fleetiq_migrator', 'fleetiq_bootstrap_platform_operator'
        ) AND rolcanlogin
      )
      OR (SELECT count(*) FROM pg_roles WHERE rolname IN (
        'fleetiq_runtime', 'fleetiq_migrator', 'fleetiq_bootstrap_platform_operator'
      )) <> 3
      OR EXISTS (
        SELECT FROM pg_stat_activity WHERE usename IN (
          'fleetiq_runtime', 'fleetiq_migrator', 'fleetiq_bootstrap_platform_operator'
        )
      )
  THEN RAISE EXCEPTION 'Expected exporter access and retired temporary and legacy logins'; END IF;

  IF EXISTS (
    SELECT FROM pg_roles WHERE rolname = current_user
      AND (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls)
  ) OR has_database_privilege(current_user, current_database(), 'TEMP')
  THEN RAISE EXCEPTION 'Runtime login has elevated database rights'; END IF;

  BEGIN
    EXECUTE 'CREATE TABLE public.fleetiq_demo_permission_probe (id integer)';
    RAISE EXCEPTION 'Runtime role can create tables';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    EXECUTE 'SET ROLE fleetiq_migrator';
    RAISE EXCEPTION 'Runtime role can assume ownership';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM rolpassword FROM pg_catalog.pg_authid WHERE rolname = current_user;
    RAISE EXCEPTION 'Runtime role can read password verifiers';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;

SELECT json_build_object(
  'role', current_user,
  'database_oid', (SELECT oid FROM pg_database WHERE datname = current_database()),
  'started_at', pg_postmaster_start_time(),
  'max_connections', current_setting('max_connections')::integer,
  'reserved_connections', current_setting('reserved_connections')::integer,
  'superuser_reserved_connections', current_setting('superuser_reserved_connections')::integer,
  'ledger_entries', (SELECT count(*) FROM public._sqlx_migrations),
  'observed_client_sessions', (
    SELECT coalesce(json_object_agg(role, sessions), '{}'::json)
    FROM (
      SELECT usename AS role, count(*) AS sessions
      FROM pg_stat_activity
      WHERE datname = current_database() AND backend_type = 'client backend'
        AND usename IS NOT NULL AND pid <> pg_backend_pid()
      GROUP BY usename
    ) counts
  )
);
ROLLBACK;
