import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import {
  readPhase,
  waitPhase,
  writePhase,
} from '../../local/qualification/product/channel.mjs';
import { productInputs } from './compose.mjs';

const tenant = 'tenant-lifecycle';
const limit = 2 * 1024 * 1024;
const where = "WHERE tenant_id='tenant-lifecycle'";

async function until(control, condition, label) {
  const deadline = Date.now() + 90000;
  do {
    assert(
      !readPhase(control, 'failed'),
      'Browser failed during lifecycle qualification',
    );
    if (condition()) return;
    await delay(500);
  } while (Date.now() < deadline);
  throw new Error(`Lifecycle fixture timed out waiting for ${label}`);
}

/** Controls only disposable provider faults and trusted operator inputs. */
export async function qualifyLifecycle({ compose, control, owned, stage }) {
  const psql = [
    'exec',
    '-T',
    'postgres',
    'psql',
    '-U',
    'fleetiq',
    '-d',
    'fleetiq',
    '-v',
    'ON_ERROR_STOP=1',
  ];
  const sql = (query) => compose([...psql, '-Atc', query], { timeout: 10000 });
  const seed = (later) =>
    compose(
      [
        ...psql,
        '-q',
        '-v',
        `later=${later}`,
        '-v',
        `message=${later ? 'new' : 'old'}`,
        '-v',
        `event_ms=${later ? 2000 : 1000}`,
        '-v',
        `value=${later ? 222 : 111}`,
      ],
      {
        input: readFileSync(
          new URL('../../local/qualification/product/lifecycle.sql', import.meta.url),
          'utf8',
        ),
      },
    );
  const s3 = (args, options) =>
    compose(['run', '--rm', '--no-deps', '-T', 'archive-client', ...args], {
      timeout: 18000,
      ...options,
    });
  const reclaim = () =>
    compose(
      [
        'run',
        '--rm',
        '--no-deps',
        '-T',
        '-e',
        `FLEETIQ_RECLAIM_TENANT_ID=${tenant}`,
        '-e',
        'FLEETIQ_RECLAIM_MANIFEST_ID=1',
        '-e',
        'FLEETIQ_RECLAIM_POLICY_REVISION=1',
        'archive-worker',
        'reclaim-once',
      ],
      { timeout: 40000 },
    );
  const state = () =>
    sql(
      `SELECT count(*) FILTER (WHERE event_at_ms IS NULL) || ':' || (SELECT count(*) FROM history.retention_receipts ${where}) FROM history.asset_property_changes ${where}`,
    );
  let paused = false;
  const fault = (pause) => {
    owned();
    compose([pause ? 'pause' : 'unpause', 'archive-storage']);
    paused = pause;
  };
  try {
    stage('lifecycle-prepare');
    owned();
    compose(['up', '-d', '--no-deps', 'archive-storage']);
    await until(
      control,
      () => {
        try {
          s3(['bucket']);
          return true;
        } catch {
          return false;
        }
      },
      'signed bucket creation',
    );
    seed(false);
    await until(
      control,
      () =>
        sql(`SELECT message_id FROM projection.current_properties ${where}`) === 'old',
      'original projection',
    );
    writePhase(control, 'lifecycle-seeded');
    await waitPhase(control, 'lifecycle-baseline');

    stage('lifecycle-interrupt-publication');
    fault(true);
    compose(['up', '-d', '--no-deps', 'archive-worker']);
    await until(
      control,
      () =>
        sql(
          `SELECT r.reserved_bytes FROM history.archive_jobs j JOIN history.work_reservations r USING (tenant_id,reservation_id) WHERE j.tenant_id='${tenant}' AND j.job_id=1 AND j.generation=1 AND j.object_sha256 IS NULL`,
        ) === String(limit),
      'unpublished claim with a 2 MiB reservation',
    );
    owned();
    compose(['stop', 'archive-worker']);
    assert.equal(
      sql(
        `SELECT count(*) FROM history.archive_jobs ${where} AND object_sha256 IS NOT NULL`,
      ),
      '0',
    );
    assert.equal(state(), '0:0');
    fault(false);
    compose(['start', 'archive-worker']);
    await until(
      control,
      () =>
        sql(
          `SELECT generation FROM history.archive_jobs ${where} AND job_id=1 AND object_sha256 IS NOT NULL`,
        ) === '2',
      'publication of the original selection',
    );
    compose(['stop', 'archive-worker']);
    const digest = sql(
      `SELECT encode(object_sha256,'hex') FROM history.archive_jobs ${where} AND job_id=1`,
    );
    assert.match(digest, /^[a-f0-9]{64}$/u);
    const key = `fleetiq/archive/v1/${Buffer.from(tenant).toString('hex')}/${digest}.parquet`;
    const bytes = Buffer.from(s3(['read', key]), 'base64');
    assert(bytes.length > 0 && bytes.length <= limit);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), digest);
    assert.equal(
      sql(`SELECT count(*) FROM history.archive_members ${where} AND job_id=1`),
      '1',
    );

    stage('lifecycle-verify-before-reclaim');
    seed(true);
    await until(
      control,
      () =>
        sql(`SELECT message_id FROM projection.current_properties ${where}`) === 'new',
      'superseding projection',
    );
    sql(
      "INSERT INTO history.retention_controls (tenant_id, policy_revision, actor_id) VALUES ('tenant-lifecycle', 1, 'operator-a')",
    );
    const mustReject = () => {
      assert.throws(reclaim, { exitCode: 1 });
      assert.equal(state(), '0:0');
    };
    fault(true);
    mustReject();
    fault(false);
    s3(['write', key], { input: Buffer.alloc(bytes.length).toString('base64') });
    mustReject();
    s3(['write', key], { input: bytes.toString('base64') });
    assert.equal(reclaim(), 'reclaimed 1');
    assert.equal(state(), '1:1');
    fault(true);
    assert.equal(reclaim(), 'already-reclaimed 1');
    assert.equal(state(), '1:1');

    stage('lifecycle-recover-restore');
    writePhase(control, 'lifecycle-reclaimed');
    await waitPhase(control, 'lifecycle-restore-requested');
    await until(
      control,
      () =>
        sql(
          `SELECT attempt FROM history.restore_jobs ${where} AND status='pending' AND payload IS NULL AND lease_until<=clock_timestamp()`,
        ) === '1',
      'failed provider attempt without staged bytes',
    );
    fault(false);
    writePhase(control, 'lifecycle-provider-recovered');
    await waitPhase(control, 'lifecycle-restored');
    const restoredBytes = Number(
      sql(
        `SELECT octet_length(payload) FROM history.restore_jobs ${where} AND status='ready' AND attempt=2`,
      ),
    );
    assert.equal(restoredBytes, bytes.length);
    await until(
      control,
      () => sql(`SELECT count(*) FROM history.work_reservations ${where}`) === '0',
      'reservation release',
    );
    const [jobs, workBytes, maxJobs, maxWorkBytes] = sql(
      `SELECT history.export_slots(tenant_id), history.export_bytes(tenant_id)+${restoredBytes}, max_jobs,max_bytes FROM history.lifecycle_policies ${where}`,
    )
      .split('|')
      .map(Number);
    assert.equal(jobs, 1);
    assert(jobs <= maxJobs && workBytes <= maxWorkBytes);
    assert.equal(
      sql(`SELECT count(*) FROM history.asset_property_changes ${where}`),
      '2',
    );
    assert.equal(sql(`SELECT records FROM history.retention_receipts ${where}`), '1');
    owned();
    compose(['stop', 'archive-storage']);
    assert.equal(state(), '1:1');
    return {
      topology: 'private-loopback-s3-and-postgresql',
      providerImage: productInputs.objectStorage,
      records: 2,
      archived: 1,
      archiveBytes: bytes.length,
      restoredBytes,
      manifestGeneration: 2,
      restoreAttempts: 2,
      archiveReservationBytes: limit,
      retainedJobs: jobs,
      retainedWorkBytes: workBytes,
      maxJobs,
      maxWorkBytes,
      maxObjectBytes: limit,
    };
  } finally {
    if (paused) fault(false);
  }
}
