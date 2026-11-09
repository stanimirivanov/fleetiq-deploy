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

export async function qualifyRestoredHistory({
  page,
  expect,
  directory,
  checks,
  setStep,
}) {
  await waitPhase(directory, 'lifecycle-seeded');
  const original = (await api(page, history)).changes;
  assert.equal(original.length, 1);
  assert.equal(original[0].value.value, '111');
  const interpretation = `${property}/interpretations/${original[0].interpretation}`;
  const provenance = await api(page, interpretation);
  const now = Date.now();
  await page.goto(
    `https://fleet.test:8443/assets/asset?tenant=tenant-lifecycle&property=electrical.voltage&property_version=1&effective_at_ms=${now}&known_at_ms=${now}&history_start=0&history_end=2000`,
  );
  await page.getByLabel('History representation').selectOption('1000');
  await page.getByRole('button', { name: 'Apply history window' }).click();
  const buckets = page.getByRole('table', { name: 'Exact numeric summary buckets' });
  await expect(
    page.getByRole('status').filter({ hasText: 'Numeric summary' }),
  ).toContainText(/Summary publication [1-9][0-9]*, revision 1\..*Hot snapshot only/u);
  await expect(buckets.getByRole('row').nth(1).getByRole('cell')).toHaveText([
    '0–1000',
    '0 / 0 / 0',
    '—',
    '—',
    '0',
    'Undefined (no good samples)',
  ]);
  await expect(buckets.getByRole('row').nth(2).getByRole('cell')).toHaveText([
    '1000–2000',
    '1 / 1 / 0',
    '111',
    '111',
    '111',
    '111 / 1',
  ]);
  await expect(buckets.getByRole('row')).toHaveCount(3);
  checks.push('installed-numeric-summary');
  writePhase(directory, 'lifecycle-baseline', checks);
  await waitPhase(directory, 'lifecycle-reclaimed');
  await api(page, history, { status: 409 });
  await api(page, interpretation, { status: 409 });

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
  setStep('restored-export');
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
  setStep('mixed-history-inspect');
  const historyReview = page.getByRole('region', { name: 'Property history review' });
  await historyReview.getByLabel('History end (Unix ms, exclusive)').fill('2500');
  await historyReview.getByRole('button', { name: 'Apply history window' }).click();
  const rows = historyReview.getByRole('table', {
    name: 'Exact historical values, quality and provenance',
  });
  await expect(rows.getByRole('row')).toHaveCount(3);
  await expect(rows.getByRole('row').nth(1)).toContainText('111');
  await expect(rows.getByRole('row').nth(2)).toContainText('222');

  const mixed = await api(
    page,
    `${property}/history?start_at_ms=0&end_at_ms=2500&${selection}&include_restore_membership=true`,
  );
  assert.deepEqual(mixed.restored_row_indices, [0]);
  assert.equal(mixed.changes.length, 2);
  assert.deepEqual(mixed.changes[0], original[0]);
  const hotInterpretation = `${property}/interpretations/${mixed.changes[1].interpretation}`;
  const hotProvenance = await api(page, hotInterpretation);
  assert.deepEqual(hotProvenance, mixed.changes[1]);
  assert.equal(hotProvenance.source.message_id, 'new');

  const selectedQuery = '?manifest_id=1&restore_generation=1';
  const responseFor = (path) => (response) =>
    response.request().method() === 'GET' && new URL(response.url()).pathname === path;
  const panel = page.getByRole('region', { name: 'Interpretation provenance' });
  for (const [row, path, search, expected] of [
    [2, hotInterpretation, '', hotProvenance],
    [1, interpretation, selectedQuery, provenance],
  ]) {
    const [inspected] = await Promise.all([
      page.waitForResponse(responseFor(path)),
      historyReview
        .getByRole('button', {
          name: `Inspect history interpretation ${row}`,
          exact: true,
        })
        .click(),
    ]);
    assert.equal(new URL(inspected.url()).search, search);
    assert.equal(inspected.status(), 200);
    assert.deepEqual(await inspected.json(), expected);
    const location = new URL(page.url()).searchParams;
    assert.equal(location.get('history_manifest'), '1');
    assert.equal(location.get('history_generation'), '1');
    assert.equal(location.get('history_end'), '2500');
    for (const [label, value] of [
      [
        'Original binding',
        `${expected.binding_id} · revision ${expected.binding_revision}`,
      ],
      [
        'Source',
        `${expected.source.device_asset_id} / ${expected.source.endpoint_id} / ${expected.source.signal_id}`,
      ],
      [
        'Decoder',
        `${expected.source.protocol_package_id} / ${expected.source.protocol_package_version}`,
      ],
      ['First effective cutoff', expected.first_resolution_effective_at_ms],
      ['First knowledge cutoff', expected.first_resolution_known_at_ms],
      [
        'Message / output',
        `${expected.source.message_id} / ${expected.source.output_index}`,
      ],
    ]) {
      await expect(
        panel.getByText(label, { exact: true }).locator('..').locator('dd'),
      ).toHaveText(value);
    }
  }
  await api(page, `${tenant}/actors/operator-a/access-changes`, {
    method: 'POST',
    body: {
      change_id: 'revoke-restored-evidence',
      kind: 'revoke',
      action: 'telemetry.read',
    },
  });
  setStep('restored-inspect-revoked');
  const [denied] = await Promise.all([
    page.waitForResponse(responseFor(interpretation)),
    historyReview
      .getByRole('button', { name: 'Refresh history page', exact: true })
      .click(),
  ]);
  assert.equal(new URL(denied.url()).search, selectedQuery);
  assert.equal(denied.status(), 403);
  await expect(panel.getByText('Original binding', { exact: true })).toHaveCount(0);
  await api(page, generation, { status: 403 });
  await api(page, `${history}&${selection}`, { status: 403 });
  await api(page, exportPath, { status: 403 });
  checks.push(
    'private-archive-reclamation-and-restore',
    'installed-restored-inspect',
    'installed-mixed-history-inspect',
  );
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
