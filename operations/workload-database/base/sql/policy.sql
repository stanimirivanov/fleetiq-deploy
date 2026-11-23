-- Reviewed privilege rows. Application and exact ACL comparison use this one relation.
CREATE TEMP VIEW policy_objects AS
SELECT workload, kind, unnest(objects) AS object, privilege
FROM (VALUES
  -- analytics-worker
  ('analytics-worker', 'schema', 'USAGE', ARRAY[
    'analytics', 'history', 'ingestion', 'metadata', 'public'
  ]),
  ('analytics-worker', 'relation', 'SELECT', ARRAY[
    'analytics.alert_evaluation_receipts', 'analytics.alert_lifecycles',
    'analytics.alert_notification_intents', 'analytics.alert_rule_activation_changes',
    'analytics.alert_rule_revisions', 'analytics.alert_rules', 'analytics.alert_transitions',
    'analytics.calculator_configuration_revisions', 'analytics.calculator_configurations',
    'analytics.calculator_definitions', 'analytics.calculator_schedules',
    'analytics.calculator_work', 'analytics.evaluation_configurations',
    'analytics.evaluation_targets', 'analytics.evaluations', 'analytics.prepared_evaluations',
    'analytics.work_controls', 'analytics.work_recovery_audit', 'history.asset_property_changes',
    'ingestion.decoded_observations', 'metadata.asset_type_properties', 'metadata.assets',
    'metadata.property_definitions', 'metadata.signal_binding_revisions', 'metadata.tenants'
  ]),
  ('analytics-worker', 'relation', 'INSERT', ARRAY[
    'analytics.alert_evaluation_receipts', 'analytics.alert_notification_intents',
    'analytics.alert_transitions', 'analytics.calculator_work',
    'analytics.evaluation_configurations', 'analytics.evaluation_targets',
    'analytics.evaluations', 'analytics.prepared_evaluations'
  ]),
  ('analytics-worker', 'column', 'UPDATE', ARRAY[
    'analytics.alert_lifecycles.activation_generation',
    'analytics.alert_lifecycles.candidate_since_ms',
    'analytics.alert_lifecycles.last_event_at_ms', 'analytics.alert_lifecycles.last_turn_at',
    'analytics.alert_lifecycles.phase', 'analytics.alert_lifecycles.version',
    'analytics.alert_rules.runtime_lock_guard',
    'analytics.calculator_configurations.runtime_lock_guard',
    'analytics.calculator_schedules.next_start_ms', 'analytics.calculator_work.attempts',
    'analytics.calculator_work.generation', 'analytics.calculator_work.lease_until_ms',
    'analytics.calculator_work.status', 'history.asset_property_changes.tenant_id',
    'metadata.tenants.runtime_lock_guard'
  ]),
  ('analytics-worker', 'function', 'EXECUTE', ARRAY[
    'analytics.has_work_recovery(text,text,text,bigint,bigint)',
    'analytics.next_alert_evidence(text,text,bigint)',
    'analytics.semantic_evidence_id(text,text,text,text,bigint,text,numeric,text)',
    'metadata.is_valid_identifier(text)'
  ]),

  -- archive-worker
  ('archive-worker', 'schema', 'USAGE', ARRAY[
    'history', 'ingestion', 'metadata', 'public'
  ]),
  ('archive-worker', 'relation', 'SELECT', ARRAY[
    'history.archive_jobs', 'history.archive_members', 'history.asset_property_changes',
    'history.export_jobs', 'history.lifecycle_policies', 'history.restore_jobs',
    'history.work_reservations', 'ingestion.accepted_messages', 'ingestion.decoded_observations',
    'metadata.signal_binding_revisions', 'metadata.tenants'
  ]),
  ('archive-worker', 'relation', 'INSERT', ARRAY[
    'history.archive_jobs', 'history.archive_members', 'history.work_reservations'
  ]),
  ('archive-worker', 'relation', 'DELETE', ARRAY[
    'history.work_reservations'
  ]),
  ('archive-worker', 'column', 'UPDATE', ARRAY[
    'history.archive_jobs.generation', 'history.archive_jobs.lease_until',
    'history.archive_jobs.object_bytes', 'history.archive_jobs.object_sha256',
    'history.archive_jobs.reservation_id', 'metadata.tenants.runtime_lock_guard'
  ]),
  ('archive-worker', 'function', 'EXECUTE', ARRAY[
    'history.export_bytes(text)', 'history.export_slots(text)'
  ]),

  -- bootstrap-platform-operator
  ('bootstrap-platform-operator', 'schema', 'USAGE', ARRAY[
    'identity', 'metadata', 'public'
  ]),
  ('bootstrap-platform-operator', 'relation', 'SELECT', ARRAY[
    'identity.external_actor_identities', 'identity.platform_bootstrap'
  ]),
  ('bootstrap-platform-operator', 'relation', 'INSERT', ARRAY[
    'identity.actors', 'identity.external_actor_identities', 'identity.platform_action_grants',
    'identity.platform_bootstrap'
  ]),
  ('bootstrap-platform-operator', 'function', 'EXECUTE', ARRAY[
    'metadata.is_valid_identifier(text)'
  ]),

  -- ingest-tcp
  ('ingest-tcp', 'schema', 'USAGE', ARRAY[
    'analytics', 'history', 'ingestion', 'metadata', 'public'
  ]),
  ('ingest-tcp', 'relation', 'SELECT', ARRAY[
    'analytics.work_controls', 'ingestion.accepted_messages', 'ingestion.decoded_message_results',
    'ingestion.decoded_observations', 'ingestion.protocol_admissions',
    'ingestion.protocol_artifacts', 'ingestion.protocol_route_heads',
    'ingestion.protocol_route_revisions', 'ingestion.replay_sessions', 'ingestion.replay_work',
    'metadata.asset_external_identifiers', 'metadata.protocol_package_releases',
    'metadata.tenants'
  ]),
  ('ingest-tcp', 'relation', 'INSERT', ARRAY[
    'history.semantic_work', 'ingestion.accepted_messages', 'ingestion.decoded_message_results',
    'ingestion.decoded_observations', 'ingestion.replay_sessions', 'ingestion.replay_work'
  ]),
  ('ingest-tcp', 'column', 'UPDATE', ARRAY[
    'ingestion.replay_sessions.current_sequence', 'ingestion.replay_sessions.runtime_lock_guard',
    'ingestion.replay_sessions.state', 'metadata.tenants.runtime_lock_guard',
    'ingestion.replay_work.attempts', 'ingestion.replay_work.generation',
    'ingestion.replay_work.lease_until_ms', 'ingestion.replay_work.next_state',
    'ingestion.replay_work.status'
  ]),
  ('ingest-tcp', 'function', 'EXECUTE', ARRAY[
    'metadata.is_valid_identifier(text)'
  ]),

  -- notification-worker
  ('notification-worker', 'schema', 'USAGE', ARRAY[
    'analytics', 'metadata', 'public'
  ]),
  ('notification-worker', 'relation', 'SELECT', ARRAY[
    'analytics.alert_notification_delivery', 'analytics.alert_notification_intents',
    'analytics.alert_rule_revisions', 'analytics.alert_transitions', 'analytics.work_controls',
    'metadata.tenants'
  ]),
  ('notification-worker', 'relation', 'INSERT', ARRAY[
    'analytics.alert_notification_delivery'
  ]),
  ('notification-worker', 'column', 'UPDATE', ARRAY[
    'analytics.alert_notification_delivery.accepted_version',
    'analytics.alert_notification_delivery.attempts',
    'analytics.alert_notification_delivery.generation',
    'analytics.alert_notification_delivery.last_failure',
    'analytics.alert_notification_delivery.lease_until',
    'analytics.alert_notification_delivery.next_attempt_at',
    'analytics.alert_notification_delivery.resolved_until',
    'analytics.alert_notification_delivery.target_version', 'metadata.tenants.runtime_lock_guard'
  ]),

  -- project-current
  ('project-current', 'schema', 'USAGE', ARRAY[
    'history', 'metadata', 'projection', 'public'
  ]),
  ('project-current', 'relation', 'SELECT', ARRAY[
    'history.asset_property_changes', 'metadata.signal_binding_revisions', 'metadata.tenants',
    'projection.current_properties', 'projection.pending_changes', 'projection.tenant_heads'
  ]),
  ('project-current', 'relation', 'INSERT', ARRAY[
    'projection.current_properties'
  ]),
  ('project-current', 'relation', 'DELETE', ARRAY[
    'projection.pending_changes'
  ]),
  ('project-current', 'column', 'UPDATE', ARRAY[
    'history.asset_property_changes.tenant_id', 'metadata.tenants.runtime_lock_guard',
    'projection.current_properties.binding_id', 'projection.current_properties.binding_revision',
    'projection.current_properties.event_at_ms', 'projection.current_properties.event_time_basis',
    'projection.current_properties.message_id', 'projection.current_properties.output_index',
    'projection.current_properties.protocol_package_id',
    'projection.current_properties.protocol_package_version',
    'projection.tenant_heads.last_served_at', 'projection.tenant_heads.processed_count',
    'projection.tenant_heads.revision'
  ]),
  ('project-current', 'function', 'EXECUTE', ARRAY[
    'projection.project_next()'
  ]),

  -- replay-worker
  ('replay-worker', 'schema', 'USAGE', ARRAY[
    'analytics', 'history', 'ingestion', 'metadata', 'public'
  ]),
  ('replay-worker', 'relation', 'SELECT', ARRAY[
    'analytics.work_controls', 'analytics.work_recovery_audit', 'ingestion.accepted_messages',
    'ingestion.decoded_message_results', 'ingestion.decoded_observations',
    'ingestion.protocol_admissions', 'ingestion.protocol_artifacts', 'ingestion.replay_sessions',
    'ingestion.replay_work', 'metadata.protocol_package_releases', 'metadata.tenants'
  ]),
  ('replay-worker', 'relation', 'INSERT', ARRAY[
    'history.semantic_work', 'ingestion.decoded_message_results',
    'ingestion.decoded_observations'
  ]),
  ('replay-worker', 'column', 'UPDATE', ARRAY[
    'ingestion.replay_sessions.current_sequence', 'ingestion.replay_sessions.state',
    'ingestion.replay_work.attempts', 'ingestion.replay_work.generation',
    'ingestion.replay_work.lease_until_ms', 'ingestion.replay_work.next_state',
    'ingestion.replay_work.status'
  ]),
  ('replay-worker', 'function', 'EXECUTE', ARRAY[
    'analytics.has_work_recovery(text,text,text,bigint,bigint)',
    'metadata.is_valid_identifier(text)'
  ]),

  -- semantic-worker
  ('semantic-worker', 'schema', 'USAGE', ARRAY[
    'analytics', 'history', 'ingestion', 'metadata', 'projection', 'public'
  ]),
  ('semantic-worker', 'relation', 'SELECT', ARRAY[
    'history.asset_property_changes', 'history.semantic_backfill', 'history.semantic_work',
    'ingestion.accepted_messages', 'ingestion.decoded_message_results',
    'ingestion.decoded_observations', 'metadata.asset_type_definitions',
    'metadata.asset_type_properties', 'metadata.assets', 'metadata.property_definitions',
    'metadata.relationship_type_definitions', 'metadata.signal_binding_revisions',
    'metadata.tenants', 'projection.tenant_heads'
  ]),
  ('semantic-worker', 'relation', 'INSERT', ARRAY[
    'history.asset_property_changes', 'history.semantic_work', 'projection.pending_changes',
    'projection.tenant_heads'
  ]),
  ('semantic-worker', 'column', 'UPDATE', ARRAY[
    'history.asset_property_changes.tenant_id', 'history.semantic_backfill.completed',
    'history.semantic_backfill.message_id', 'history.semantic_backfill.output_index',
    'history.semantic_backfill.protocol_package_id',
    'history.semantic_backfill.protocol_package_version', 'history.semantic_backfill.tenant_id',
    'history.semantic_work.binding_id', 'history.semantic_work.binding_revision',
    'history.semantic_work.generation', 'history.semantic_work.lease_until_ms',
    'history.semantic_work.reason', 'history.semantic_work.status',
    'metadata.tenants.runtime_lock_guard'
  ]),
  ('semantic-worker', 'function', 'EXECUTE', ARRAY[
    'analytics.semantic_evidence_id(text,text,text,text,bigint,text,numeric,text)',
    'metadata.is_valid_identifier(text)'
  ]),

  -- serve
  ('serve', 'schema', 'USAGE', ARRAY[
    'analytics', 'history', 'identity', 'ingestion', 'metadata', 'projection', 'public'
  ]),
  ('serve', 'relation', 'SELECT', ARRAY[
    'analytics.alert_acknowledgements', 'analytics.alert_evaluation_receipts',
    'analytics.alert_lifecycles', 'analytics.alert_notification_delivery',
    'analytics.alert_notification_intents', 'analytics.alert_rule_activation_changes',
    'analytics.alert_rule_revisions', 'analytics.alert_rules', 'analytics.alert_transitions',
    'analytics.calculator_activation_changes', 'analytics.calculator_configuration_revisions',
    'analytics.calculator_configurations', 'analytics.calculator_definitions',
    'analytics.calculator_schedules', 'analytics.calculator_work', 'analytics.evaluation_targets',
    'analytics.evaluations', 'analytics.prepared_evaluations', 'analytics.work_controls',
    'analytics.work_recovery_audit', 'history.archive_jobs', 'history.archive_members',
    'history.asset_property_changes', 'history.export_jobs', 'history.lifecycle_policies',
    'history.numeric_summaries', 'history.numeric_summary_series', 'history.restore_jobs',
    'history.semantic_backfill', 'history.semantic_work', 'history.work_reservations',
    'identity.actor_lifecycle_changes', 'identity.actor_provisionings', 'identity.actors',
    'identity.browser_login_attempts', 'identity.browser_sessions',
    'identity.external_actor_identities', 'identity.external_identity_changes',
    'identity.platform_access_changes', 'identity.platform_action_grants',
    'identity.platform_bootstrap', 'identity.tenant_access_changes',
    'identity.tenant_action_grants', 'identity.tenant_lifecycle_changes',
    'identity.tenant_provisionings', 'ingestion.accepted_messages',
    'ingestion.decoded_message_results', 'ingestion.decoded_observations',
    'ingestion.protocol_admissions', 'ingestion.protocol_artifacts',
    'ingestion.protocol_route_heads', 'ingestion.protocol_route_revisions',
    'ingestion.replay_sessions', 'ingestion.replay_work', 'metadata.asset_external_identifiers',
    'metadata.asset_relationship_revisions', 'metadata.asset_relationships',
    'metadata.asset_type_definitions', 'metadata.asset_type_properties', 'metadata.assets',
    'metadata.communication_devices', 'metadata.device_endpoints',
    'metadata.property_definitions', 'metadata.protocol_package_releases',
    'metadata.registration_records', 'metadata.relationship_revision_records',
    'metadata.relationship_type_definitions', 'metadata.signal_binding_revision_records',
    'metadata.signal_binding_revisions', 'metadata.signal_bindings', 'metadata.tenants',
    'projection.current_properties', 'projection.pending_changes', 'projection.tenant_heads'
  ]),
  ('serve', 'relation', 'INSERT', ARRAY[
    'analytics.alert_acknowledgements', 'analytics.alert_lifecycles',
    'analytics.alert_rule_activation_changes', 'analytics.alert_rule_revisions',
    'analytics.alert_rules', 'analytics.calculator_activation_changes',
    'analytics.calculator_configuration_revisions', 'analytics.calculator_configurations',
    'analytics.calculator_schedules', 'analytics.work_controls', 'analytics.work_recovery_audit',
    'history.export_jobs', 'history.restore_jobs', 'history.work_reservations',
    'identity.actor_lifecycle_changes', 'identity.actor_provisionings', 'identity.actors',
    'identity.browser_login_attempts', 'identity.browser_sessions',
    'identity.external_actor_identities', 'identity.external_identity_changes',
    'identity.platform_access_changes', 'identity.platform_action_grants',
    'identity.tenant_access_changes', 'identity.tenant_action_grants',
    'identity.tenant_lifecycle_changes', 'identity.tenant_provisionings',
    'ingestion.protocol_admissions', 'ingestion.protocol_artifacts',
    'ingestion.protocol_route_heads', 'ingestion.protocol_route_revisions',
    'metadata.asset_external_identifiers', 'metadata.asset_relationship_revisions',
    'metadata.asset_relationships', 'metadata.asset_type_definitions',
    'metadata.asset_type_properties', 'metadata.assets', 'metadata.communication_devices',
    'metadata.device_endpoints', 'metadata.property_definitions',
    'metadata.protocol_package_releases', 'metadata.registration_records',
    'metadata.relationship_revision_records', 'metadata.relationship_type_definitions',
    'metadata.signal_binding_revision_records', 'metadata.signal_binding_revisions',
    'metadata.signal_bindings', 'metadata.tenants'
  ]),
  ('serve', 'relation', 'DELETE', ARRAY[
    'history.work_reservations', 'identity.browser_login_attempts', 'identity.browser_sessions',
    'identity.external_actor_identities', 'identity.platform_action_grants',
    'identity.tenant_action_grants'
  ]),
  ('serve', 'column', 'UPDATE', ARRAY[
    'analytics.alert_lifecycles.tenant_id', 'analytics.alert_notification_delivery.attempts',
    'analytics.alert_notification_delivery.generation',
    'analytics.alert_notification_delivery.lease_until',
    'analytics.alert_notification_delivery.next_attempt_at',
    'analytics.alert_rules.active_revision', 'analytics.alert_rules.generation',
    'analytics.alert_rules.latest_revision',
    'analytics.calculator_configurations.active_revision',
    'analytics.calculator_configurations.generation',
    'analytics.calculator_configurations.latest_revision', 'analytics.calculator_work.attempts',
    'analytics.calculator_work.generation', 'analytics.calculator_work.lease_until_ms',
    'analytics.calculator_work.status', 'analytics.work_controls.generation',
    'analytics.work_controls.paused', 'history.export_jobs.attempt',
    'history.export_jobs.lease_until', 'history.export_jobs.payload',
    'history.export_jobs.status', 'history.restore_jobs.attempt',
    'history.restore_jobs.expires_at', 'history.restore_jobs.lease_until',
    'history.restore_jobs.payload', 'history.restore_jobs.request_generation',
    'history.restore_jobs.reservation_id', 'history.restore_jobs.status',
    'history.work_reservations.runtime_lock_guard', 'identity.actors.is_active',
    'identity.platform_action_grants.actor_id', 'identity.platform_bootstrap.actor_id',
    'identity.tenant_action_grants.actor_id', 'ingestion.protocol_route_heads.revision',
    'ingestion.replay_sessions.runtime_lock_guard', 'ingestion.replay_work.attempts',
    'ingestion.replay_work.generation', 'ingestion.replay_work.lease_until_ms',
    'ingestion.replay_work.status', 'metadata.asset_relationships.latest_revision',
    'metadata.signal_bindings.latest_revision', 'metadata.tenants.is_active'
  ]),
  ('serve', 'function', 'EXECUTE', ARRAY[
    'analytics.acknowledge_alert(text,text,bigint,bigint,text)',
    'analytics.change_alert_rule_activation(text,text,bigint,bigint,text)',
    'analytics.change_configuration_activation(text,text,bigint,bigint,text)',
    'analytics.create_alert_rule_revision(text,text,bigint,text,jsonb)',
    'analytics.create_configuration_revision(text,text,bigint,text,jsonb)',
    'analytics.has_work_recovery(text,text,text,bigint,bigint)',
    'analytics.lock_alert_rule_authority(text,text)',
    'analytics.lock_configuration_authority(text,text)',
    'analytics.recover_work(text,text,text,text,text,jsonb,bigint,bytea)',
    'analytics.semantic_evidence_id(text,text,text,text,bigint,text,numeric,text)',
    'history.export_admitted(text)', 'history.export_bytes(text)', 'history.export_slots(text)',
    'metadata.is_valid_identifier(text)'
  ])
) AS rule(workload, kind, privilege, objects);

