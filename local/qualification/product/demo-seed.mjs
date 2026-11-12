import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import {
  initializeDemoSeed,
  loadDemoSeed,
  reconcileDemoSeed,
} from '../../../tools/demo-seed.mjs';
import { demoSeedRequest } from '../../demo/seed.mjs';

/** Exercise the real authenticated API; scratch metadata never substitutes for the product fixture's device sender. */
export async function qualifyDemoSeed(page) {
  const directory = mkdtempSync('/tmp/fleetiq-owned-demo-');
  try {
    const artifact = readFileSync('/artifacts/teltonika.wasm');
    const identityFingerprint = createHash('sha256')
      .update('disposable-qualified-operator-a')
      .digest('hex');
    const request = (path, options) =>
      demoSeedRequest(page, path, options, 'https://fleet.test:8443');
    initializeDemoSeed(directory, {
      actorId: 'operator-a',
      identityFingerprint,
      artifact,
      deviceCount: 2,
    });
    let interrupted = false;
    await assert.rejects(
      reconcileDemoSeed(directory, {
        identityFingerprint,
        artifact,
        request: async (path, options) => {
          const result = await request(path, options);
          if (
            !interrupted &&
            options?.method === 'PUT' &&
            path.includes('/protocol-routes/')
          ) {
            assert.equal(result.status, 200);
            interrupted = true;
            throw new Error('Simulated lost committed route response');
          }
          return result;
        },
      }),
      (error) => {
        if (!interrupted) throw error;
        return /Demo seed reconciliation failed/u.test(error.message);
      },
    );
    assert(interrupted, 'Real commissioning must reach its route commit');
    await reconcileDemoSeed(directory, { identityFingerprint, artifact, request });
    const before = readFileSync(`${directory}/seed/journal.json`);
    await reconcileDemoSeed(directory, { identityFingerprint, artifact, request });
    assert(
      readFileSync(`${directory}/seed/journal.json`).equals(before),
      'Replay must preserve every original receipt',
    );
    const state = loadDemoSeed(directory, { identityFingerprint, artifact });
    for (const device of state.devices) {
      const path = `/api/v1/tenants/${state.tenantId}/assets/${device.deviceId}/protocol-routes/teltonika-tcp`;
      const route = await request(path);
      assert.equal(route.status, 200);
      assert.equal(route.body.revision, 1);
      assert(route.body.device_asset_id === device.deviceId);
      assert.equal(route.body.selection.world, 'identity-v1');
      assert.equal(
        (await request(`/api/v1/tenants/tenant-b/assets/${device.deviceId}/device`))
          .status,
        403,
      );
    }
    // Even identical selection under a new revision is operator drift, never a seed reset.
    const routePath = `/api/v1/tenants/${state.tenantId}/assets/${state.devices[0].deviceId}/protocol-routes/teltonika-tcp`;
    const route = (await request(routePath)).body;
    assert.equal(
      (
        await request(routePath, {
          method: 'PUT',
          body: { expected_revision: 1, selection: route.selection },
        })
      ).body.revision,
      2,
    );
    await assert.rejects(
      reconcileDemoSeed(directory, { identityFingerprint, artifact, request }),
      /Demo seed reconciliation failed/,
    );
    assert.equal((await request(routePath)).body.revision, 2);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
