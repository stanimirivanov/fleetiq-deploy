import assert from 'node:assert/strict';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { scanPlatformSource } from './demo-dev-platform-scan.mjs';
import { pipelineServices } from './pipeline.mjs';
import { digest, lock, ownedPath } from './policy.mjs';
import { capture, root, run } from './process.mjs';

export const uiDevelopmentRevision = 'b2169ee30bc516cb5bdb79f4506a7a51970db0af';
const repository = (role) =>
  `https://github.com/stanimirivanov/fleetiq-${role === 'ui' ? 'ui' : 'platform'}.git`;

/** Admit only an explicitly prepared isolated clone; staged/working edits are retained, never reset. */
export function developmentSource(
  role,
  {
    base = root,
    minimum = role === 'ui' ? uiDevelopmentRevision : lock.sources.platform.commit,
  } = {},
) {
  let stage = 'paths';
  try {
    assert(['ui', 'platform'].includes(role));
    assert(process.getuid() > 0, 'Development sources require a nonroot owner');
    assert.equal(realpathSync(base), resolve(base));
    const parent = ownedPath(base, resolve(base, '.local/dev-sources'));
    assert.equal(parent, resolve(base, '.local/dev-sources'));
    const path = ownedPath(parent, resolve(parent, role));
    assert.equal(path, resolve(parent, role));
    assert.equal(lstatSync(path).uid, process.getuid());
    assert.equal(lstatSync(path).mode & 0o022, 0);
    assert(lstatSync(ownedPath(path, resolve(path, '.git'))).isDirectory());
    stage = 'metadata';
    const git = (...args) =>
      run('git', ['-c', 'core.fsmonitor=false', '-C', path, ...args]);
    assert.equal(git('remote', 'get-url', 'origin'), repository(role));
    const revision = git('rev-parse', 'HEAD');
    assert.match(revision, /^[a-f0-9]{40}$/u);
    assert.match(minimum, /^[a-f0-9]{40}$/u);
    stage = 'ancestry';
    git('merge-base', '--is-ancestor', minimum, 'HEAD');
    stage = 'untracked';
    assert.equal(
      git('ls-files', '--others', '--exclude-standard'),
      '',
      'Stage new source files explicitly',
    );
    stage = 'ignored';
    const ignored = git(
      'ls-files',
      '--others',
      '--ignored',
      '--exclude-standard',
      '--directory',
      '-z',
    )
      .split('\0')
      .filter(Boolean);
    const allowed =
      role === 'ui'
        ? [
            'node_modules/',
            'apps/web/node_modules/',
            'apps/web-e2e/node_modules/',
            'apps/web/dist/',
            'apps/web/coverage/',
          ]
        : ['target/'];
    assert(
      ignored.every((name) => allowed.includes(name)),
      'Unexpected ignored source input',
    );
    stage = 'files';
    const files = git('ls-files', '-z').split('\0').filter(Boolean).sort();
    assert(files.length > 0 && files.length <= 10000);
    let bytes = 0;
    const fingerprints = files.map((file) => {
      assert(
        !/(?:^|\/)(?:\.env(?:\..*)?|\.gitmodules|.*\.(?:pem|key|p12))$/iu.test(file) ||
          file.endsWith('/.env.example') ||
          file === '.env.example',
      );
      const full = ownedPath(path, resolve(path, file));
      assert.equal(full, resolve(path, file));
      const stat = lstatSync(full);
      assert(
        stat.isFile() &&
          stat.nlink === 1 &&
          stat.uid === process.getuid() &&
          stat.size <= 8 * 1024 * 1024,
      );
      bytes += stat.size;
      assert(bytes <= 128 * 1024 * 1024);
      return [file, digest(readFileSync(full))];
    });
    assert.equal(realpathSync(path), path);
    return {
      role,
      path,
      revision,
      files,
      fingerprints,
      fingerprint: digest(JSON.stringify({ role, revision, fingerprints })),
    };
  } catch {
    throw new Error(
      `Invalid development source (${stage}); use an owned isolated clone with the reviewed ancestor, stage new files and remove private inputs`,
    );
  }
}

