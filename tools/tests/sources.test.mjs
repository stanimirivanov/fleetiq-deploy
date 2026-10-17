import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { gitFailureCategory, sourceFailureGuidance } from '../git-diagnostics.mjs';
import { CommandFailure, run } from '../process.mjs';
import { materializeSource } from '../sources.mjs';

function fixture(context) {
  const folder = mkdtempSync(join(tmpdir(), 'fleetiq-source-checkout-'));
  context.after(() => {
    assert.equal(dirname(resolve(folder)), resolve(tmpdir()));
    assert(folder.includes('fleetiq-source-checkout-'));
    rmSync(folder, { recursive: true, force: true });
  });
  const repository = join(folder, 'origin');
  const cache = join(folder, 'cache');
  mkdirSync(repository);
  mkdirSync(cache);
  const git = (args) => run('git', args, { cwd: repository });
  git(['init', '--initial-branch=main']);
  git(['config', 'user.name', 'Source fixture']);
  git(['config', 'user.email', 'fixture@example.invalid']);
  git(['config', 'commit.gpgsign', 'false']);
  git(['config', 'core.hooksPath', join(folder, 'empty-hooks')]);
  writeFileSync(join(repository, '.gitattributes'), '* text=auto eol=lf\n');
  writeFileSync(join(repository, 'README.md'), 'Reviewed source\n');
  git(['add', 'README.md', '.gitattributes']);
  git(['commit', '-m', 'Reviewed source']);
  const commit = git(['rev-parse', 'HEAD']);
  writeFileSync(join(repository, 'README.md'), 'Unselected newer source\n');
  git(['add', 'README.md']);
  git(['commit', '-m', 'Newer source']);
  return { folder, repository, cache, commit };
}

test('fresh no-checkout clones reach the exact pin, repeat cleanly and preserve dirty existing source', (context) => {
  const { repository, cache, commit } = fixture(context);
  materializeSource(cache, 'platform', { repository, commit });
  const checkout = join(cache, 'platform');
  assert.equal(run('git', ['-C', checkout, 'rev-parse', 'HEAD']), commit);
  assert.equal(readFileSync(join(checkout, 'README.md'), 'utf8'), 'Reviewed source\n');
  materializeSource(cache, 'platform', { repository, commit });
  writeFileSync(join(checkout, 'README.md'), 'Preserve local edits\n');
  assert.throws(
    () => materializeSource(cache, 'platform', { repository, commit }),
    /local changes/u,
  );
  assert.equal(
    readFileSync(join(checkout, 'README.md'), 'utf8'),
    'Preserve local edits\n',
  );
});

test('Git diagnostics classify known failures without retaining secret-bearing child output', () => {
  const marker = 'private-fixture-diagnostic';
  const cases = [
    ['remote: Repository not found.', 'repository-access-unavailable'],
    ['fatal: Authentication failed', 'authentication-failed'],
    ['The requested URL returned error: 403', 'repository-access-unavailable'],
    ['fatal: not our ref 000000', 'revision-unavailable'],
    ['fatal: Could not resolve host: github.com', 'network-or-timeout'],
    [
      'SSL certificate problem: unable to get local issuer certificate',
      'tls-trust-failed',
    ],
    ['An unfamiliar Git failure', 'command-failed'],
  ];
  for (const [stderr, expected] of cases) {
    const result = { status: 128, stdout: marker, stderr: `${marker}\n${stderr}` };
    const category = gitFailureCategory(result.stderr);
    assert.equal(category, expected);
    const failure = new CommandFailure('git clone', result, category);
    assert.equal(failure.exitCode, 128);
    assert(
      ![
        failure.message,
        failure.stack,
        JSON.stringify(failure),
        sourceFailureGuidance[category],
      ].some((v) => v.includes(marker)),
    );
    assert(!('stderr' in failure) && !('stdout' in failure) && !('cause' in failure));
  }
  assert.equal(gitFailureCategory('', 'ENOENT'), 'tool-unavailable');
  assert.equal(gitFailureCategory('', 'ETIMEDOUT'), 'network-or-timeout');
});

