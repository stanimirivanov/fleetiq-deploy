-- The v2 Workflow projects this file at the shared transaction's ACL include.
\ir rebuild-acl-v1.sql

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT FROM pg_roles r
    WHERE r.rolname = 'fleetiq_rebuild_current_observer'
      AND NOT (r.rolcanlogin OR r.rolsuper OR r.rolinherit OR r.rolcreaterole
               OR r.rolcreatedb OR r.rolreplication OR r.rolbypassrls)
      AND r.rolconnlimit = 10
      AND NOT EXISTS (SELECT FROM pg_auth_members m WHERE r.oid IN (m.member, m.roleid))
  ) THEN RAISE EXCEPTION 'The fenced owner requires an isolated disabled observer role'; END IF;
END $$;

-- Keep the existing grant, revoke and effective-privilege checks on the same
-- transaction and inventory. These columns are read by platform c2135d3:
-- browser session lookup, actor resolution, tenant telemetry policy, and
-- projection scope/head/current, including hydration of the immutable winner.
ALTER VIEW pg_temp.rebuild_acl RENAME TO rebuild_acl_v1;
CREATE TEMP VIEW rebuild_acl AS
SELECT * FROM pg_temp.rebuild_acl_v1
UNION ALL
SELECT 'fleetiq_rebuild_current_observer'::name, kind, object, privilege, column_name
FROM (VALUES
  ('database', 'fleetiq', 'CONNECT', NULL),
  ('schema', 'history', 'USAGE', NULL),
  ('schema', 'identity', 'USAGE', NULL),
  ('schema', 'ingestion', 'USAGE', NULL),
  ('schema', 'metadata', 'USAGE', NULL),
  ('schema', 'projection', 'USAGE', NULL),
  ('relation', 'public._sqlx_migrations', 'SELECT', NULL),

  ('column', 'identity.browser_sessions', 'SELECT', ARRAY[
    'credential_digest', 'provider_digest', 'authority_id', 'subject', 'actor_id', 'expires_at_ms'
  ]),
  ('column', 'identity.external_actor_identities', 'SELECT', ARRAY[
    'authority_id', 'subject', 'actor_id'
  ]),
  ('column', 'identity.actors', 'SELECT', ARRAY['actor_id', 'is_active']),
  ('column', 'identity.tenant_action_grants', 'SELECT', ARRAY['tenant_id', 'actor_id', 'action']),
  ('column', 'metadata.tenants', 'SELECT', ARRAY['tenant_id', 'is_active']),

  ('column', 'metadata.assets', 'SELECT', ARRAY['tenant_id', 'asset_id', 'type_id', 'type_version']),
  ('column', 'metadata.asset_type_properties', 'SELECT', ARRAY[
    'tenant_id', 'type_id', 'type_version', 'property_id', 'property_version'
  ]),
  ('column', 'projection.tenant_heads', 'SELECT', ARRAY[
    'tenant_id', 'generation', 'revision', 'processed_count'
  ]),
  ('column', 'projection.pending_changes', 'SELECT', ARRAY['tenant_id']),
  ('column', 'projection.current_properties', 'SELECT', ARRAY[
    'tenant_id', 'asset_id', 'property_id', 'property_version', 'message_id',
    'protocol_package_id', 'protocol_package_version', 'output_index',
    'binding_id', 'binding_revision', 'event_time_basis'
  ]),
  ('column', 'history.asset_property_changes', 'SELECT', ARRAY[
    'tenant_id', 'message_id', 'protocol_package_id', 'protocol_package_version',
    'output_index', 'binding_id', 'binding_revision', 'event_time_basis', 'event_at_ms',
    'resolution_effective_at_ms', 'resolution_known_at_ms'
  ]),
  ('column', 'metadata.signal_binding_revisions', 'SELECT', ARRAY[
    'tenant_id', 'binding_id', 'revision', 'target_asset_id', 'target_property_id',
    'target_property_version'
  ]),
  ('column', 'ingestion.decoded_observations', 'SELECT', ARRAY[
    'tenant_id', 'message_id', 'protocol_package_id', 'protocol_package_version',
    'output_index', 'endpoint_id', 'signal_id', 'device_recorded_at_ms', 'value_kind',
    'value_boolean', 'value_integer', 'value_decimal', 'value_text', 'source_unit', 'quality'
  ]),
  ('column', 'ingestion.accepted_messages', 'SELECT', ARRAY[
    'tenant_id', 'message_id', 'protocol_package_id', 'protocol_package_version',
    'device_asset_id', 'received_at_ms'
  ])
) AS entry(kind, object, privilege, columns)
LEFT JOIN LATERAL unnest(columns) AS entry_column(column_name) ON true;
