-- Owned synthetic product tenant. Normal writers process both records.
BEGIN;
\if :later
\else
CREATE SCHEMA qualification_clock;
CREATE FUNCTION qualification_clock.clock_timestamp() RETURNS timestamptz
LANGUAGE sql VOLATILE AS 'SELECT pg_catalog.clock_timestamp() - interval ''8 days''';
INSERT INTO metadata.tenants (tenant_id) VALUES ('tenant-lifecycle');
INSERT INTO identity.tenant_action_grants (tenant_id,actor_id,action)
SELECT 'tenant-lifecycle','operator-a',action FROM unnest(ARRAY['metadata.read','telemetry.read','operations.manage','access.manage']) AS action;
INSERT INTO history.lifecycle_policies (tenant_id,revision,actor_id,hot_days,archive_days,max_jobs,max_bytes)
VALUES ('tenant-lifecycle',1,'operator-a',7,30,3,8388608);
INSERT INTO metadata.property_definitions (tenant_id,property_id,version,display_name,value_kind,canonical_unit)
VALUES ('tenant-lifecycle','electrical.voltage',1,'Voltage','integer','volt');
INSERT INTO metadata.asset_type_definitions (tenant_id,type_id,version,display_name,property_count)
VALUES ('tenant-lifecycle','equipment',1,'Equipment',1);
INSERT INTO metadata.asset_type_properties (tenant_id,type_id,type_version,property_id,property_version,property_ordinal)
VALUES ('tenant-lifecycle','equipment',1,'electrical.voltage',1,1);
INSERT INTO metadata.assets (tenant_id,asset_id,type_id,type_version,display_name)
VALUES ('tenant-lifecycle','device','equipment',1,'Synthetic device'), ('tenant-lifecycle','asset','equipment',1,'Synthetic asset');
INSERT INTO metadata.communication_devices (tenant_id,device_asset_id) VALUES ('tenant-lifecycle','device');
INSERT INTO metadata.device_endpoints (tenant_id,device_asset_id,endpoint_id,endpoint_kind_id,display_name,endpoint_ordinal)
VALUES ('tenant-lifecycle','device','main','can','Synthetic CAN',1);
INSERT INTO metadata.signal_bindings (tenant_id,binding_id,latest_revision) VALUES ('tenant-lifecycle','voltage',1);
INSERT INTO metadata.signal_binding_revisions (tenant_id,binding_id,revision,recorded_at_ms,source_device_asset_id,source_endpoint_id,source_signal_id,target_asset_id,target_property_id,target_property_version,effective_start_ms)
VALUES ('tenant-lifecycle','voltage',1,100,'device','main','voltage','asset','electrical.voltage',1,0);
\endif
INSERT INTO ingestion.accepted_messages (tenant_id,message_id,device_asset_id,protocol_package_id,protocol_package_version,received_at_ms,payload)
VALUES ('tenant-lifecycle',:'message','device','vendor.fixture','1',:event_ms,'synthetic'::bytea);
INSERT INTO ingestion.decoded_message_results (tenant_id,message_id,protocol_package_id,protocol_package_version,observation_count)
VALUES ('tenant-lifecycle',:'message','vendor.fixture','1',1);
INSERT INTO ingestion.decoded_observations (tenant_id,message_id,protocol_package_id,protocol_package_version,output_index,endpoint_id,signal_id,device_recorded_at_ms,value_kind,value_integer,source_unit,quality)
VALUES ('tenant-lifecycle',:'message','vendor.fixture','1',0,'main','voltage',:event_ms,'integer',:value,'volt','good');
COMMIT;
