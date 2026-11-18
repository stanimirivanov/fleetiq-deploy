import assert from 'node:assert/strict';
import {
  closeSync,
  constants,
  fstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { resolve } from 'node:path';
import { recoveryScenario } from '../local/demo/recovery.mjs';
import { assertOwnership } from './installation.mjs';
import { digest } from './policy.mjs';
import { CommandFailure, run } from './process.mjs';

/** Opens only owned private regular files, never symlinks, devices or oversized captures. */
function privateBytes(path) {
  const fd = openSync(
    path,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    const stat = fstatSync(fd);
    assert(
      stat.isFile() &&
        stat.uid === process.getuid() &&
        stat.nlink === 1 &&
        (stat.mode & 0o777) === 0o600 &&
        stat.size <= 17000000,
    );
    return readFileSync(fd);
  } finally {
    closeSync(fd);
  }
}

/** Verifies the simulator's persisted checksum before any counters become qualification evidence. */
export function readCheckpoint(directory) {
  const envelope = JSON.parse(privateBytes(resolve(directory, 'checkpoint.json')));
  assert.equal(typeof envelope.body, 'string');
  assert.equal(digest(Buffer.from(envelope.body)), envelope.checksum);
  const body = JSON.parse(envelope.body);
  assert(
    Number.isSafeInteger(body.captured) && Number.isSafeInteger(body.acknowledged),
  );
  assert(body.acknowledged >= 0 && body.captured >= body.acknowledged);
  assert(
    Array.isArray(body.records) &&
      body.records.length === body.captured - body.acknowledged,
  );
  return body;
}

/** A qualification-only writable bind holds synthetic captures; normal demo inputs remain sealed. */
export function prepareRecovery(site, config, scratch) {
  assertOwnership(site);
  const fixture = recoveryScenario(config),
    path = resolve(site.path, 'recovery');
  mkdirSync(path, { mode: 0o700 });
  for (const [name, value] of Object.entries({
    config: fixture.config,
    route: fixture.route,
    scenario: fixture.scenario,
    profile: fixture.profile,
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
        ['config', 'route', 'scenario', 'profile', 'identities'].map((name) =>
          privateBytes(resolve(path, `${name}.json`)),
        ),
      ),
    );
  const inputs = fingerprint(),
    identity = digest(privateBytes(resolve(site.path, 'demo-inputs/identities.json')));
  const checkpoint = resolve(path, 'private-state');
  const execute = (command) => {
    assertOwnership(site);
    const name = `${site.project}-recovery`;
    const stderr = openSync(resolve(scratch, 'recovery.stderr'), 'w', 0o600);
    const stdout = openSync(resolve(scratch, 'recovery.stdout'), 'w', 0o600);
    try {
      site.compose(
        [
          'run',
          '--rm',
          '--no-deps',
          '-T',
          '--name',
          name,
          '--volume',
          `${path}:/run/recovery`,
          'simulator',
          command,
          '--config',
          '/run/recovery/config.json',
        ],
        { timeout: 30000, stdio: ['ignore', stdout, stderr] },
      );
      return readFileSync(resolve(scratch, 'recovery.stdout'), 'utf8').trim();
    } finally {
      closeSync(stdout);
      closeSync(stderr);
      const docker = (args) => run('docker', ['--context', site.docker, ...args]);
      if (docker(['ps', '--all', '--quiet', '--filter', `name=^${name}$`])) {
        const [container] = JSON.parse(docker(['inspect', name]));
        assert.equal(
          container.Config.Labels['com.fleetiq.deploy.owner'],
          site.owner.id,
        );
        assert.equal(
          container.Config.Labels['com.docker.compose.project'],
          site.project,
        );
        docker(['rm', '--force', name]);
      }
    }
  };
  site.compose(['stop', 'tcp-ingestion']);
  let refused = false;
  try {
    execute('run');
  } catch (error) {
    if (!(error instanceof CommandFailure)) throw error;
    refused =
      error.exitCode === 3 &&
      /(?:^|\n)(?:connection-closed|login-timeout|ack-timeout)\r?(?:\n|$)/u.test(
        readFileSync(resolve(scratch, 'recovery.stderr'), 'utf8'),
      );
  }
  assert(refused, 'Offline producer must fail without an acknowledgement');
  assert.equal(readFileSync(resolve(scratch, 'recovery.stdout'), 'utf8').trim(), '');
  const queued = readCheckpoint(checkpoint);
  assert.equal(queued.captured, 3);
  assert.equal(queued.acknowledged, 0);
  assert(typeof queued.pending === 'string' && queued.pending.length > 0);
  const retained = digest(privateBytes(resolve(checkpoint, 'checkpoint.json')));
  return {
    fixture,
    async resume(browser, expected) {
      assert.equal(fingerprint(), inputs);
      assert.equal(
        digest(privateBytes(resolve(site.path, 'demo-inputs/identities.json'))),
        identity,
      );
      assert.equal(
        digest(privateBytes(resolve(checkpoint, 'checkpoint.json'))),
        retained,
      );
      const receipt = { status: 'acknowledged', recordCount: 3 };
      assert.deepEqual(JSON.parse(execute('resume')), receipt);
      const done = readCheckpoint(checkpoint);
      assert.equal(done.captured, 3);
      assert.equal(done.acknowledged, 3);
      assert.equal(done.pending, null);
      const terminal = digest(privateBytes(resolve(checkpoint, 'checkpoint.json')));
      const settings = { ...expected, recovery: { timestamps: fixture.timestamps } };
      const before = await browser(settings);
      assert.deepEqual(JSON.parse(execute('resume')), receipt);
      assert.equal(
        digest(privateBytes(resolve(checkpoint, 'checkpoint.json'))),
        terminal,
      );
      const after = await browser(settings);
      for (const result of [before, after])
        assert(
          result.checks.includes('recovered-source-history') &&
            result.checks.includes('matching-provenance'),
        );
      assert.match(before.accepted, /^(?:0|[1-9][0-9]*)$/u);
      assert.equal(after.accepted, before.accepted);
      return {
        captured: 3,
        acknowledged: 3,
        pendingRetained: true,
        identityRetained: true,
        inputsRetained: true,
        history: true,
        completedResume: true,
      };
    },
  };
}
