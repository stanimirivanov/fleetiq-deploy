import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { chromium } from '@playwright/test';
import { qualifyInspection } from './inspect-response.mjs';

const path =
  '/api/v1/tenants/fixture/assets/asset/properties/value/versions/1/interpretations/7';
const selected = '?manifest_id=1&restore_generation=1';
const evidence = {
  interpretation: '7',
  source: { message_id: 'original' },
  value: { value: '111' },
};

// Synthetic local HTTP only. Neither browser bodies nor credentials enter artifacts.
for (const search of ['', selected]) {
  test(`Inspect verifies immutable evidence after its UI-consumed response leaves the CDP cache (${search ? 'restored' : 'hot'})`, {
    timeout: 30000,
  }, async () => {
    await fixture({ search }, async ({ page, click, requests, observed }) => {
      await qualifyInspection({ page, click, path, search, expected: evidence });
      await assert.rejects(
        observed().body(),
        /No resource with given identifier|No data found for resource|evicted from inspector cache/u,
      );
      assert.deepEqual(
        requests,
        ['GET', 'GET'],
        'One UI read and one immutable verification read; the Inspect action is not repeated',
      );
    });
  });
}
for (const [name, configuration] of [
  ['wrong restore selection', { search: '' }],
  ['denied read', { search: selected, status: 403 }],
  [
    'different immutable evidence',
    { search: selected, body: { ...evidence, source: { message_id: 'wrong' } } },
  ],
]) {
  test(`Inspect still rejects ${name}`, { timeout: 30000 }, async () => {
    await fixture(configuration, async ({ page, click }) => {
      await assert.rejects(
        qualifyInspection({ page, click, path, search: selected, expected: evidence }),
        assert.AssertionError,
      );
    });
  });
}

/** Evict CDP's response after the UI consumes JSON, before the action promise settles. */
async function fixture({ search, status = 200, body = evidence }, verify) {
  const requests = [];
  const server = createServer((request, response) => {
    if (request.url === '/') {
      response.writeHead(200, { 'Content-Type': 'text/html' });
      response.end(`<button id="inspect">Inspect</button><script>
        inspect.onclick = async () => {
          const controller = new AbortController();
          const response = await fetch(${JSON.stringify(path + search)}, {signal:controller.signal});
          await response.json(); controller.abort(); window.consumed=true;
        };
      </script>`);
      return;
    }
    if (request.url !== path + search) {
      response.writeHead(404);
      response.end();
      return;
    }
    requests.push(request.method);
    response.writeHead(status, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    });
    response.end(JSON.stringify(body));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  let browser, response;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    page.setDefaultTimeout(5000);
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    const observed = new Proxy(page, {
      get(target, key) {
        if (key === 'waitForResponse')
          return async (predicate) => {
            response = await target.waitForResponse(predicate);
            return response;
          };
        const value = target[key];
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    const click = async () => {
      await page.getByRole('button', { name: 'Inspect', exact: true }).click();
      await page.waitForFunction(() => window.consumed === true);
      await page.reload();
    };
    await verify({ page: observed, click, requests, observed: () => response });
  } finally {
    await browser?.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}
