import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { assertOwnership } from './installation.mjs';
import { digest } from './policy.mjs';
import { capture, run } from './process.mjs';
import { privateBytes, readCheckpoint } from './simulator-recovery.mjs';
import {
  establishedSocket,
  timingScenario,
  verifyTiming,
} from './simulator-timing-evidence.mjs';

const observer = `import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';const establishedSocket=${establishedSocket.toString()};console.log(JSON.stringify(establishedSocket(readFileSync('/proc/net/tcp','utf8'))));`;

/** Observe actual socket identities in the producer's network namespace without recording traffic or private inputs. */
async function pacedProducer(site, path, mode) {
  assertOwnership(site);
  const docker = (args, options) =>
    run('docker', ['--context', site.docker, ...args], options);
  const name = `${site.project}-timing-${mode}`;
  const owned = () => {
    const labels = JSON.parse(
      docker(['inspect', '--format', '{{json .Config.Labels}}', name]),
    );
    assert.equal(labels['com.fleetiq.deploy.owner'], site.owner.id);
    assert.equal(labels['com.docker.compose.project'], site.project);
  };
  const state = () =>
    JSON.parse(docker(['inspect', '--format', '{{json .State}}', name]));
  const started = process.hrtime.bigint();
  const elapsed = () => Number(process.hrtime.bigint() - started) / 1000000;
  const deadline = mode === 'idle' ? 100000 : 380000;
  const samples = [];
  try {
    site.compose(
      [
        'run',
        '--detach',
        '--no-deps',
        '-T',
        '--name',
        name,
        '--volume',
        `${path}:/run/timing`,
        'simulator',
        'run',
        '--config',
        '/run/timing/config.json',
      ],
      { timeout: 30000 },
    );
    owned();
    while (state().Running) {
      assert(elapsed() < deadline, 'Real-time qualification deadline exceeded');
      try {
        const socket = JSON.parse(
          docker(
            [
              'exec',
              name,
              '/usr/local/bin/node',
              '--input-type=module',
              '-e',
              observer,
            ],
            { timeout: 10000 },
          ),
        );
        samples.push({ atMs: elapsed(), socket });
      } catch (error) {
        // A completed producer may exit between inspection and exec; all other observation failures remain fatal.
        if (state().Running) throw error;
        break;
      }
      await new Promise((done) => setTimeout(done, 1000));
    }
    const elapsedMs = elapsed();
    assert.equal(state().ExitCode, 0);
    const { stdout } = capture('docker', ['--context', site.docker, 'logs', name], {
      timeout: 10000,
    });
    const receipt = JSON.parse(stdout.trim());
    assert.equal(receipt.status, 'acknowledged');
    return verifyTiming(mode, {
      samples,
      elapsedMs,
      acknowledged: receipt.recordCount,
    });
  } finally {
    if (docker(['ps', '--all', '--quiet', '--filter', `name=^${name}$`])) {
      owned();
      docker(['rm', '--force', name]);
    }
  }
}

/** Both real production deadlines must recover and expose all source evidence before the parent resets its owned installation. */
export async function qualifyTiming(site, config, browser, expected) {
  const evidence = {};
  for (const mode of ['idle', 'lifetime']) {
    const fixture = timingScenario(config, mode),
      path = resolve(site.path, `timing-${mode}`);
    assertOwnership(site);
    mkdirSync(path, { mode: 0o700 });
    for (const [name, value] of Object.entries({
      config: fixture.config,
      route: fixture.route,
      profile: fixture.profile,
      scenario: fixture.scenario,
    }))
      writeFileSync(resolve(path, `${name}.json`), JSON.stringify(value), {
        mode: 0o600,
        flag: 'wx',
      });
    writeFileSync(
      resolve(path, 'identities.json'),
      privateBytes(resolve(site.path, 'demo-inputs/identities.json')),
      { mode: 0o600, flag: 'wx' },
    );
    const fingerprint = () =>
      digest(
        Buffer.concat(
          ['config', 'route', 'profile', 'scenario', 'identities'].map((name) =>
            privateBytes(resolve(path, `${name}.json`)),
          ),
        ),
      );
    const inputs = fingerprint();
    console.log(`simulator: real-${mode}-started`);
    evidence[mode] = await pacedProducer(site, path, mode);
    assert.equal(fingerprint(), inputs);
    const checkpoint = readCheckpoint(resolve(path, 'private-state'));
    assert.equal(checkpoint.captured, fixture.timestamps.length);
    assert.equal(checkpoint.acknowledged, fixture.timestamps.length);
    assert.equal(checkpoint.status, 'complete');
    assert.equal(checkpoint.pending, null);
    const result = await browser({
      ...expected,
      recovery: { timestamps: fixture.timestamps },
    });
    for (const check of ['recovered-source-history', 'matching-provenance'])
      assert(result.checks.includes(check));
    console.log(`simulator: real-${mode}-history-verified`);
  }
  return { ...evidence, history: true };
}
