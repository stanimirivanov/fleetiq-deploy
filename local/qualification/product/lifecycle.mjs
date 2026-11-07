import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { api } from './api.mjs';
import { waitPhase, writePhase } from './channel.mjs';

const tenant = '/api/v1/tenants/tenant-lifecycle';
const property = `${tenant}/assets/asset/properties/electrical.voltage/versions/1`;
const window = 'start_at_ms=0&end_at_ms=1500';
const history = `${property}/history?${window}`;
const restore = `${tenant}/restores/manifests/1`;
const generation = `${restore}/generations/1`;

export async function qualifyRestoredHistory({ page, expect, directory, checks }) {
  await waitPhase(directory, 'lifecycle-seeded');
  const original = (await api(page, history)).changes;
  assert.equal(original.length, 1);
  assert.equal(original[0].value.value, '111');
  const provenance = await api(
    page,
    `${property}/interpretations/${original[0].interpretation}`,
  );
  writePhase(directory, 'lifecycle-baseline', checks);
  await waitPhase(directory, 'lifecycle-reclaimed');
  await api(page, history, { status: 409 });
  await api(page, `${property}/interpretations/${original[0].interpretation}`, {
    status: 409,
  });

  const now = Date.now();
  await page.goto(
    `https://fleet.test:8443/assets/asset?tenant=tenant-lifecycle&property=electrical.voltage&property_version=1&effective_at_ms=${now}&known_at_ms=${now}&history_start=0&history_end=1500`,
  );
  const request = page.getByRole('button', { name: 'Request restore', exact: true });
  await page.getByLabel('Manifest to restore').fill('1');
  await request.click();
  const retry = page.getByRole('button', { name: 'Retry exact restore request' });
  await expect(retry).toBeVisible();
  assert.equal((await api(page, generation)).state, 'pending');
  writePhase(directory, 'lifecycle-restore-requested', checks);
  await waitPhase(directory, 'lifecycle-provider-recovered');
  await retry.click();
  await expect
    .poll(async () => (await api(page, generation)).state, { timeout: 30000 })
    .toBe('ready');
  await page.getByRole('button', { name: 'Refresh restore status' }).click();
  await page.getByRole('button', { name: 'Review restored history' }).click();
  await expect(
    page.getByRole('region', { name: 'Property history review' }),
  ).toContainText('111');
  const selection = 'mode=hot_and_restored&manifest_id=1&restore_generation=1';
  const restored = await api(page, `${history}&${selection}`);
  assert.deepEqual(restored.changes, original);
  assert.deepEqual(restored.coverage, {
    hot: 'queried',
    archive: 'restored',
    scope: 'selected_manifest_only',
    manifest_id: '1',
    restore_generation: '1',
  });
  // Exact change equality includes the original binding, source and first-resolution times.
  await expect(
    page.getByRole('region', { name: 'Property history review' }),
  ).toContainText('restored');
  assert(provenance && JSON.stringify(provenance).includes('vendor.fixture'));
  const exportPath = await qualifyExport({
    page,
    expect,
    tenant,
    coverage: {
      scope: 'hot_and_selected_manifest_snapshot',
      manifest_id: '1',
      restore_generation: '1',
    },
  });
  await api(page, `${tenant}/actors/operator-a/access-changes`, {
    method: 'POST',
    body: {
      change_id: 'revoke-restored-evidence',
      kind: 'revoke',
      action: 'telemetry.read',
    },
  });
  await api(page, generation, { status: 403 });
  await api(page, `${history}&${selection}`, { status: 403 });
  await api(page, exportPath, { status: 403 });
  checks.push('private-archive-reclamation-and-restore');
  writePhase(directory, 'lifecycle-restored', checks);
}

export async function qualifyExport({
  page,
  expect,
  tenant,
  coverage,
  setStep = () => {},
}) {
  const exportRegion = page.getByRole('region', { name: 'Historical export' });
  const [request] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.request().method() === 'PUT' &&
        new URL(response.url()).pathname.startsWith(`${tenant}/exports/requests/`),
    ),
    exportRegion.getByRole('button', { name: 'Request export' }).click(),
  ]);
  assert.equal(request.status(), 202);
  const { export_id: exportId, state } = await request.json();
  assert(typeof exportId === 'string' && /^[1-9][0-9]{0,18}$/u.test(exportId));
  const exportPath = `${tenant}/exports/jobs/${exportId}`;
  if (state === 'pending') {
    await expect.poll(async () => (await api(page, exportPath)).state).toBe('ready');
    await exportRegion.getByRole('button', { name: 'Refresh export status' }).click();
  }
  const downloadButton = exportRegion.getByRole('button', { name: 'Download export' });
  setStep('browser-export-ready');
  await expect(downloadButton).toBeVisible();
  setStep('browser-export-download');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    downloadButton.click(),
  ]);
  assert.equal(download.suggestedFilename(), `fleetiq-export-${exportId}.parquet`);
  const info = await api(page, exportPath);
  const bytes = readFileSync(await download.path());
  assert.equal(info.row_count, 1);
  assert.deepEqual(info.coverage, coverage);
  assert.equal(info.file_bytes, String(bytes.length));
  assert(bytes.length <= 2097152);
  assert.equal(bytes.subarray(0, 4).toString(), 'PAR1');
  assert.equal(bytes.subarray(-4).toString(), 'PAR1');
  await download.delete();
  return exportPath;
}
