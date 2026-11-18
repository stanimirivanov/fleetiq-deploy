import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chmodSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { readCheckpoint } from '../simulator-recovery.mjs';

test('checkpoint evidence rejects unsafe metadata and modified bodies before accepting counters', () => {
  const path = mkdtempSync(resolve(tmpdir(), 'recovery-checkpoint-'));
  const file = resolve(path, 'checkpoint.json');
  const body = JSON.stringify({
    captured: 3,
    acknowledged: 0,
    records: [{}, {}, {}],
    pending: '0000',
  });
  const write = (checksum = createHash('sha256').update(body).digest('hex')) =>
    writeFileSync(file, JSON.stringify({ body, checksum }), { mode: 0o600 });
  try {
    write();
    assert.equal(readCheckpoint(path).captured, 3);
    write('0'.repeat(64));
    assert.throws(() => readCheckpoint(path));
    write();
    chmodSync(file, 0o644);
    assert.throws(() => readCheckpoint(path));
    chmodSync(file, 0o600);
    rmSync(file);
    writeFileSync(resolve(path, 'other'), '{}', { mode: 0o600 });
    symlinkSync('other', file);
    assert.throws(() => readCheckpoint(path));
  } finally {
    rmSync(path, { recursive: true, force: true });
  }
});
