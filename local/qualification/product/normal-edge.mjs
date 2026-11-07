import assert from 'node:assert/strict';
import { lookup } from 'node:dns/promises';
import { InstalledFleetPage } from './page.mjs';

export async function qualifyNormalEdge(chromium, expect, setStep) {
  const { address } = await lookup('normal-edge', { family: 4 });
  // Preserve the real issuer callback origin while connecting to the normal
  // edge rather than the published NGINX image on the same fixture network.
  const browser = await chromium.launch({
    headless: true,
    args: [`--host-resolver-rules=MAP fleet.test ${address}`],
  });
  try {
    const page = await browser.newPage();
    const ui = new InstalledFleetPage(page);
    await ui.signIn();
    setStep('normal-compose-inspector');
    const [document] = await Promise.all([
      page.waitForResponse(
        (response) =>
          response.request().isNavigationRequest() &&
          new URL(response.url()).pathname === '/assets/asset-secondary',
      ),
      ui.inspector('asset-secondary'),
    ]);
    assert.equal(document.status(), 200);
    assert.equal((await document.serverAddr())?.ipAddress, address);
    await expect(
      page.getByRole('region', { name: 'Hot property history', exact: true }),
    ).toContainText('515000300');
    await expect(
      page.getByRole('button', { name: 'Request restore', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Request export', exact: true }),
    ).toBeVisible();
  } finally {
    await browser.close();
  }
}
