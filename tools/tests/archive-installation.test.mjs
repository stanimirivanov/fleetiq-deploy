import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { parse } from 'yaml';
import { archiveInputs } from '../archive.mjs';

const settings = {
  tenantId: 'tenant-a',
  endpoint: 'https://archive.example/',
  bucket: 'archive-evidence',
  region: 'us-east-1',
};

test('archive packaging is explicit and mounts private storage inputs', () => {
  const read = (path) => parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
  assert.equal(read('../../local/compose.yaml').services['archive-worker'], undefined);
  const { services } = read('../../local/archive/compose.yaml');
  const worker = services['archive-worker'];
  assert.deepEqual(worker.command, ['archive-worker']);
  assert.deepEqual(worker.networks, ['database', 'archive-egress']);
  assert.equal(worker.depends_on.backend.condition, 'service_healthy');
  assert.equal(worker.ports, undefined);
  assert.deepEqual(worker.secrets, [
    'database_password',
    'archive_access_key',
    'archive_secret_key',
  ]);
  assert.deepEqual(services.backend.secrets, [
    'archive_access_key',
    'archive_secret_key',
  ]);
});

test('archive inputs reject unsafe settings and linked or missing secret files', () => {
  const path = mkdtempSync(join(tmpdir(), 'archive-inputs-'));
  try {
    const key = join(path, 'archive-access-key');
    const secret = join(path, 'archive-secret-key');
    assert.throws(() => archiveInputs(path, settings), /private archive secret/u);
    writeFileSync(key, 'synthetic-access', { mode: 0o644 });
    symlinkSync(key, secret);
    assert.throws(() => archiveInputs(path, settings), /private archive secret/u);
    rmSync(secret);
    writeFileSync(secret, 'synthetic-secret', { mode: 0o644 });
    for (const invalid of [
      { endpoint: 'http://archive.example/' },
      { endpoint: 'https://identity:password@archive.example/' },
      { endpoint: 'https://archive.example/?query=value' },
      { endpoint: 'https://archive.example/?' },
      { endpoint: 'https://archive.example/#' },
      { bucket: 'Invalid_Bucket' },
      { tenantId: '' },
      { reclaim: true },
    ])
      assert.throws(
        () => archiveInputs(path, { ...settings, ...invalid }),
        /Invalid archive/u,
      );
    const result = archiveInputs(path, settings);
    assert.deepEqual(
      Object.values(result).sort(),
      [...Object.values(settings), key, secret].sort(),
    );
  } finally {
    rmSync(path, { recursive: true });
  }
});
