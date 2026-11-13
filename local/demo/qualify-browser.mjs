import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { reconcileDemoBrowser } from './seed.mjs';

// Only the disposable qualification container receives this public-CA trust.
try {
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
  const settings = JSON.parse(readFileSync('/run/qualification/request.json', 'utf8'));
  const artifact = readFileSync('/run/input/teltonika.wasm');
  await reconcileDemoBrowser('/run/seed-parent', artifact, settings, {
    launchOptions: {
      args: [
        '--host-resolver-rules=MAP fleet.fleetiq.test 127.0.0.1, MAP issuer.fleetiq.test 127.0.0.1',
      ],
    },
  });
  console.log('demo-seed-qualified');
} catch {
  console.error('demo-seed-qualification-failed');
  process.exitCode = 1;
}
