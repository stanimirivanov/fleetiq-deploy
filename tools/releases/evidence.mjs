import assert from 'node:assert/strict';
import { basename } from 'node:path';
import yauzl from 'yauzl';
import { digest } from './contracts.mjs';

/**
 * Inspect bounded JSON in memory without extracting producer-controlled paths.
 * UX retains qualification and publication directories in one archive. Select only
 * the exact trusted run/attempt directory; never fall back to another directory.
 * Every member still undergoes path, type and expansion checks before selection.
 */
export async function reportArchive(bytes, { directory } = {}) {
  assert(
    directory === undefined || /^[1-9][0-9]*-[1-9][0-9]*$/u.test(directory),
    'Invalid publication report directory',
  );
  assert(bytes.length <= 128 * 1024 * 1024, 'Publication archive exceeds bound');
  const zip = await new Promise((resolve, reject) =>
    yauzl.fromBuffer(
      bytes,
      { lazyEntries: true, strictFileNames: true },
      (error, result) => (error ? reject(error) : resolve(result)),
    ),
  );
  const files = new Map();
  let entries = 0;
  let total = 0;
  try {
    await new Promise((resolve, reject) => {
      zip.on('error', reject);
      zip.on('end', resolve);
      zip.on('entry', (entry) => {
        try {
          assert(
            ++entries <= 128 &&
              !entry.fileName.startsWith('/') &&
              !entry.fileName.split('/').includes('..') &&
              !entry.fileName.includes('\\'),
            'Unsafe publication evidence member',
          );
          assert.notEqual(
            (entry.externalFileAttributes >>> 16) & 0o170000,
            0o120000,
            'Linked publication evidence refused',
          );
          if (entry.fileName.endsWith('/')) return zip.readEntry();
          assert(
            entry.fileName.endsWith('.json') &&
              entry.uncompressedSize < 32 * 1024 * 1024,
            'Unexpected/oversize publication evidence',
          );
          total += entry.uncompressedSize;
          assert(total <= 256 * 1024 * 1024, 'Expanded evidence exceeds bound');
          if (directory !== undefined && !entry.fileName.startsWith(`${directory}/`))
            return zip.readEntry();
          const name = basename(entry.fileName);
          if (directory !== undefined)
            assert.equal(
              entry.fileName,
              `${directory}/${name}`,
              'Nested publication report refused',
            );
          assert(!files.has(name), 'Ambiguous duplicate evidence report');
          zip.openReadStream(entry, (error, stream) => {
            if (error) return reject(error);
            const chunks = [];
            stream.on('error', reject);
            stream.on('data', (chunk) => chunks.push(chunk));
            stream.on('end', () => {
              files.set(name, Buffer.concat(chunks));
              zip.readEntry();
            });
          });
        } catch (error) {
          reject(error);
        }
      });
      zip.readEntry();
    });
    assert(
      directory === undefined || files.size > 0,
      'Missing exact publication report directory',
    );
    return files;
  } finally {
    zip.close();
  }
}

/** Publisher identity is checked against independently obtained GitHub run metadata. */
export function publicationEvidence(role, selected, run, reports) {
  const repository = {
    backend: 'stanimirivanov/fleetiq-platform',
    ux: 'stanimirivanov/fleetiq-ui',
    package: 'stanimirivanov/fleetiq-deploy',
  }[role];
  assert(
    repository && selected.source.repository === repository,
    'Wrong producer repository',
  );
  const expectedImage = {
    backend: 'ghcr.io/stanimirivanov/fleetiq-platform',
    ux: 'ghcr.io/stanimirivanov/fleetiq-ui',
    package: 'ghcr.io/stanimirivanov/fleetiq-deploy/fleetiq-release',
  }[role];
  assert(
    selected.reference.startsWith(`${expectedImage}@sha256:`),
    'Wrong producer image/package identity',
  );
  assert.equal(
    run.repository?.full_name,
    repository,
    'Wrong publication run repository',
  );
  assert.equal(run.id, selected.publication.run, 'Wrong publication run');
  assert.equal(
    run.run_attempt,
    selected.publication.attempt,
    'Wrong publication attempt',
  );
  assert.equal(
    run.path,
    role === 'package'
      ? '.github/workflows/publish-release.yml'
      : '.github/workflows/publish-image.yml',
    'Untrusted publisher workflow',
  );
  assert.equal(
    run.event,
    'workflow_dispatch',
    'Publication was not manually authorized',
  );
  assert.equal(run.head_branch, 'main', 'Publication was not from main');
  assert.equal(run.head_sha, selected.source.revision, 'Publication source drift');
  assert(
    run.status === 'completed' && run.conclusion === 'success',
    'Publication did not finish successfully',
  );
  const bytes = reports.get('publication.json');
  assert(
    bytes && digest(bytes) === selected.publication.recordDigest,
    'Publication receipt bytes differ',
  );
  const record = JSON.parse(bytes);
  assert.equal(
    record.format,
    role === 'package'
      ? 'fleetiq-package-publication.v1'
      : 'fleetiq-image-publication.v1',
    'Wrong publication receipt format',
  );
  assert.equal(record.outcome, 'published', 'Artifact not published');
  assert.equal(
    record.image,
    selected.reference,
    'Publication digest does not match selection',
  );
  assert.equal(
    record.source?.revision,
    selected.source.revision,
    'Published source mismatch',
  );
  assert.equal(record.source?.dirty, false, 'Producer source was dirty');
  assert.equal(
    record.authorization?.repository,
    repository,
    'Untrusted authorization repository',
  );
  assert.equal(
    record.authorization?.revision,
    run.head_sha,
    'Authorization source drift',
  );
  assert.equal(
    String(record.authorization?.run),
    String(run.id),
    'Authorization run drift',
  );
  assert.equal(
    String(record.authorization?.attempt),
    String(run.run_attempt),
    'Authorization attempt drift',
  );
  assert.equal(
    record.authorization?.actor,
    run.actor?.login,
    'Publisher identity drift',
  );
  assert.equal(
    record.authorization?.triggeringActor,
    run.triggering_actor?.login,
    'Rerun identity drift',
  );
  const qualification = reports.get('qualification.json');
  assert(
    qualification && digest(qualification) === record.qualification,
    'Missing/changed producer qualification',
  );
  assert.equal(
    JSON.parse(qualification).outcome,
    'passed',
    'Producer qualification incomplete',
  );
  return record;
}