CREATE TEMP VIEW known_roles AS
SELECT DISTINCT workload, 'fleetiq_' || replace(workload, '-', '_') AS name FROM pg_temp.policy_objects;

CREATE TEMP VIEW selected_roles AS
SELECT * FROM pg_temp.known_roles
WHERE workload = 'bootstrap-platform-operator'
   OR EXISTS (
     SELECT FROM jsonb_array_elements_text(current_setting('fleetiq.workloads')::jsonb) selected(command)
     WHERE split_part(selected.command, ' ', 1) = workload
   );

DO $$ BEGIN
  IF current_setting('fleetiq.legacy') IN (session_user, 'postgres', 'cnpg_metrics_exporter')
      OR EXISTS (
        SELECT FROM pg_temp.known_roles WHERE name IN (session_user, current_setting('fleetiq.legacy'))
      )
      OR EXISTS (
        SELECT FROM jsonb_array_elements_text(current_setting('fleetiq.workloads')::jsonb) w(name)
        WHERE w.name = 'bootstrap-platform-operator'
          OR NOT EXISTS (
            SELECT FROM pg_temp.known_roles r
            WHERE r.workload = split_part(w.name, ' ', 1)
              AND w.name = CASE WHEN r.workload = 'serve' THEN 'serve --check-schema' ELSE r.workload END
          )
      )
      OR (SELECT count(*) FROM pg_temp.selected_roles) < 2
  THEN RAISE EXCEPTION 'Invalid workload selection or overlapping database identities'; END IF;
