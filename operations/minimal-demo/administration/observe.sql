-- Run before launch and after terminal or uncertain execution. Keep the exact
-- scope, database identity and read-only observer service fixed across both reads.
SET statement_timeout = '5s';
SET lock_timeout = '2s';
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;

SELECT (
  current_database() = 'fleetiq' AND NOT pg_is_in_recovery()
    AND (SELECT oid FROM pg_database WHERE datname = current_database()) = :'database_oid'::oid
    AND :'operation' IN ('migrate','bootstrap','rebuild','register','calculate','reclaim','summarize','expire')
    AND jsonb_typeof(:'scope'::jsonb) = 'object'
)::integer AS valid,
  :'operation' = 'migrate' AS migrate,
  :'operation' = 'bootstrap' AS bootstrap,
  :'operation' = 'rebuild' AS rebuild,
  :'operation' = 'register' AS register,
  :'operation' = 'calculate' AS calculate,
  :'operation' = 'reclaim' AS reclaim,
  :'operation' = 'summarize' AS summarize,
  :'operation' = 'expire' AS expire
\gset
\if :valid
\else
  -- Fail ON_ERROR_STOP without disclosing database identities.
  SELECT 1 / 0;
\endif

\if :migrate
  SELECT to_regclass('public._sqlx_migrations') IS NOT NULL AS ledger_present
  \gset
  \if :ledger_present
    SELECT jsonb_build_object('ledgerPresent', true,
      'migrationEntries', count(*) FILTER (WHERE success),
      'failedEntries', count(*) FILTER (WHERE NOT success),
      'ledgerDigest', encode(sha256(convert_to(coalesce(string_agg(
        version::text || ':' || encode(checksum, 'hex'), E'\n' ORDER BY version), ''), 'UTF8')), 'hex'))
    FROM public._sqlx_migrations;
  \else
    SELECT jsonb_build_object('ledgerPresent', false, 'migrationEntries', 0,
      'failedEntries', 0, 'ledgerDigest', NULL);
  \endif
\elif :bootstrap
  SELECT jsonb_build_object('present', b.singleton IS TRUE,
    'identityMatches', coalesce((i.actor_id = b.actor_id AND
      encode(sha256(convert_to(jsonb_build_array(b.actor_id, b.authority_id, b.subject)::text, 'UTF8')),
        'hex') = :'scope'::jsonb->>'identityDigest'), false))
  FROM (VALUES (true)) AS probe(singleton)
  LEFT JOIN identity.platform_bootstrap b USING (singleton)
  LEFT JOIN identity.external_actor_identities i USING (authority_id, subject);
\elif :rebuild
  WITH scope AS (SELECT :'scope'::jsonb AS v)
  SELECT jsonb_build_object('generation', h.generation::text, 'revision', h.revision::text,
    'processed', h.processed_count::text, 'winnerDigest',
    encode(sha256(convert_to(to_jsonb(p)::text, 'UTF8')), 'hex'))
  FROM scope
  LEFT JOIN projection.tenant_heads h ON h.tenant_id = scope.v->>'tenant'
  LEFT JOIN projection.current_properties p ON p.tenant_id = h.tenant_id
    AND p.asset_id = scope.v->>'asset' AND p.property_id = scope.v->>'property'
    AND p.property_version = (scope.v->>'version')::bigint;
\elif :register
  WITH scope AS (SELECT :'scope'::jsonb AS v)
  SELECT jsonb_build_object('present', d.tenant_id IS NOT NULL,
    'matches', coalesce(
      (d.implementation, d.input_id, d.input_version, d.output_id, d.output_version) =
      (scope.v->>'implementation', scope.v->>'input', (scope.v->>'input_version')::bigint,
        scope.v->>'output', (scope.v->>'output_version')::bigint), false))
  FROM scope
  LEFT JOIN analytics.calculator_definitions d ON d.tenant_id = scope.v->>'tenant'
    AND d.calculator_id = scope.v->>'calculator' AND d.calculator_version = scope.v->>'version';
\elif :calculate
  WITH scope AS (SELECT :'scope'::jsonb AS v)
  SELECT jsonb_build_object('prepared', p.tenant_id IS NOT NULL,
    'requestMatches', coalesce(p.request = (scope.v - ARRAY['tenant', 'evaluation']), false),
    'terminal', e.outcome, 'outputCount', jsonb_array_length(e.outputs),
    'outputDigest', encode(sha256(convert_to(e.outputs::text, 'UTF8')), 'hex'))
  FROM scope
  LEFT JOIN analytics.prepared_evaluations p ON p.tenant_id = scope.v->>'tenant'
    AND p.evaluation_id = scope.v->>'evaluation'
  LEFT JOIN analytics.evaluations e ON e.tenant_id = scope.v->>'tenant'
    AND e.evaluation_id = scope.v->>'evaluation';