/** A development marker is independent of revision/packaging labels; it can never authorize a reviewed release. */
export function validateDevelopmentImage(image, source) {
  assert.equal(source.role, 'platform');
  assert.match(image.Id, /^sha256:[a-f0-9]{64}$/u);
  assert.equal(image.Os, 'linux');
  assert.equal(image.Architecture, 'amd64');
  assert.equal(image.Config.User, '10001:10001');
  assert.equal(image.Config.Labels['com.fleetiq.development'], source.fingerprint);
  assert.equal(
    image.Config.Labels['org.opencontainers.image.revision'],
    source.revision,
  );
  assert.equal(
    image.Config.Labels['org.opencontainers.image.source'],
    repository('platform'),
  );
  return image.Id;
}

/** Replace the whole backend process/ABI family while keeping database, identity and queue mounts intact. */
export function developmentRecipe(reviewed, image) {
  const model = structuredClone(reviewed);
  for (const name of ['backend', ...pipelineServices]) {
    assert(model.services[name], 'Missing matching executor');
    model.services[name].image = image;
  }
  model.services.backend.command = ['serve', '--check-schema'];
  return model;
}

/** Build/admit first; retain the recovery recipe before stopping any process. Failure never falls through. */
export async function transitionDevelopment(role, operations) {
  assert(['ui', 'backend', 'reviewed'].includes(role));
  await operations.owned();
  if (role !== 'reviewed') {
    await operations.build();
    await operations.admit();
  }
  await operations.retain();
  await operations.stop();
  await operations.apply();
  await operations.start();
}

/** Each source retains its existing reviewed, exact fixture classifications.
 * Scanner code/policy and package controls must still match the reviewed UI commit.
 * Platform scanning executes its immutable upstream wrapper. Deployment policy gets no new exception.
 */
export async function developmentSecretCheck(source, options) {
  if (source.role !== 'ui') return scanPlatformSource(source, options);
  assertReviewedScanner(source);
  const executable = resolve(root, 'target/tools/gitleaks/gitleaks');
  assert.equal(run(executable, ['version']), '8.30.1');
  const { checkSecrets: checkUiSecrets } = await import(
    pathToFileURL(resolve(source.path, 'tools/security/secrets.mjs')).href
  );
  return checkUiSecrets(source.path, {
    detector: { executable, version: '8.30.1' },
    environment: { PATH: process.env.PATH },
  });
}

/** Compare immutable Git blob bytes; user diff drivers cannot hide changed scanner code. */
export function assertReviewedScanner(
  source,
  { revision = uiDevelopmentRevision } = {},
) {
  assert.match(revision, /^[a-f0-9]{40}$/u);
  const files = run('git', [
    '-c',
    'core.fsmonitor=false',
    '-C',
    source.path,
    'ls-tree',
    '-r',
    '--name-only',
    revision,
    '--',
    'tools/security',
    'tools/docs/source.mjs',
    'tools/sensors/entrypoint.mjs',
    'package.json',
    'pnpm-lock.yaml',
    'pnpm-workspace.yaml',
  ])
    .split('\n')
    .filter(Boolean);
  assert(files.length > 0);
  for (const file of files) {
    const target = ownedPath(source.path, resolve(source.path, file));
    assert.equal(target, resolve(source.path, file));
    const original = capture(
      'git',
      ['-C', source.path, 'cat-file', 'blob', `${revision}:${file}`],
      { encoding: null },
    ).stdout;
    assert(
      readFileSync(target).equals(original),
      'Development scanner controls differ from reviewed UI',
    );
  }
}

/** A retained pending recipe is recovery state, not permission to mix a new mode into partially replaced processes. */
export function assertDevelopmentTransition(state, command) {
  assert(['ui', 'backend', 'reviewed'].includes(state.target));
  assert(['pending', 'ready'].includes(state.status));
  assert(
    command === 'reviewed' || state.status === 'ready',
    'Return to reviewed mode after an interrupted transition',
  );
}

/** Reviewed rollback rebuilds from the bound reviewed baseline, never an interrupted development recipe. */
export function admitDevelopmentState(retained, binding, command) {
  for (const key of Object.keys(binding))
    assert.equal(retained[key], binding[key], 'Foreign development state');
  if (command === 'reviewed') return structuredClone(binding);
  assertDevelopmentTransition(retained, command);
  return retained;
}
