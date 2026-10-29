import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { ownedPath } from '../policy.mjs';
import { root, run } from '../process.mjs';
import { checkSecrets } from '../secrets.mjs';
import { validateSourceDirectory } from '../sources.mjs';

test('real process failure, absent executable and secret-bearing diagnostics remain distinct from success', () => {
  assert.equal(run(process.execPath, ['-e', 'process.stdout.write("ok")']), 'ok');
  for (const args of [
    [
      process.execPath,
      ['-e', 'process.stderr.write("private-test-value");process.exit(2)'],
    ],
    [resolve(root, '.local/fleetiq-intentionally-missing-command.exe'), []],
  ]) {
    assert.throws(
      () => run(...args),
      (error) =>
        !error.message.includes('private-test-value') &&
        error.message.includes('Command failed'),
    );
  }
});
test('real Gitleaks catches worktree, staged-only and removed historical material', () => {
  const repository = mkdtempSync(join(tmpdir(), 'fleetiq-deploy-secret-fixture-'));
  const git = (args) => run('git', args, { cwd: repository });
  try {
    git(['init', '--initial-branch=main']);
    git(['config', 'user.name', 'Deployment fixture']);
    git(['config', 'user.email', 'fixture@example.invalid']);
    git(['config', 'core.autocrlf', 'false']);
    git(['config', 'commit.gpgsign', 'false']);
    git(['config', 'core.hooksPath', join(repository, 'empty-hooks')]);
    writeFileSync(join(repository, 'README.md'), 'Clean fixture\n');
    git(['add', '.']);
    git(['commit', '-m', 'Clean fixture']);
    checkSecrets(undefined, repository);
    // Deliberately synthetic, assembled so the fixture source is not an allowlist.
    const value = `${['gh', 'p_'].join('')}aB7xY9mN2pQ4sT6vW8zK1cD3eF5gH0jLrUoI`;
    const candidate = join(repository, 'candidate.txt');
    writeFileSync(candidate, `credential=${value}\n`);
    assert.throws(() => checkSecrets(undefined, repository));
    git(['add', 'candidate.txt']);
    writeFileSync(candidate, 'Clean working copy\n');
    assert.throws(() => checkSecrets(undefined, repository));
    git(['commit', '-m', 'Synthetic historical fixture']);
    git(['add', 'candidate.txt']);
    git(['commit', '-m', 'Remove fixture value']);
    assert.throws(() => checkSecrets(undefined, repository));
    const base = git(['rev-parse', 'HEAD~1']);
    // Even when history is excluded, inline directives cannot suppress the source scan.
    writeFileSync(candidate, `credential=${value} # gitleaks:allow\n`);
    assert.throws(() => checkSecrets(base, repository));
  } finally {
    ownedPath(tmpdir(), repository);
    rmSync(repository, { recursive: true, force: true });
  }
});
test('owned path checks reject a symlink escape', async () => {
  const { symlinkSync } = await import('node:fs');
  const directory = mkdtempSync(join(tmpdir(), 'fleetiq-deploy-path-fixture-'));
  try {
    const child = join(directory, 'owned');
    mkdirSync(child);
    const outside = join(directory, 'outside');
    mkdirSync(outside);
    symlinkSync(outside, join(child, 'escape'), 'dir');
    assert.throws(() => ownedPath(child, join(child, 'escape')));
    assert.throws(() => validateSourceDirectory(child, join(child, 'escape')));
    const regular = join(child, 'regular');
    mkdirSync(join(regular, '.git'), { recursive: true });
    assert.doesNotThrow(() => validateSourceDirectory(child, regular));
    const linked = join(child, 'linked');
    mkdirSync(linked);
    writeFileSync(join(linked, '.git'), 'gitdir: ../../outside\n');
    assert.throws(() => validateSourceDirectory(child, linked));
  } finally {
    ownedPath(tmpdir(), directory);
    rmSync(directory, { recursive: true, force: true });
  }
});
