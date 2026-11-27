-- The calling SQL chooses the verb. The inventory below is the same on grant
-- and withdrawal. The platform executes the rebuild as the calling role.
:rebuild_acl_action CONNECT ON DATABASE fleetiq :rebuild_acl_direction fleetiq_rebuild_current;
:rebuild_acl_action USAGE ON SCHEMA history, metadata, projection :rebuild_acl_direction fleetiq_rebuild_current;
:rebuild_acl_action SELECT ON TABLE public._sqlx_migrations :rebuild_acl_direction fleetiq_rebuild_current;
:rebuild_acl_action EXECUTE ON FUNCTION projection.rebuild_current(text) :rebuild_acl_direction fleetiq_rebuild_current;

-- The projection's hot-evidence trigger locks the exact history row FOR SHARE.
-- The source immutability trigger rejects changes to the lock column.
:rebuild_acl_action SELECT (tenant_id, message_id, protocol_package_id, protocol_package_version,
  output_index, binding_id, binding_revision, event_time_basis, event_at_ms), UPDATE (tenant_id)
  ON TABLE history.asset_property_changes :rebuild_acl_direction fleetiq_rebuild_current;
:rebuild_acl_action SELECT (tenant_id, binding_id, revision, target_asset_id,
  target_property_id, target_property_version)
  ON TABLE metadata.signal_binding_revisions :rebuild_acl_direction fleetiq_rebuild_current;

-- The generated column supplies UPDATE permission for the tenant row lock.
:rebuild_acl_action SELECT (tenant_id, is_active), UPDATE (runtime_lock_guard)
  ON TABLE metadata.tenants :rebuild_acl_direction fleetiq_rebuild_current;

:rebuild_acl_action SELECT (tenant_id), INSERT, DELETE
  ON TABLE projection.current_properties :rebuild_acl_direction fleetiq_rebuild_current;
:rebuild_acl_action SELECT (tenant_id), DELETE
  ON TABLE projection.pending_changes :rebuild_acl_direction fleetiq_rebuild_current;
:rebuild_acl_action SELECT (tenant_id, generation, revision), INSERT (tenant_id),
  UPDATE (generation, revision, processed_count)
  ON TABLE projection.tenant_heads :rebuild_acl_direction fleetiq_rebuild_current;