END $$;

CREATE FUNCTION pg_temp.check_scoped_roles() RETURNS void
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$ BEGIN
  IF EXISTS (
    SELECT FROM pg_temp.selected_roles s LEFT JOIN pg_roles r ON r.rolname = s.name
    WHERE r.oid IS NULL OR r.rolsuper OR r.rolinherit OR r.rolcreaterole OR r.rolcreatedb
      OR r.rolreplication OR r.rolbypassrls
      OR EXISTS (SELECT FROM pg_auth_members m WHERE r.oid IN (m.member, m.roleid))
      OR EXISTS (
        SELECT FROM pg_shdepend d WHERE d.refclassid = 'pg_authid'::regclass
          AND d.deptype = 'o' AND d.refobjid = r.oid
      )
  ) THEN RAISE EXCEPTION 'Scoped identities, memberships or ownership differ'; END IF;
END $$;

CREATE TEMP VIEW desired_acl(role_name, kind, object, privilege, grantable) AS
SELECT s.name, o.kind, o.object, o.privilege, false
FROM pg_temp.selected_roles s JOIN pg_temp.policy_objects o USING (workload)
UNION ALL
SELECT name, 'database', current_database()::text, 'CONNECT', false FROM pg_temp.selected_roles
UNION ALL
SELECT name, 'relation', 'public._sqlx_migrations', 'SELECT', false FROM pg_temp.selected_roles;

CREATE TEMP VIEW product_schemas AS
SELECT DISTINCT object AS name FROM pg_temp.policy_objects WHERE kind = 'schema';
