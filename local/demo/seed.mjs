import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parse } from 'yaml';
import {
  demoSeedFailurePhases,
  initializeDemoSeed,
  reconcileDemoSeed,
} from '../../tools/demo-seed.mjs';

const identity = parse(
  readFileSync(new URL('./identity.yaml', import.meta.url), 'utf8'),
);

/** Native same-origin cookie/Origin/CSRF requests; never install bearer or browser credentials. */
export async function demoSeedRequest(
  page,
  path,
  { method = 'GET', body, wasm = false } = {},
  origin = identity.browser,
) {
  try {
    assert.equal(new URL(page.url()).origin, origin);
    assert.match(path, /^\/api\/v1\/[A-Za-z0-9_./?=&%-]+$/u);
    assert(!path.includes('..') && path.length <= 8192);
    const artifactSha256 = wasm
      ? createHash('sha256').update(body).digest('hex')
      : undefined;
    return await page.evaluate(
      async ({ path, method, body, wasm, artifactSha256 }) => {
        const headers = {};
        if (method !== 'GET') headers['X-FleetIQ-CSRF'] = '1';
        if (wasm) headers['X-Artifact-Sha256'] = artifactSha256;
        if (body !== undefined)
          headers['Content-Type'] = wasm ? 'application/wasm' : 'application/json';
        const response = await fetch(path, {
          method,
          headers,
          credentials: 'same-origin',
          redirect: 'error',
          signal: AbortSignal.timeout(15000),
          ...(body === undefined
            ? {}
            : { body: wasm ? Uint8Array.from(body) : JSON.stringify(body) }),
        });
        const reader = response.body?.getReader(),
          chunks = [];
        let size = 0;
        if (reader)
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > 1048576) {
              await reader.cancel();
              throw new Error('Response exceeds bound');
            }
            chunks.push(value);
          }
        const bytes = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) {
          bytes.set(chunk, offset);
          offset += chunk.byteLength;
        }
        return {
          status: response.status,
          body: size ? JSON.parse(new TextDecoder().decode(bytes)) : null,
        };
      },
      { path, method, body: wasm ? [...body] : body, wasm, artifactSha256 },
    );
  } catch {
    throw new Error('Demo seed API unavailable');
  }
}

export function demoSeedFailureMessage(error) {
  const phase = demoSeedFailurePhases.includes(error?.phase)
    ? error.phase
    : 'preflight';
  return `Demo seed command failed at ${phase}; check owned identity, journal, bootstrap, artifact and HTTPS trust prerequisites`;
}

/** A new isolated browser session authenticates on every run; only private journal state survives. */
async function run(directory, artifact, settings) {
  const { chromium } = await import('@playwright/test');
  const browser = await chromium.launch({ headless: true });
  let page;
  try {
    const context = await browser.newContext({ serviceWorkers: 'block' });
    page = await context.newPage();
    page.setDefaultTimeout(30000);
    await page.goto(`${identity.browser}/assets`);
    await page.getByRole('link', { name: 'Sign in', exact: true }).click();
    for (let i = 0; i < 2; i++)
      await page
        .getByRole('button', {
          name: 'Continue as synthetic demo operator',
          exact: true,
        })
        .click();
    await page.waitForURL(`${identity.browser}/assets`);
    await reconcileDemoSeed(directory, {
      ...settings,
      artifact,
      request: (path, options) => demoSeedRequest(page, path, options),
    });
    const logout = await demoSeedRequest(page, '/api/v1/auth/logout', {
      method: 'POST',
    });
    assert.equal(logout.status, 204);
  } finally {
    await browser.close();
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    const [command, name, artifactPath, ...extra] = process.argv.slice(2);
    assert(
      ['init', 'reconcile'].includes(command) &&
        /^[a-z][a-z0-9-]{0,30}$/u.test(name) &&
        artifactPath &&
        extra.length === 0,
    );
    const { root } = await import('../../tools/process.mjs');
    const { loadDemoIdentity, preflightDemoIdentity } = await import(
      '../../tools/demo-identity.mjs'
    );
    const directory = resolve(root, '.local/demo-identities', name);
    const owned = loadDemoIdentity(directory);
    const settings = {
      actorId: `demo-${createHash('sha256').update(owned.subject).digest('hex').slice(0, 24)}`,
      identityFingerprint: createHash('sha256')
        .update(JSON.stringify(owned))
        .digest('hex'),
    };
    const path = resolve(artifactPath),
      stat = lstatSync(path);
    assert(
      stat.isFile() &&
        stat.uid === process.getuid() &&
        stat.size <= 8388608 &&
        realpathSync(path) === path,
    );
    const artifact = readFileSync(path);
    if (command === 'init') initializeDemoSeed(directory, { ...settings, artifact });
    else {
      await preflightDemoIdentity();
      await run(directory, artifact, settings);
    }
    console.log(`Demo seed ${command}: complete`);
  } catch (error) {
    console.error(demoSeedFailureMessage(error));
    process.exitCode = 1;
  }
}
