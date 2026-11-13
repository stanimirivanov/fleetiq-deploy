import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { expect as baseExpect, chromium } from '@playwright/test';
import { verifyMapCoordinates, verifySimulatorReading } from './evidence.mjs';

const expect = baseExpect.configure({ timeout: 30000 });
const origin = 'https://fleet.fleetiq.test:58443';
let browser,
  phase = 'trust';
try {
  assert(
    !existsSync('/run/seed-parent/seed') && !existsSync('/run/input/teltonika.wasm'),
    'Inspect browser must not receive the private seeder inputs',
  );
  mkdirSync('/tmp/home/.pki/nssdb', { recursive: true, mode: 0o700 });
  for (const args of [
    ['-N', '--empty-password', '-d', 'sql:/tmp/home/.pki/nssdb'],
    [
      '-A',
      '-n',
      'FleetIQ disposable demo CA',
      '-t',
      'C,,',
      '-i',
      '/run/public/ca.crt',
      '-d',
      'sql:/tmp/home/.pki/nssdb',
    ],
  ]) {
    const result = spawnSync('certutil', args, {
      timeout: 10000,
      stdio: 'ignore',
      shell: false,
    });
    assert(!result.error && result.status === 0);
  }
  const expected = JSON.parse(readFileSync('/run/qualification/request.json', 'utf8'));
  phase = 'login';
  browser = await chromium.launch({
    headless: true,
    args: [
      '--host-resolver-rules=MAP fleet.fleetiq.test 127.0.0.1, MAP issuer.fleetiq.test 127.0.0.1',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
    ],
  });
  const context = await browser.newContext({
    viewport: { width: 1680, height: 1000 },
    serviceWorkers: 'block',
  });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  let pageErrors = 0,
    foreign = false,
    sample = false,
    style = false,
    tile = false;
  page.on('pageerror', () => pageErrors++);
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (
      ['http:', 'https:'].includes(url.protocol) &&
      ![origin, 'https://issuer.fleetiq.test:59443'].includes(url.origin)
    )
      foreign = true;
    if (url.searchParams.get('preview') === 'sample') sample = true;
  });
  page.on('response', (response) => {
    const url = new URL(response.url());
    if (url.origin === origin && response.ok()) {
      if (
        url.pathname === '/maps/light/style.json' ||
        url.pathname === '/maps/dark/style.json'
      )
        style = true;
      if (url.pathname === '/maps/tiles/0/0/0.png') tile = true;
    }
  });
  await page.goto(`${origin}/assets`);
  await page.getByRole('link', { name: 'Sign in', exact: true }).click();
  for (let i = 0; i < 2; i++)
    await page
      .getByRole('button', { name: 'Continue as synthetic demo operator', exact: true })
      .click();
  await page.waitForURL(`${origin}/assets`);
  const api = (path, method = 'GET', body) =>
    page.evaluate(
      async ({ path, method, body }) => {
        const response = await fetch(path, {
          method,
          credentials: 'same-origin',
          redirect: 'error',
          signal: AbortSignal.timeout(15000),
          headers:
            method === 'GET'
              ? {}
              : { 'Content-Type': 'application/json', 'X-FleetIQ-CSRF': '1' },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
        if (!response.ok) throw new Error('Simulator API check failed');
        return response.status === 204 ? null : response.json();
      },
      { path, method, body },
    );
  assert.equal((await api('/api/v1/auth/session')).actor_id, expected.actorId);
  const tenant = `/api/v1/tenants/${expected.tenantId}`;
  await api(`${tenant}/actors/${expected.actorId}/access-changes`, 'POST', {
    change_id: 'simulator-storage-check',
    kind: 'grant',
    action: 'operations.read',
  });
  phase = 'projection';
  const evidence = {};
  for (const axis of ['latitude', 'longitude']) {
    const property = `${tenant}/assets/${expected.assetId}/properties/position.${axis}/versions/1`;
    await expect
      .poll(
        async () => {
          const snapshot = await api(`${property}/current`);
          return (
            !snapshot.pending &&
            snapshot.items.length === 1 &&
            snapshot.items[0].change.event_at_ms === expected.record.timestampMs
          );
        },
        { timeout: 90000 },
      )
      .toBe(true);
    const snapshot = await api(`${property}/current`),
      change = snapshot.items[0].change;
    const history = await api(
      `${property}/history?start_at_ms=${expected.record.timestampMs}&end_at_ms=${BigInt(expected.record.timestampMs) + 1n}&limit=10`,
    );
    const provenance = await api(
      `${property}/interpretations/${encodeURIComponent(change.interpretation)}`,
    );
    verifySimulatorReading({ snapshot, history, provenance }, expected, axis);
    evidence[axis] = change;
  }
  assert.equal(
    evidence.latitude.source.message_id,
    evidence.longitude.source.message_id,
  );
  phase = 'map-ready';
  const query = new URLSearchParams({
    tenant: expected.tenantId,
    latitude_property: 'position.latitude',
    latitude_version: '1',
    longitude_property: 'position.longitude',
    longitude_version: '1',
    encoding: 'e7',
  });
  await page.goto(`${origin}/map?${query}`);
  await expect(
    page.getByRole('status').filter({ hasText: 'Geodetic map · observed points only' }),
  ).toBeVisible();
  const canvas = page.getByTestId('geodetic-canvas').locator('canvas');
  await expect(canvas).toHaveCount(1);
  const list = page.getByRole('region', { name: 'Loaded fleet page', exact: true });
  const selection = page.getByRole('complementary', {
    name: 'Selected location evidence',
    exact: true,
  });
  phase = 'map-list';
  await list.getByRole('button', { name: new RegExp(expected.assetId) }).click();
  await expect(selection).toContainText(expected.assetId);
  // Center via normal list selection, then select the unlocated device to clear the point selection.
  await list.getByRole('button', { name: new RegExp(expected.deviceId) }).click();
  await expect(selection).toContainText(expected.deviceId);
  phase = 'map-point';
  await canvas.click();
  await expect(selection).toContainText(expected.assetId);
  await expect(page).toHaveURL(
    (url) => url.searchParams.get('asset') === expected.assetId,
  );
  phase = 'map-coordinate';
  verifyMapCoordinates(
    await selection
      .getByText(/^-?[0-9]+(?:\.[0-9]+)?,\s*-?[0-9]+(?:\.[0-9]+)?$/u)
      .textContent(),
    expected.record,
  );
  phase = 'map-resources';
  assert(style && tile && !foreign && !sample);
  phase = 'inspect';
  const link = selection
    .getByRole('link', { name: 'Inspect reading and provenance', exact: true })
    .first();
  const href = new URL(await link.getAttribute('href'), origin);
  assert.equal(href.origin, origin);
  assert.equal(href.pathname, `/assets/${expected.assetId}`);
  assert.equal(
    href.searchParams.get('interpretation'),
    evidence.latitude.interpretation,
  );
  await link.click();
  const panel = page.getByRole('region', {
    name: 'Interpretation provenance',
    exact: true,
  });
  for (const [label, value] of [
    ['Original binding', `${expected.deviceId}-latitude · revision 1`],
    ['Source', `${expected.deviceId} / main / gps.latitude_e7`],
    ['Decoder', 'vendor.teltonika / simulator-demo-1'],
    ['Device recorded', new Date(Number(expected.record.timestampMs)).toISOString()],
    [
      'Message / output',
      `${evidence.latitude.source.message_id} / ${evidence.latitude.source.output_index}`,
    ],
  ])
    await expect(
      panel.getByText(label, { exact: true }).locator('..').locator('dd'),
    ).toHaveText(value);
  await expect(
    panel.getByText('Value / quality', { exact: true }).locator('..').locator('dd'),
  ).toContainText(String(expected.record.latitudeE7));
  assert.equal(pageErrors, 0);
  assert(!foreign && !sample);
  phase = 'storage';
  const usage = await api(`${tenant}/storage-usage`);
  const accepted = usage.classes.find((c) => c.kind === 'accepted_messages').records;
  await api('/api/v1/auth/logout', 'POST');
  console.log(
    JSON.stringify({
      checks: ['durable-projection', 'selected-map-point', 'matching-inspect'],
      accepted,
    }),
  );
} catch {
  console.error(`Simulator browser qualification failed: ${phase}`);
  process.exitCode = 1;
} finally {
  await browser?.close();
}
