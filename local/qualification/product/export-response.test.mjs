import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { chromium, expect } from '@playwright/test';
import { qualifyExport } from './lifecycle.mjs';

// Synthetic HTTP and UI only: no product identities, credentials or captured provider data.
test('export qualification survives a UI-consumed response removed from the CDP body cache', {
  timeout: 30000,
}, async () => {
  const tenant = '/api/v1/tenants/fixture';
  const coverage = {
    scope: 'hot_snapshot',
    manifest_id: null,
    restore_generation: null,
  };
  const bytes = Buffer.from('PAR1fixturePAR1');
  let puts = 0;
  const job = {
    export_id: '7',
    state: 'ready',
    row_count: 1,
    file_bytes: String(bytes.length),
    coverage,
  };
  const html = `<section aria-label="Historical export">
    <button id="request">Request export</button>
    <button id="refresh" hidden>Refresh export status</button>
    <button id="download" hidden>Download export</button>
    </section><script>
    const base = '${tenant}';
    request.hidden = HAS_EXPORT; refresh.hidden = !HAS_EXPORT; download.hidden = !HAS_EXPORT;
    request.onclick = async () => {
      const controller = new AbortController();
      const response = await fetch(base + '/exports/requests/fixture', {method:'PUT',signal:controller.signal});
      const job = await response.json();
      controller.abort();
      window.receiptConsumed = true;
      request.hidden = true; refresh.hidden = false; download.hidden = job.state !== 'ready';
    };
    refresh.onclick = async () => {
      const job = await (await fetch(base + '/exports/jobs/7')).json();
      download.hidden = job.state !== 'ready';
    };
    download.onclick = () => {
      const link = document.createElement('a');
      link.href = base + '/exports/jobs/7/download'; link.download = 'fleetiq-export-7.parquet'; link.click();
    };
    </script>`;
  const server = createServer((req, res) => {
    if (req.url === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      return res.end(html.replaceAll('HAS_EXPORT', String(puts > 0)));
    }
    if (req.url === `${tenant}/exports/jobs/7/download`) {
      res.writeHead(200, {
        'Content-Type': 'application/vnd.apache.parquet',
        'Content-Length': bytes.length,
        'Content-Disposition': 'attachment; filename="fleetiq-export-7.parquet"',
      });
      return res.end(bytes);
    }
    if (req.url === `${tenant}/exports/requests/fixture` && req.method === 'PUT')
      puts++;
    else if (req.url !== `${tenant}/exports/jobs/7`) {
      res.writeHead(404);
      return res.end();
    }
    res.writeHead(req.method === 'PUT' ? 202 : 200, {
      'Content-Type': 'application/json',
    });
    res.end(JSON.stringify(job));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    page.setDefaultTimeout(5000);
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    // Hold action completion through a document lifecycle boundary after the UI consumes JSON.
    // The real export survives reload; the CDP response body does not. HTTP is never replayed.
    const observed = new Proxy(page, {
      get(target, key) {
        if (key !== 'getByRole') {
          const value = target[key];
          return typeof value === 'function' ? value.bind(target) : value;
        }
        return (...args) => {
          const region = target.getByRole(...args);
          return new Proxy(region, {
            get(locator, property) {
              if (property !== 'getByRole') {
                const value = locator[property];
                return typeof value === 'function' ? value.bind(locator) : value;
              }
              return (role, options) => {
                const button = locator.getByRole(role, options);
                if (options?.name !== 'Request export') return button;
                return new Proxy(button, {
                  get(control, method) {
                    if (method === 'click')
                      return async () => {
                        await control.click();
                        await page.waitForFunction(
                          () => window.receiptConsumed === true,
                        );
                        await page.reload();
                        await expect(
                          page.getByRole('button', { name: 'Refresh export status' }),
                        ).toBeVisible();
                      };
                    const value = control[method];
                    return typeof value === 'function' ? value.bind(control) : value;
                  },
                });
              };
            },
          });
        };
      },
    });
    assert.equal(
      await qualifyExport({ page: observed, expect, tenant, coverage }),
      `${tenant}/exports/jobs/7`,
    );
    assert.equal(
      puts,
      1,
      'The UI mutation must not be replayed to replace its inaccessible body',
    );
  } finally {
    await browser?.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
