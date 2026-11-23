\ir policy.sql

BEGIN;
SELECT pg_advisory_xact_lock(120, 1);
SELECT pg_temp.check_drained(), pg_temp.check_ledger(true), pg_temp.check_scoped_roles();
REVOKE CONNECT, TEMPORARY ON DATABASE fleetiq FROM PUBLIC;
SELECT format('REVOKE CONNECT, TEMPORARY ON DATABASE %I FROM %I', current_database(), rolname)
FROM pg_roles
WHERE rolname = current_setting('fleetiq.legacy')
   OR rolname IN (SELECT name FROM pg_temp.known_roles)
\gexec
GRANT CONNECT ON DATABASE fleetiq TO cnpg_metrics_exporter;
SELECT pg_temp.check_fence(), pg_temp.check_drained();
COMMIT;
