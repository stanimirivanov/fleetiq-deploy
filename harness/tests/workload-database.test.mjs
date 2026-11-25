import assert from 'node:assert/strict';
import test from 'node:test';
import { databaseIdentities } from '../../tools/manifests/workload-database.mjs';

test('a three-workload installation requires only its selected credentials', () => {
  const identities = databaseIdentities([
    'serve --check-schema',
    'ingest-tcp',
    'replay-worker',
  ]);
  assert.deepEqual(
    identities.map(({ name }) => name),
    ['fleetiq_serve', 'fleetiq_ingest_tcp', 'fleetiq_replay_worker'],
  );
  assert.equal(new Set(identities.map(({ urlSecret }) => urlSecret)).size, 3);
  assert.throws(() => databaseIdentities(['migrate']));
});

test('rejects duplicate and installation-only workload selections', () => {
  assert.throws(() => databaseIdentities(['ingest-tcp', 'ingest-tcp']), /Duplicate/);
  assert.throws(() =>
    databaseIdentities(['bootstrap-platform-operator --check-schema']),
  );
  assert.throws(() => databaseIdentities([]));
});