\elif :reclaim
  WITH scope AS (SELECT :'scope'::jsonb AS v)
  SELECT jsonb_build_object('receiptRecords', r.records,
    'policyMatches', coalesce(r.policy_revision = (scope.v->>'policyRevision')::bigint, false),
    'archiveDigest', encode(a.object_sha256, 'hex'), 'members', count(m.job_id),
    'clearedMembers', count(m.job_id) FILTER (WHERE c.tenant_id IS NOT NULL AND c.event_at_ms IS NULL AND
      c.resolution_effective_at_ms IS NULL AND c.resolution_known_at_ms IS NULL))
  FROM scope
  LEFT JOIN history.archive_jobs a ON a.tenant_id = scope.v->>'tenant'
    AND a.job_id = (scope.v->>'manifest')::bigint
  LEFT JOIN history.retention_receipts r ON (r.tenant_id, r.manifest_id) = (a.tenant_id, a.job_id)
  LEFT JOIN history.archive_members m ON (m.tenant_id, m.job_id) = (a.tenant_id, a.job_id)
  LEFT JOIN history.asset_property_changes c ON
    (m.tenant_id, m.message_id, m.protocol_package_id, m.protocol_package_version,
      m.output_index, m.binding_id, m.binding_revision, m.event_time_basis) =
    (c.tenant_id, c.message_id, c.protocol_package_id, c.protocol_package_version,
      c.output_index, c.binding_id, c.binding_revision, c.event_time_basis)
  GROUP BY r.records, r.policy_revision, a.object_sha256, scope.v;
\elif :summarize
  WITH scope AS (SELECT :'scope'::jsonb AS v)
  SELECT jsonb_build_object('series', s.series_id::text, 'head', s.revision::text,
    'revision', r.revision::text, 'fingerprint', encode(r.fingerprint, 'hex'),
    'inputs', jsonb_array_length(r.body->'inputs'), 'buckets', jsonb_array_length(r.body->'buckets'))
  FROM scope
  LEFT JOIN history.numeric_summary_series s ON s.tenant_id = scope.v->>'tenant'
    AND s.asset_id = scope.v->>'asset' AND s.property_id = scope.v->>'property'
    AND s.property_version = (scope.v->>'version')::bigint
    AND s.start_ms = (scope.v->>'start')::bigint AND s.end_ms = (scope.v->>'end')::bigint
    AND s.width_ms = (scope.v->>'resolution')::bigint
    AND s.manifest_id IS NOT DISTINCT FROM (scope.v->>'manifest')::bigint
    AND s.restore_generation IS NOT DISTINCT FROM (scope.v->>'generation')::bigint
  LEFT JOIN history.numeric_summaries r ON (r.tenant_id, r.series_id) = (s.tenant_id, s.series_id)
    AND r.revision = coalesce((scope.v->>'receiptRevision')::bigint, s.revision);
\elif :expire
  -- Select every row for this fenced fixture tenant, including stable controls
  -- and rows that can become eligible while the Job runs. Refuse a larger scope.
  WITH scope AS (SELECT :'scope'::jsonb->>'tenant' AS tenant),
  restores AS MATERIALIZED (
    SELECT r.manifest_id::text AS id, r.request_generation::text AS generation,
      r.status, r.payload IS NOT NULL AS "hasPayload",
      r.expires_at AS "expiresAt", r.lease_until AS "leaseUntil"
    FROM scope JOIN history.restore_jobs r ON r.tenant_id = scope.tenant
    ORDER BY r.manifest_id LIMIT 33
  ), exports AS MATERIALIZED (
    SELECT e.job_id::text AS id, e.selection_generation::text AS generation,
      encode(sha256(convert_to(e.request_key, 'UTF8')), 'hex') AS "requestDigest",
      e.status, e.payload IS NOT NULL AS "hasPayload", e.attempt::text AS attempt,
      e.expires_at AS "expiresAt", e.lease_until AS "leaseUntil"
    FROM scope JOIN history.export_jobs e ON e.tenant_id = scope.tenant
    ORDER BY e.job_id LIMIT 33
  )
  SELECT (nullif(scope.tenant, '') IS NOT NULL
    AND EXISTS (SELECT 1 FROM metadata.tenants t WHERE t.tenant_id = scope.tenant)
    AND (SELECT count(*) FROM restores) <= 32 AND (SELECT count(*) FROM exports) <= 32
  ) AS fixture_bounded,
  (SELECT jsonb_build_object('observedAt', transaction_timestamp(),
    'restores', coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id::bigint) FROM restores r), '[]'),
    'exports', coalesce((SELECT jsonb_agg(to_jsonb(e) ORDER BY e.id::bigint) FROM exports e), '[]'))
  ) AS fixture_snapshot
  FROM scope
  \gset
  \if :fixture_bounded
    SELECT :'fixture_snapshot'::jsonb;
  \else
    SELECT 1 / 0;
  \endif
\endif

COMMIT;
