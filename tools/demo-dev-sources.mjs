import assert from 'node:assert/strict';
import { existsSync, lstatSync, mkdirSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateDemoParents } from './demo.mjs';
import { uiDevelopmentRevision } from './demo-dev.mjs';
import { lock, ownedPath } from './policy.mjs';
import { root, run } from './process.mjs';

const selections = {
  ui: { ...lock.sources.ux, commit: uiDevelopmentRevision },
  platform: lock.sources.platform,
};
/** Read-only source authority for the disposable development witness; no checkout or code execution. */
export function developmentObjects(role) {
  assert(Object.hasOwn(selections, role));
  const parent = ownedPath(root, resolve(root, '.local/dev-objects'));
  const path = ownedPath(parent, resolve(parent, `${role}.git`));
  assert.equal(path, resolve(parent, `${role}.git`));
  assert.equal(realpathSync(path), path);
  assert.equal(lstatSync(path).uid, process.getuid());
  assert.equal(run('git', ['-C', path, 'rev-parse', '--is-bare-repository']), 'true');
  assert.equal(
    run('git', ['-C', path, 'remote', 'get-url', 'origin']),
    selections[role].repository,
  );
  run('git', ['-C', path, 'cat-file', '-e', `${selections[role].commit}^{commit}`]);
  return { path, ...selections[role] };
}

/** Network-only phase. Keep source-read credentials out of installs, builds and running applications. */
export function prepareDevelopmentSources() {
  validateDemoParents();
  const parent = resolve(root, '.local/dev-objects');
  if (existsSync(parent)) assert.equal(realpathSync(parent), parent);
  mkdirSync(parent, { recursive: true, mode: 0o700 });
  assert.equal(realpathSync(parent), parent);
  assert.equal(lstatSync(parent).uid, process.getuid());
  const auth = process.env.GH_TOKEN
    ? ['-c', 'credential.helper=', '-c', 'credential.helper=!gh auth git-credential']
    : [];
  for (const [role, pin] of Object.entries(selections)) {
    const path = resolve(parent, `${role}.git`);
    if (!existsSync(path))
      run('git', [...auth, 'clone', '--bare', pin.repository, path], {
        timeout: 300000,
      });
    assert.equal(realpathSync(path), path);
    assert.equal(run('git', ['-C', path, 'rev-parse', '--is-bare-repository']), 'true');
    assert.equal(
      run('git', ['-C', path, 'remote', 'get-url', 'origin']),
      pin.repository,
    );
    run('git', [...auth, '-C', path, 'fetch', 'origin', pin.commit], {
      timeout: 300000,
    });
    developmentObjects(role);
  }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    assert.equal(process.argv.length, 2);
    prepareDevelopmentSources();
    console.log(
      'Reviewed development source objects prepared; no developer checkout changed',
    );
  } catch {
    console.error(
      'Development source preparation incomplete; verify source read access and owned cache',
    );
    process.exitCode = 1;
  }
}
