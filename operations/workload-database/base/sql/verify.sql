\ir policy.sql
\ir verification.sql

BEGIN READ ONLY;
SELECT pg_temp.check_ledger(false), pg_temp.verify_acl();
COMMIT;
