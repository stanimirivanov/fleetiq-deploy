\set ON_ERROR_STOP on
\ir context.sql
\ir revoke.sql

SELECT pg_temp.check_rebuild_disabled(), pg_temp.check_drained();
COMMIT;
