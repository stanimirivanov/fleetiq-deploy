import assert from 'node:assert/strict';
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
  return { repository, cache, commit };
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
