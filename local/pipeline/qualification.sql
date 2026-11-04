-- Disposable infrastructure qualification only. The caller supplies the
-- synthetic component bytes from the same locked backend image.
BEGIN;
INSERT INTO metadata.tenants (tenant_id) VALUES ('pipeline-qualification');
INSERT INTO identity.actors (actor_id) VALUES ('pipeline-operator');
INSERT INTO metadata.asset_type_definitions
  (tenant_id,type_id,version,display_name,property_count)
VALUES ('pipeline-qualification','equipment',1,'Equipment',0);
INSERT INTO metadata.assets
  (tenant_id,asset_id,type_id,type_version,display_name)
VALUES ('pipeline-qualification','device','equipment',1,'Device');
INSERT INTO metadata.communication_devices (tenant_id,device_asset_id)
VALUES ('pipeline-qualification','device');
INSERT INTO metadata.asset_external_identifiers
  (tenant_id,asset_id,identifier_kind,authority,identifier_value)
VALUES ('pipeline-qualification','device','imei',NULL,'350000000000001');
INSERT INTO metadata.protocol_package_releases
  (tenant_id,protocol_package_id,protocol_package_version,artifact_sha256,artifact_size_bytes)
SELECT 'pipeline-qualification','vendor.teltonika','qualification-1',sha256(bytes),octet_length(bytes)
FROM (SELECT decode(:'artifact','base64') AS bytes) AS component;
INSERT INTO ingestion.protocol_artifacts (tenant_id,artifact_sha256,artifact_bytes)
SELECT 'pipeline-qualification',sha256(bytes),bytes
FROM (SELECT decode(:'artifact','base64') AS bytes) AS component;
INSERT INTO ingestion.protocol_admissions
  (tenant_id,protocol_package_id,protocol_package_version,wit_world,policy_version,actor_id,admitted_at_ms,artifact_sha256)
SELECT tenant_id,protocol_package_id,protocol_package_version,'identity-v1',1,'pipeline-operator',1,artifact_sha256
FROM metadata.protocol_package_releases WHERE tenant_id='pipeline-qualification';
INSERT INTO ingestion.protocol_route_heads (tenant_id,device_asset_id,channel_id,revision)
VALUES ('pipeline-qualification','device','qualification-tcp',0);
UPDATE ingestion.protocol_route_heads SET revision=1 WHERE tenant_id='pipeline-qualification';
INSERT INTO ingestion.protocol_route_revisions
  (tenant_id,device_asset_id,channel_id,revision,protocol_package_id,protocol_package_version,wit_world,policy_version,actor_id,recorded_at_ms)
VALUES ('pipeline-qualification','device','qualification-tcp',1,'vendor.teltonika','qualification-1','identity-v1',1,'pipeline-operator',1);

-- Keep the record durably queued after its transport ACK. The handshake can
-- still complete, so replay must recover the actual record's pinned pre-state.
CREATE FUNCTION public.reject_qualification_record() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.tenant_id='pipeline-qualification' AND EXISTS (
      SELECT 1 FROM ingestion.accepted_messages
      WHERE tenant_id=NEW.tenant_id AND message_id=NEW.message_id AND octet_length(payload)=45
    ) THEN RAISE EXCEPTION 'synthetic completion outage'; END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER qualification_completion_outage BEFORE INSERT ON ingestion.decoded_message_results
FOR EACH ROW EXECUTE FUNCTION public.reject_qualification_record();
COMMIT;
