import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyLogicalStorageUsage } from '../../local/qualification/product/lifecycle-cost.mjs';

function usage() {
  return {
    observed_at_ms: '1700000000000',
    coverage: 'supported_classes_only',
    archive: 'not_measured',
    exports: 'not_measured',
    physical_allocation: 'not_measured',
    classes: [
      {
        kind: 'accepted_messages',
        method: 'wire_payload_octets',
        records: '34',
        bytes: '1054',
      },
      {
        kind: 'decoded_observations',
        method: 'postgres_row_json_utf8_v1',
        records: '32',
        bytes: '2048',
      },
      {
        kind: 'property_interpretations',
        method: 'postgres_row_json_utf8_v1',
        records: '32',
        bytes: '4096',
      },
    ],
  };
}

test('accepts bounded logical usage for the installed workload', () => {
  assert.doesNotThrow(() => verifyLogicalStorageUsage(usage()));
});

test('requires distinct classes with the pinned methods and explicit coverage', () => {
  const duplicate = usage();
  duplicate.classes[1] = duplicate.classes[0];
  assert.throws(() => verifyLogicalStorageUsage(duplicate));
  const method = usage();
  method.classes[0].method = 'physical_bytes';
  assert.throws(() => verifyLogicalStorageUsage(method));
  assert.throws(() => verifyLogicalStorageUsage({ ...usage(), archive: 'measured' }));
});

test('rejects empty, noncanonical and over-budget measurements', () => {
  for (const [field, value] of [
    ['records', '0'],
    ['records', '35'],
    ['bytes', '1055'],
    ['bytes', '0720'],
    ['bytes', 720],
  ]) {
    const snapshot = usage();
    snapshot.classes[0][field] = value;
    assert.throws(() => verifyLogicalStorageUsage(snapshot));
  }
});