test('real clone and revision failures identify source and operation without exposing child diagnostics', (context) => {
  const { repository, cache } = fixture(context);
  assert.throws(
    () => materializeSource(cache, 'ux', { repository, commit: 'f'.repeat(40) }),
    (error) =>
      error.message.includes(
        'Source ux: fetch failed (revision-unavailable; exit 128)',
      ) && !error.message.includes(repository),
  );
  assert.throws(
    () =>
      materializeSource(cache, 'platform', {
        repository: join(repository, 'absent-origin'),
        commit: 'f'.repeat(40),
      }),
    (error) =>
      error.message.includes(
        'Source platform: clone failed (repository-access-unavailable; exit 128)',
      ) &&
      error.message.includes('Contents:read') &&
      !error.message.includes(repository),
  );
});

// A filesystem clone ignores --filter; this real HTTP fixture exercises deferred blob downloads.
test('partial checkout uses the same ephemeral credentials as clone/fetch without persisting them', {
  timeout: 60000,
}, async (context) => {
  const { folder, repository, cache, commit } = fixture(context);
  const remote = join(folder, 'origin.git');
  run('git', ['clone', '--bare', repository, remote]);
  run('git', ['-C', remote, 'config', 'uploadpack.allowFilter', 'true']);
  const blob = run('git', ['-C', repository, 'rev-parse', `${commit}:README.md`]);
  const emptyConfig = join(folder, 'empty-git-config');
  writeFileSync(emptyConfig, '[http]\nproxy =\n');
  const env = {
    ...process.env,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: emptyConfig,
    GIT_TERMINAL_PROMPT: '0',
    GCM_INTERACTIVE: 'Never',
    NO_PROXY: '127.0.0.1,localhost',
    no_proxy: '127.0.0.1,localhost',
    FLEETIQ_TEST_GIT_PASSWORD: 'fixture',
  };
  const server = fork(
    new URL('./fixtures/authenticated-git.mjs', import.meta.url),
    [folder, blob],
    {
      env,
      execArgv: [],
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    },
  );
  const saved = new Map(
    Object.keys(env)
      .filter((key) =>
        [
          'GIT_CONFIG_NOSYSTEM',
          'GIT_CONFIG_GLOBAL',
          'GIT_TERMINAL_PROMPT',
          'GCM_INTERACTIVE',
          'NO_PROXY',
          'no_proxy',
          'FLEETIQ_TEST_GIT_PASSWORD',
        ].includes(key),
      )
      .map((key) => [key, process.env[key]]),
  );
  try {
    for (const key of saved.keys()) process.env[key] = env[key];
    const timeout = setTimeout(() => server.kill(), 45000);
    context.after(() => clearTimeout(timeout));
    const [message] = await once(server, 'message');
    const url = `http://127.0.0.1:${message.port}/origin.git`;
    // Git's documented shell-helper form uses only fixture environment values;
    // no credential is interpolated into argv and no extra Node process is needed.
    const auth = [
      '-c',
      'credential.helper=',
      '-c',
      String.raw`credential.helper=!f() { if test "$1" = get; then printf '%s\n' username=fixture "password=$FLEETIQ_TEST_GIT_PASSWORD"; fi; }; f`,
    ];
    // The same server proves the original boundary before exercising the production path.
    const control = join(cache, 'ux');
    run(
      'git',
      [...auth, 'clone', '--no-checkout', '--filter=blob:none', url, control],
      { timeout: 15000 },
    );
    run('git', [...auth, '-C', control, 'fetch', '--depth', '1', 'origin', commit], {
      timeout: 15000,
    });
    assert.throws(
      () =>
        run('git', ['-C', control, 'checkout', '--detach', commit], { timeout: 15000 }),
      (error) => error.category === 'authentication-failed',
    );
    materializeSource(cache, 'platform', { repository: url, commit }, auth);
    const checkout = join(cache, 'platform');
    assert.equal(
      readFileSync(join(checkout, 'README.md'), 'utf8'),
      'Reviewed source\n',
    );
    const config = readFileSync(join(checkout, '.git/config'), 'utf8');
    assert(config.includes('promisor = true'));
    assert(
      !config.includes(env.FLEETIQ_TEST_GIT_PASSWORD) &&
        !/\[credential(?:[ \]])/u.test(config),
    );
    const audit = JSON.parse(readFileSync(join(folder, 'audit.json')));
    assert(audit.filteredRequests > 0 && audit.blobRequests > 0 && audit.denied > 0);
  } catch (error) {
    console.error(
      'Loopback Git fixture counters:',
      readFileSync(join(folder, 'audit.json'), 'utf8'),
    );
    throw error;
  } finally {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    if (server.exitCode === null && server.signalCode === null) {
      const closed = once(server, 'close');
      server.kill();
      await closed;
    }
  }
});
