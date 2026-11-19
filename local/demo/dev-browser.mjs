import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { get } from 'node:https';
import { chromium, expect } from '@playwright/test';

const origin = 'https://fleet.fleetiq.test:58443';
let browser,
  phase = 'trust';
try {
  mkdirSync('/tmp/home/.pki/nssdb', { recursive: true, mode: 0o700 });
  for (const args of [
    ['-N', '--empty-password', '-d', 'sql:/tmp/home/.pki/nssdb'],
    [
      '-A',
      '-n',
      'Owned development smoke CA',
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
  const expected = JSON.parse(readFileSync('/run/control/request.json', 'utf8'));
  browser = await chromium.launch({
    headless: true,
    args: [
      '--host-resolver-rules=MAP fleet.fleetiq.test 127.0.0.1, MAP issuer.fleetiq.test 127.0.0.1',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
    ],
  });
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const page = await context.newPage();
  let foreign = false,
    errors = 0,
    hmr = false,
    streamed = false;
  page.on('pageerror', () => errors++);
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (
      ['http:', 'https:'].includes(url.protocol) &&
      ![origin, 'https://issuer.fleetiq.test:59443'].includes(url.origin)
    )
      foreign = true;
  });
  page.on('websocket', (socket) => {
    const url = new URL(socket.url());
    if (
      url.origin !== 'wss://fleet.fleetiq.test:58443' ||
      url.pathname !== '/__fleetiq_hmr'
    )
      foreign = true;
    socket.on('framereceived', (event) => {
      if (event.payload === '{"type":"connected"}') hmr = true;
    });
  });
  page.on('response', async (response) => {
    if (
      (await response.headerValue('content-type'))?.includes('text/event-stream') &&
      response.ok()
    )
      streamed = true;
  });
  phase = 'login';
  await page.goto(`${origin}/assets`);
  await page.getByRole('link', { name: 'Sign in', exact: true }).click();
  for (let i = 0; i < 2; i++)
    await page
      .getByRole('button', { name: 'Continue as synthetic demo operator', exact: true })
      .click();
  await page.waitForURL(`${origin}/assets`);
  const actor = await page.evaluate(async () => {
    const r = await fetch('/api/v1/auth/session', {
      credentials: 'same-origin',
      redirect: 'error',
    });
    if (!r.ok) throw new Error('session unavailable');
    return (await r.json()).actor_id;
  });
  assert.equal(actor, expected.actorId);
  const query = new URLSearchParams({
    tenant: expected.tenantId,
    latitude_property: 'position.latitude',
    latitude_version: '1',
    longitude_property: 'position.longitude',
    longitude_version: '1',
    encoding: 'e7',
  });
  phase = 'map';
  await page.goto(`${origin}/map?${query}`);
  await expect(
    page.getByRole('status').filter({ hasText: 'Geodetic map · observed points only' }),
  ).toBeVisible({ timeout: 30000 });
  await expect(page.getByTestId('geodetic-canvas').locator('canvas')).toHaveCount(1);
  await expect(
    page
      .getByRole('region', { name: 'Loaded fleet page', exact: true })
      .getByRole('button', { name: new RegExp(expected.assetId) }),
  ).toBeVisible();
  await expect.poll(() => hmr, { timeout: 30000 }).toBe(true);
  phase = 'sse';
  streamed = await page.evaluate(
    async ({ tenant, asset }) => {
      const path = `/api/v1/tenants/${encodeURIComponent(tenant)}/assets/${encodeURIComponent(asset)}/properties/position.latitude/versions/1/live`;
      const response = await fetch(path, {
        credentials: 'same-origin',
        redirect: 'error',
        headers: { Accept: 'text/event-stream' },
        signal: AbortSignal.timeout(15000),
      });
      if (
        !response.ok ||
        !response.headers.get('content-type')?.includes('text/event-stream') ||
        !response.headers.get('cache-control')?.includes('no-store')
      )
        return false;
      const reader = response.body.getReader();
      try {
        const frame = await reader.read();
        return !frame.done && frame.value.byteLength > 0;
      } finally {
        await reader.cancel();
      }
    },
    { tenant: expected.tenantId, asset: expected.assetId },
  );
  assert(streamed);
  await page.evaluate(() => {
    window.__fleetiqDevelopmentBoot = 'owned-browser-document';
  });
  phase = 'edit-initial';
  await expect
    .poll(() =>
      page.evaluate(() =>
        getComputedStyle(document.documentElement)
          .getPropertyValue('--fleetiq-development-proof')
          .trim(),
      ),
    )
    .toBe('before');
  phase = 'edit-update';
  writeFileSync('/run/control/edit-ready', 'ready', { flag: 'wx', mode: 0o600 });
  await expect
    .poll(
      () =>
        page.evaluate(() =>
          getComputedStyle(document.documentElement)
            .getPropertyValue('--fleetiq-development-proof')
            .trim(),
        ),
      { timeout: 60000 },
    )
    .toBe('after');
  phase = 'edit-document';
  assert.equal(
    await page.evaluate(() => window.__fleetiqDevelopmentBoot),
    'owned-browser-document',
  );
  phase = 'sample-refusal';
  assert.equal(
    await page.evaluate(
      async () =>
        (
          await fetch('/assets?preview=sample', {
            credentials: 'same-origin',
            redirect: 'error',
          })
        ).status,
    ),
    400,
  );
  phase = 'origin-refusal';
  assert.equal(
    await new Promise((resolve, reject) => {
      // Chromium's resolver mapping does not apply to Node probes. Verify the
      // canonical TLS name against the disposable CA while dialing loopback.
      const request = get(
        `${origin}/__fleetiq_hmr`,
        {
          ca: readFileSync('/run/public/ca.crt'),
          family: 4,
          lookup: (_hostname, _options, callback) => callback(null, '127.0.0.1', 4),
          headers: { Origin: 'https://foreign.invalid' },
          timeout: 10000,
        },
        (response) => {
          resolve(response.statusCode);
          response.destroy();
        },
      );
      request.on('timeout', () => request.destroy(new Error('Probe timed out')));
      request.on('error', reject);
    }),
    403,
  );
  phase = 'logout';
  const logout = await page.evaluate(async () => {
    const r = await fetch('/api/v1/auth/logout', {
      method: 'POST',
      credentials: 'same-origin',
      redirect: 'error',
      headers: { 'X-FleetIQ-CSRF': '1' },
    });
    return r.status;
  });
  assert.equal(logout, 204);
  assert(!foreign && errors === 0);
  writeFileSync(
    '/run/control/result.json',
    JSON.stringify({
      tls: true,
      session: true,
      sse: true,
      hmr: true,
      edit: true,
      noReload: true,
      logout: true,
      foreignRefused: true,
      noSample: true,
    }),
    { flag: 'wx', mode: 0o600 },
  );
} catch {
  writeFileSync('/run/control/failed', JSON.stringify({ phase }), {
    flag: 'wx',
    mode: 0o600,
  });
  process.exitCode = 1;
} finally {
  await browser?.close();
}
