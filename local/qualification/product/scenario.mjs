import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { lookup } from 'node:dns/promises';
import { mkdirSync } from 'node:fs';
import { expect as baseExpect, chromium } from '@playwright/test';
import { api, binding, currentPath, seed, tenant } from './api.mjs';
import {
  browserFailure,
  browserUiCause,
  formatBrowserFailure,
} from './browser-failure.mjs';
import { waitPhase, writePhase } from './channel.mjs';
import { requiredChecks } from './contract.mjs';
import { transmit } from './device.mjs';
import { InstalledFleetPage } from './page.mjs';

const expect = baseExpect.configure({ timeout: 30000 });
const directory = '/control',
  checks = [];
let browser, page;
let pageErrors = 0;
let step = 'trust-store',
  cspBlocked = false;
try {
  // Import only this ephemeral CA into this container's fresh NSS database.
  const nss = '/home/pwuser/.pki/nssdb';
  mkdirSync(nss, { recursive: true });
  for (const args of [
    ['-N', '--empty-password', '-d', `sql:${nss}`],
    [
      '-A',
      '-d',
      `sql:${nss}`,
      '-n',
      'FleetIQ disposable CA',
      '-t',
      'C,,',
      '-i',
      '/run/public/ca.crt',
    ],
  ]) {
    const result = spawnSync('certutil', args, {
      timeout: 10000,
      stdio: 'ignore',
      shell: false,
    });
    assert.equal(result.status, 0, 'Isolated browser trust setup failed');
  }
  step = 'browser-launch';
  browser = await chromium.launch({
    headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    serviceWorkers: 'block',
  });
  page = await context.newPage();
  const ui = new InstalledFleetPage(page);
  page.setDefaultTimeout(30000);
  page.on('pageerror', () => {
    pageErrors++;
  });
  page.on('console', (message) => {
    if (
      message.type() === 'error' &&
      /form-action/u.test(message.text()) &&
      /violat/iu.test(message.text())
    )
      cspBlocked = true;
  });
  await ui.signIn((value) => {
    step = value;
  });
  step = 'hostname-check';
  const fleetAddresses = (await lookup('fleet.test', { all: true }))
    .map((v) => v.address)
    .sort();
  const wrongAddresses = (await lookup('wrong.test', { all: true }))
    .map((v) => v.address)
    .sort();
  assert.deepEqual(
    wrongAddresses,
    fleetAddresses,
    'Wrong-host probe must reach the same edge',
  );
  const wrongHost = await context.newPage();
  let hostnameRejected = false;
  try {
    await wrongHost.goto('https://wrong.test:8443');
  } catch (error) {
    hostnameRejected =
      /ERR_CERT_[A-Z_]+|ERR_SSL_[A-Z_]+|ERR_CONNECTION_CLOSED|ERR_CONNECTION_RESET/u.test(
        error.message,
      );
  }
  assert(hostnameRejected, 'A different DNS name must fail certificate verification');
  await wrongHost.close();
  step = 'session-check';
  assert.equal((await api(page, '/api/v1/auth/session')).actor_id, 'operator-a');
  checks.push('trusted-https-oidc');
  const cookies = await context.cookies('https://fleet.test:8443');
  assert(
    cookies.some(
      (cookie) => cookie.secure && cookie.httpOnly && cookie.sameSite === 'Lax',
    ),
    'Expected protected server session cookie',
  );
  assert(
    !Object.keys(await page.evaluate(() => ({ ...localStorage }))).some((key) =>
      /token|secret/iu.test(key),
    ),
  );
  checks.push('session-cookie-boundary');
  step = 'commissioning';
  await seed(page);
  checks.push('csrf-and-cross-tenant-denial', 'real-wasm-admission');
  writePhase(directory, 'setup-ready', checks);
  await waitPhase(directory, 'workers-started');
  step = 'device-to-web';
  const firstAt = Date.now() - 1000;
  await transmit(firstAt, 515000000, -1200000, {
    onStep: (value) => {
      step = value;
    },
  });
  step = 'current-property';
  await expect
    .poll(async () => (await api(page, currentPath())).items[0]?.change.value.value, {
      timeout: 90000,
    })
    .toBe('515000000');
  checks.push('durable-tcp-to-property');
  step = 'original-provenance';
  const initialSnapshot = await api(page, currentPath());
  const original = initialSnapshot.items[0].change;
  assert.equal(original.binding_revision, '1');
  assert.equal(original.source.device_asset_id, 'gateway-1');
  assert.equal(original.source.endpoint_id, 'main');
  assert.equal(original.source.signal_id, 'gps.latitude_e7');
  assert.equal(original.source.protocol_package_id, 'vendor.teltonika');
  assert.equal(original.source.protocol_package_version, 'qualification-1');
  assert.equal(original.event_time_basis, 'device_recorded');
  const evidencePath = `${tenant}/assets/asset-main/properties/position.latitude/versions/1`;
  const provenance = await api(
    page,
    `${evidencePath}/interpretations/${original.interpretation}`,
  );
  assert(provenance && JSON.stringify(provenance).includes(original.source.message_id));
  checks.push('original-provenance');
  const liveRequests = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === currentPath().replace('/current', '/live'))
      liveRequests.push(Boolean(request.headers()['last-event-id']));
  });
  const discovery = await api(page, '/api/v1/me/tenants');
  assert(
    discovery.tenants.some(
      (item) =>
        item.tenant_id === 'tenant-a' &&
        item.actions.includes('metadata.read') &&
        item.actions.includes('telemetry.read'),
    ),
  );
  step = 'inspector-open';
  await ui.inspector('asset-main', (value) => {
    step = value;
  });
  step = 'inspector-readings';
  await expect(ui.readings()).toContainText('515000000');
  step = 'inspector-provenance';
  await ui
    .readings()
    .getByRole('button', { name: 'Inspect reading provenance', exact: true })
    .click();
  await expect(
    page.getByRole('region', { name: 'Interpretation provenance', exact: true }),
  ).toContainText('vendor.teltonika');
  step = 'inspector-history';
  await expect(
    page.getByRole('region', { name: 'Hot property history', exact: true }),
  ).toContainText('515000000');
  checks.push('browser-reading-and-history');
  step = 'live-start';
  await ui.startLive();
  await expect(ui.delivery()).toContainText('515000000');
  step = 'live-update';
  await transmit(firstAt + 1, 515000100, -1200100);
  await expect(ui.delivery()).toContainText('515000100', { timeout: 90000 });
  checks.push('live-update');
  const requestsBeforeRestart = liveRequests.length;
  writePhase(directory, 'initial-visible', checks);
  await waitPhase(directory, 'restart-complete');
  // Keep the production finite retry budget. A longer outage uses its documented
  // operator retry; both paths must establish a fresh full SSE baseline.
  await transmit(Date.now() - 1, 515000200, -1200200);
  let operatorRetryUsed = false;
  await expect
    .poll(
      async () => {
        if (!operatorRetryUsed) operatorRetryUsed = await ui.retryStoppedDelivery();
        return (await ui.delivery().textContent()).includes('515000200');
      },
      { timeout: 90000 },
    )
    .toBe(true);
  assert.deepEqual(
    await api(page, `${evidencePath}/interpretations/${original.interpretation}`),
    provenance,
  );
  assert(
    liveRequests.length > requestsBeforeRestart,
    'Restart must establish a new stream',
  );
  assert.equal(liveRequests.at(-1), false, 'Resnapshot must discard the old cursor');
  assert.notEqual(
    (await api(page, currentPath())).generation,
    initialSnapshot.generation,
  );
  checks.push('restart-resnapshot');
  const cdp = await context.newCDPSession(page);
  const workers = async () =>
    (await cdp.send('Target.getTargets')).targetInfos.filter(
      (target) =>
        target.type === 'worker' && target.url.includes('/assets/maplibre-gl-worker-'),
    ).length;
  let styleRead = false,
    dataRead = false;
  page.on('response', (response) => {
    const url = new URL(response.url());
    if (url.origin !== 'https://fleet.test:8443' || !response.ok()) return;
    if (url.pathname === '/maps/light/style.json') styleRead = true;
    if (url.pathname === '/maps/tiles/0/0/0.png') dataRead = true;
  });
  for (let cycle = 0; cycle < 3; cycle++) {
    await ui.map();
    await expect(
      page
        .getByRole('status')
        .filter({ hasText: 'Geodetic map · observed points only' }),
    ).toBeVisible();
    await expect(page.getByTestId('geodetic-canvas').locator('canvas')).toHaveCount(1);
    await expect.poll(workers).toBe(1);
    await expect(
      page.getByRole('region', { name: 'Loaded fleet page', exact: true }),
    ).toContainText('asset-main');
    await ui.leaveMap();
    await expect(page.locator('.maplibregl-canvas')).toHaveCount(0);
    await expect.poll(workers).toBe(0);
  }
  assert(styleRead && dataRead, 'Expected real self-hosted map requests');
  checks.push('self-hosted-geographic-renderer', 'map-resource-disposal');
  // Temporal correction is additive. Already committed interpretations never rebind.
  const beforeCorrection = (await api(page, currentPath())).items[0].change;
  const correctionStart = Date.now();
  for (const axis of ['latitude', 'longitude'])
    await binding(page, axis, 'asset-secondary', 2, correctionStart);
  assert.deepEqual((await api(page, currentPath())).items[0].change, beforeCorrection);
  await transmit(correctionStart + 1, 515000300, -1200300);
  await expect
    .poll(
      async () =>
        (await api(page, currentPath('asset-secondary'))).items[0]?.change
          .binding_revision,
      { timeout: 90000 },
    )
    .toBe('2');
  assert.deepEqual((await api(page, currentPath())).items[0].change, beforeCorrection);
  assert.deepEqual(
    await api(page, `${evidencePath}/interpretations/${original.interpretation}`),
    provenance,
  );
  const history = await api(
    page,
    `${evidencePath}/history?start_at_ms=${firstAt - 1}&end_at_ms=${Date.now() + 1000}&limit=100`,
  );
  assert(
    history.changes.some((change) => change.interpretation === original.interpretation),
  );
  checks.push('mapping-correction-preserves-history');
  await ui.inspector('asset-secondary');
  await ui.startLive();
  await expect(ui.delivery()).toContainText('515000300');
  await api(page, `${tenant}/actors/operator-a/access-changes`, {
    method: 'POST',
    body: { change_id: 'revoke-telemetry', kind: 'revoke', action: 'telemetry.read' },
  });
  await expect(ui.delivery()).toContainText('Access is denied', { timeout: 30000 });
  await expect(ui.delivery()).not.toContainText('515000300');
  await api(page, currentPath('asset-secondary'), { status: 403 });
  checks.push('permission-revocation');
  await api(page, '/api/v1/auth/logout', { method: 'POST' });
  await api(page, '/api/v1/auth/session', { status: 401 });
  checks.push('logout-invalidates-session');
  assert.equal(pageErrors, 0, 'Unexpected browser application errors');
  assert.deepEqual([...checks].sort(), [...requiredChecks].sort());
  await browser.close();
  browser = undefined;
  writePhase(directory, 'complete', checks);
} catch (error) {
  console.error(
    formatBrowserFailure(
      browserFailure(
        step,
        error,
        cspBlocked,
        pageErrors > 0 ? 'application-error' : await browserUiCause(page),
      ),
    ),
  );
  // Never retain provider URLs, assertions with bodies, cookies, traces or credentials.
  writePhase(directory, 'failed', checks);
  process.exitCode = 1;
} finally {
  await browser?.close();
}
