import assert from 'node:assert/strict';
import { avlFrame } from './device.mjs';

// Four single sends, three four-frame windows and one replay. Each frame
// uses a new session and contributes an identification and AVL envelope.
// The no-IO AVL record produces nine observations and two position interpretations.
const maxFrames = 17;
const avlBytes = avlFrame(0, 0, 0).length;
const identificationBytes = 2 + 15;
const rowBytes = 4096;
const limits = new Map([
  [
    'accepted_messages',
    [
      'wire_payload_octets',
      maxFrames * 2,
      maxFrames * (identificationBytes + avlBytes),
    ],
  ],
  [
    'decoded_observations',
    ['postgres_row_json_utf8_v1', maxFrames * 9, maxFrames * 9 * rowBytes],
  ],
  [
    'property_interpretations',
    ['postgres_row_json_utf8_v1', maxFrames * 2, maxFrames * 2 * rowBytes],
  ],
]);

function decimal(value) {
  assert(typeof value === 'string' && /^(0|[1-9][0-9]{0,18})$/.test(value));
  return BigInt(value);
}

export function verifyLogicalStorageUsage(snapshot) {
  assert.equal(snapshot.coverage, 'supported_classes_only');
  for (const field of ['archive', 'exports', 'physical_allocation'])
    assert.equal(snapshot[field], 'not_measured');
  assert(decimal(snapshot.observed_at_ms) > 0n);
  assert.equal(snapshot.classes.length, limits.size);
  const seen = new Set();
  for (const { kind, method, records, bytes } of snapshot.classes) {
    assert(limits.has(kind) && !seen.has(kind), 'Unexpected storage usage class');
    seen.add(kind);
    const [expectedMethod, maxRecords, maxBytes] = limits.get(kind);
    assert.equal(method, expectedMethod);
    const count = decimal(records);
    const size = decimal(bytes);
    assert(count > 0n && count <= BigInt(maxRecords), 'Storage record bound failed');
    assert(size > 0n && size <= BigInt(maxBytes), 'Storage byte bound failed');
  }
}
