-- The platform executes the rebuild as the calling role. Grant, verification
-- and withdrawal use these same privilege rows.
CREATE TEMP VIEW rebuild_acl AS
SELECT 'fleetiq_rebuild_current'::name AS role_name, kind, object, privilege, column_name
FROM (VALUES
  ('database', 'fleetiq', 'CONNECT', NULL),
  ('schema', 'history', 'USAGE', NULL),
  ('schema', 'metadata', 'USAGE', NULL),
  ('schema', 'projection', 'USAGE', NULL),
  ('relation', 'public._sqlx_migrations', 'SELECT', NULL),
  ('function', 'projection.rebuild_current(text)', 'EXECUTE', NULL),

  -- The hot-evidence trigger locks the exact history row FOR SHARE. The
  -- source immutability trigger rejects changes to the lock column.
  ('column', 'history.asset_property_changes', 'SELECT', ARRAY[
    'tenant_id', 'message_id', 'protocol_package_id', 'protocol_package_version',
    'output_index', 'binding_id', 'binding_revision', 'event_time_basis', 'event_at_ms'
  ]),
  ('column', 'history.asset_property_changes', 'UPDATE', ARRAY['tenant_id']),

  ('column', 'metadata.signal_binding_revisions', 'SELECT', ARRAY[
    'tenant_id', 'binding_id', 'revision', 'target_asset_id',
    'target_property_id', 'target_property_version'
  ]),
  ('column', 'metadata.tenants', 'SELECT', ARRAY['tenant_id', 'is_active']),
  -- The generated column supplies UPDATE permission for the tenant row lock.
  ('column', 'metadata.tenants', 'UPDATE', ARRAY['runtime_lock_guard']),

  ('column', 'projection.current_properties', 'SELECT', ARRAY['tenant_id']),
  ('relation', 'projection.current_properties', 'INSERT', NULL),
  ('relation', 'projection.current_properties', 'DELETE', NULL),
  ('column', 'projection.pending_changes', 'SELECT', ARRAY['tenant_id']),
  ('relation', 'projection.pending_changes', 'DELETE', NULL),
  ('column', 'projection.tenant_heads', 'SELECT', ARRAY['tenant_id', 'generation', 'revision']),
  ('column', 'projection.tenant_heads', 'INSERT', ARRAY['tenant_id']),
  ('column', 'projection.tenant_heads', 'UPDATE', ARRAY['generation', 'revision', 'processed_count'])
) AS entry(kind, object, privilege, columns)
LEFT JOIN LATERAL unnest(columns) AS entry_column(column_name) ON true;
