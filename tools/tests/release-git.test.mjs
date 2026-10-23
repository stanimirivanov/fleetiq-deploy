import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { ownedPath } from '../policy.mjs';
import { run } from '../process.mjs';
import { checkReleaseBoundaries } from '../releases/git-policy.mjs';

function checkout(context) {
  const folder = mkdtempSync(join(tmpdir(), 'fleetiq-release-git-'));
  context.after(() => {
    assert.equal(dirname(resolve(folder)), resolve(tmpdir()));
    ownedPath(tmpdir(), folder);
    rmSync(folder, { recursive: true, force: true });
  });
  const upstream = join(folder, 'upstream');
  const repository = join(folder, 'publisher');
  mkdirSync(upstream);
  mkdirSync(repository);
  const git = (args, cwd = repository) => run('git', args, { cwd });
  git(['init', '--initial-branch=main'], upstream);
  for (const [key, value] of [
    ['user.name', 'Release fixture'],
    ['user.email', 'fixture@example.invalid'],
    ['commit.gpgsign', 'false'],
    ['core.hooksPath', join(folder, 'empty-hooks')],
  ])
    git(['config', key, value], upstream);
  writeFileSync(join(upstream, 'README.md'), 'Reviewed package source\n');
  git(['add', 'README.md'], upstream);
  git(['commit', '-m', 'Reviewed package source'], upstream);
  const base = git(['rev-parse', 'HEAD'], upstream);
  git(['init', '--initial-branch=fixture-unused']);
  git(['remote', 'add', 'origin', upstream]);
  git(['fetch', 'origin', '+refs/heads/main:refs/remotes/origin/main']);
  git(['checkout', '--detach', base]);
  for (const [key, value] of [
    ['user.name', 'Release fixture'],
    ['user.email', 'fixture@example.invalid'],
    ['commit.gpgsign', 'false'],
    ['core.hooksPath', join(folder, 'empty-hooks')],
  ])
    git(['config', key, value]);
  return { repository, git, base };
}

test('detached publisher uses fetched origin/main without a local main branch', (context) => {
  const { repository, git } = checkout(context);
  assert.throws(() => git(['symbolic-ref', '--quiet', 'HEAD']));
  assert.throws(() => git(['show-ref', '--verify', 'refs/heads/main']));
  assert.deepEqual(checkReleaseBoundaries('refs/remotes/origin/main', repository), {
    sourceGraphs: {
      environments: [],
      graphDigest:
        'sha256:4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945',
      resources: 0,
    },
    activation: 'not-performed',
    candidateMergeActivates: false,
  });
  assert.deepEqual(checkReleaseBoundaries(null, repository), {
    sourceGraphs: {
      environments: [],
      graphDigest:
        'sha256:4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945',
      resources: 0,
    },
    activation: 'not-performed',
    candidateMergeActivates: false,
  });
});

test('detached release checks reject untracked, staged and committed activation changes', (context) => {
  const { repository, git } = checkout(context);
  mkdirSync(join(repository, 'releases/active'), { recursive: true });
  writeFileSync(join(repository, 'releases/active/local.json'), '{}\n');
  const check = () => checkReleaseBoundaries(null, repository);
  assert.throws(check, /cannot write active/u);
  git(['add', 'releases/active/local.json']);
  assert.throws(check, /cannot write active/u);
  git(['commit', '-m', 'Forbidden activation fixture']);
  // Comparing against HEAD instead of the fetched base would conceal this edit.
  assert.throws(check, /cannot write active/u);
});

test('missing remote and invalid or unrelated bases fail without an implicit HEAD fallback', (context) => {
  const { repository, git, base } = checkout(context);
  const foreign = git(['commit-tree', `${base}^{tree}`, '-m', 'Unrelated fixture']);
  assert.throws(() => checkReleaseBoundaries(foreign, repository), /ancestor/u);
  assert.throws(() => checkReleaseBoundaries('f'.repeat(40), repository), /ancestor/u);
  assert.throws(() => checkReleaseBoundaries('HEAD', repository), /Untrusted/u);
  git(['update-ref', '-d', 'refs/remotes/origin/main']);
  assert.throws(() => checkReleaseBoundaries(null, repository), /ancestor/u);
  assert.equal(checkReleaseBoundaries(base, repository).activation, 'not-performed');
});
