import assert from 'node:assert/strict';
import { closeSync, mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { completeSimulator } from '../local/demo/evidence.mjs';
import { completeFaults } from '../local/demo/fault-acceptance.mjs';
import { completeRecovery } from '../local/demo/recovery.mjs';
import { qualifyDemo } from './demo-qualification.mjs';
import { lock } from './policy.mjs';
import { CommandFailure } from './process.mjs';
import { qualifyFaults } from './simulator-faults.mjs';
import { prepareRecovery } from './simulator-recovery.mjs';
import { qualifyTiming } from './simulator-timing.mjs';
import { completeTiming } from './simulator-timing-evidence.mjs';

/** Compose may add status lines; only the reviewed simulator's terminal refusal and exit count. */
export function rejectedLogin(error, stderr) {
  return (
    error instanceof CommandFailure &&
    error.exitCode === 3 &&
    /(?:^|\n)(?:login-refused|connection-closed)\r?(?:\n|$)/u.test(stderr)
  );
}

/** Inspect only test-owned inputs, and let the existing lifecycle own all cleanup, including failure. */
export async function qualifySimulator() {
  let before,
    after,
    images,
    recovery,
    recovered,
    faultEvidence,
    timed,
    timingContext,
    expected,
    rejected = false;
  const base = await qualifyDemo({
    deviceCount: 2,
    afterSend: async ({ site, directory, scratch, browser }) => {
      images = {
        backend: site.model.services.backend.image,
        edge: site.model.services.edge.image,
      };
      const seed = JSON.parse(readFileSync(resolve(directory, 'seed/journal.json')));
      const config = JSON.parse(
        readFileSync(resolve(site.path, 'demo-inputs/config.json')),
      );
      const device = seed.devices[0];
      expected = {
        tenantId: seed.tenantId,
        actorId: seed.actorId,
        deviceId: device.deviceId,
        assetId: device.assetId,
        record: config.record,
      };
      before = await browser(expected);
      const path = resolve(scratch, 'rejected');
      mkdirSync(path, { mode: 0o700 });
      const imei = (device.imei[0] === '1' ? '2' : '1') + device.imei.slice(1);
      writeFileSync(
        resolve(path, 'identities.json'),
        JSON.stringify({ 'demo-device': imei }),
        { mode: 0o600 },
      );
      writeFileSync(
        resolve(path, 'config.json'),
        JSON.stringify({
          ...config,
          record: {
            ...config.record,
            timestampMs: String(BigInt(config.record.timestampMs) + 1n),
          },
        }),
        { mode: 0o600 },
      );
      const errorPath = resolve(scratch, 'rejection.stderr');
      const stderr = openSync(errorPath, 'wx', 0o600);
      try {
        site.compose(
          [
            'run',
            '--rm',
            '--no-deps',
            '-T',
            '--volume',
            `${path}:/run/rejected:ro`,
            'simulator',
            'run',
            '--config',
            '/run/rejected/config.json',
          ],
          { timeout: 30000, stdio: ['ignore', 'pipe', stderr] },
        );
      } catch (error) {
        rejected = rejectedLogin(error, readFileSync(errorPath, 'utf8'));
      } finally {
        closeSync(stderr);
      }
      assert(
        rejected,
        'Unregistered simulator identity was not rejected before acceptance',
      );
      after = await browser(expected);
      faultEvidence = await qualifyFaults(site, config, seed, browser);
      recovery = prepareRecovery(site, config, scratch);
      timingContext = { site, config };
    },
    afterRestart: async ({ browser }) => {
      recovered = await recovery.resume(browser, expected);
      timed = await qualifyTiming(
        timingContext.site,
        timingContext.config,
        browser,
        expected,
      );
    },
  });
  return {
    ...base,
    checks: [
      ...completeSimulator(base, before, after, rejected),
      ...completeRecovery(base, recovered),
      ...completeTiming(base, timed),
      ...completeFaults(base, faultEvidence),
    ],
    faultResources: faultEvidence.resources,
    timing: { idle: timed.idle, lifetime: timed.lifetime },
    sources: { platform: lock.sources.platform.commit, ui: lock.sources.ux.commit },
    images,
    identity: 'real-demo-oidc',
    ui: 'normal-compose',
    cleanup: 'passed',
  };
}
