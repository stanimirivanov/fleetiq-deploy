import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chromium, expect } from '@playwright/test';
import { recover } from './analytics-alerts.mjs';

test('notification recovery verifies the stored receipt after Chromium discards the UI response body', {
  timeout: 30000,
}, async () => {
  const command =
    '/api/v1/tenants/tenant-a/work-recovery/notification/commands/fixture';
  const candidate = { expected_generation: '3', target: { firing_version: '1' } };
  const receipt = {
    request_id: 'fixture',
    generation: '4',
    actor_id: 'operator-a',
    recorded_at_ms: '1',
  };
  const attempts = [];
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(5000);
    await page.route('https://fleet.test:8443/**', async (route) => {
      const request = route.request();
      if (new URL(request.url()).pathname === command && request.method() === 'PUT') {
        attempts.push(request.postDataJSON());
        await route.fulfill({ json: receipt });
        return;
      }
      await route.fulfill({
        contentType: 'text/html',
        body: attempts.length
          ? '<p>Recorded generation 4 by operator-a</p>'
          : `<button>Review retry for latitude-spike</button>
             <p>Expected generation 3</p>
             <button id="confirm">Confirm retry</button>
             <script>
             const confirmButton = document.querySelector('#confirm');
             confirmButton.onclick = async () => {
               const response = await fetch('${command}', {
                 method: 'PUT',
                 body: '${JSON.stringify({ operation: 'retry', ...candidate })}',
               });
               await response.json();
               location.reload();
             };
             </script>`,
      });
    });
    // Wait for the UI's document replacement before returning the click to the harness.
    const getByRole = page.getByRole.bind(page);
    page.getByRole = (role, options) => {
      const button = getByRole(role, options);
      if (options.name === 'Confirm retry') {
        const click = button.click.bind(button);
        button.click = async () => {
          const loaded = page.waitForEvent('load');
          await click();
          await loaded;
        };
      }
      return button;
    };
    await recover(page, expect, candidate);
    const body = { operation: 'retry', ...candidate };
    assert.deepEqual(attempts, [body, body]);
  } finally {
    await browser.close();
  }
});
