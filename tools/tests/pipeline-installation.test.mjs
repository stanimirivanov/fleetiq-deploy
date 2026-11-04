import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parse } from 'yaml';
import { pipelineInstallation } from '../pipeline.mjs';

test('normal ingestion and replay are packaged as an explicit overlay', () => {
  const read = (path) =>
    parse(readFileSync(new URL(path, import.meta.url), 'utf8'), { merge: true });
  const base = read('../../local/compose.yaml');
  assert.equal(base.services['tcp-ingestion'], undefined);
  assert.equal(base.services['replay-worker'], undefined);
  const { services } = read('../../local/pipeline/compose.yaml');
  assert.deepEqual(Object.keys(services).sort(), ['replay-worker', 'tcp-ingestion']);
  assert.deepEqual(services['tcp-ingestion'].ports, [
    `127.0.0.1:\${FLEETIQ_TCP_PORT:?Missing loopback port}:55027`,
  ]);
  assert.equal(services['replay-worker'].ports, undefined);
  assert.deepEqual(services['tcp-ingestion'].networks, ['database', 'device-ingress']);
  assert.deepEqual(services['replay-worker'].networks, ['database']);
  for (const service of Object.values(services)) {
    assert.deepEqual(service.secrets, ['database_password']);
    assert.equal(service.depends_on.backend.condition, 'service_healthy');
  }
});

test('invalid pipeline inputs are rejected before Compose can run', () => {
  const settings = {
    identityPolicy: 'registered-identifiers',
    port: 55027,
    tenantId: 'tenant-a',
    channelId: 'channel-a',
    packageId: 'vendor.teltonika',
    packageVersion: '1',
  };
  for (const invalid of [
    { port: 0 },
    { port: 65536 },
    { port: '55027' },
    { channelId: '' },
    { packageVersion: '1\n' },
    { identityPolicy: 'automatic' },
    { host: '0.0.0.0' },
  ]) {
    assert.throws(
      () =>
        pipelineInstallation(
          { compose: () => assert.fail('Compose was invoked') },
          { ...settings, ...invalid },
        ),
      /Invalid pipeline configuration/u,
    );
  }
});
