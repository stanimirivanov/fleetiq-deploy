\set ON_ERROR_STOP on
BEGIN READ ONLY;
SET LOCAL statement_timeout = '2s';
SET LOCAL lock_timeout = '1s';

-- The observer runs against the positively identified PostgreSQL primary.
-- Exact keys bind one private synthetic turn. No wire bytes or state leave the DB.
SELECT jsonb_build_object(
    'databaseOid', dat.oid::bigint,
    'turn', encode(sha256(convert_to(jsonb_build_array(w.tenant_id, w.message_id, w.session_id)::text, 'UTF8')), 'hex'),
    'fingerprint', encode(s.execution_sha256, 'hex'),
    'accepted', true,
    'decoded', d.message_id IS NOT NULL,
    'sequence', w.sequence,
    'checkpoint', s.current_sequence,
    'status', w.status,
    'generation', w.generation,
    'attempts', w.attempts,
    'leaseUntilMs', w.lease_until_ms,
    'paused', EXISTS (
      SELECT FROM analytics.work_controls c
      WHERE c.tenant_id = w.tenant_id AND c.kind = 'replay' AND c.paused
    ),
    'policyOne', s.execution_policy = 1 AND s.admission_policy = 1,
    'sampledAtMs', floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint
  ) AS receipt
FROM ingestion.replay_work w
JOIN ingestion.replay_sessions s USING (tenant_id, session_id)
JOIN ingestion.accepted_messages m USING (tenant_id, message_id)
LEFT JOIN ingestion.decoded_message_results d
  ON d.tenant_id = w.tenant_id AND d.message_id = w.message_id
 AND d.protocol_package_id = s.protocol_package_id
 AND d.protocol_package_version = s.protocol_package_version
JOIN pg_database dat ON dat.datname = current_database()
WHERE current_database() = 'fleetiq'
  AND dat.oid = :'database_oid'::oid
  AND NOT pg_is_in_recovery()
  AND EXISTS (SELECT FROM pg_stat_ssl WHERE pid = pg_backend_pid() AND ssl)
  AND w.tenant_id = :'tenant_id'
  AND w.message_id = :'message_id'
  AND length(:'tenant_id') BETWEEN 1 AND 128
  AND length(:'message_id') BETWEEN 1 AND 128
\gset
COMMIT;
\echo :receipt
