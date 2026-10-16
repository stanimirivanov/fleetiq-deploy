import assert from 'node:assert/strict';
import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { digest, lock, ownedPath, validateLock } from './policy.mjs';
import { root, run } from './process.mjs';

function sourceCache() {
  const local = resolve(root, '.local');
  if (existsSync(local)) ownedPath(root, local);
  mkdirSync(resolve(local, 'sources'), { recursive: true });
  return ownedPath(local, resolve(local, 'sources'));
}
export function validateSourceDirectory(cache, candidate) {
  const path = ownedPath(cache, candidate);
  const metadata = ownedPath(path, resolve(path, '.git'));
  assert(
    lstatSync(metadata).isDirectory(),
    'Use an isolated clone, not a linked working tree',
  );
  return path;
}
function checkOrigin(path, pin) {
  assert(
    run('git', ['-C', path, 'remote', 'get-url', 'origin']) === pin.repository,
    'Cached source origin differs from the reviewed repository',
  );
}
export function prepareSources() {
  validateLock();
  if (process.env.GITHUB_ACTIONS === 'true' && !process.env.GH_TOKEN)
    throw new Error(
      'Configure repository secret FLEETIQ_SOURCE_READ_TOKEN with platform contents:read access.',
    );
  const cache = sourceCache();
  for (const [name, pin] of Object.entries(lock.sources)) {
    const path = resolve(cache, name);
    if (existsSync(path)) validateSourceDirectory(cache, path);
    const auth = process.env.GH_TOKEN
      ? ['-c', 'credential.helper=', '-c', 'credential.helper=!gh auth git-credential']
      : [];
    if (!existsSync(path))
      run(
        'git',
        [...auth, 'clone', '--no-checkout', '--filter=blob:none', pin.repository, path],
        { timeout: 300_000 },
      );
    validateSourceDirectory(cache, path);
    checkOrigin(path, pin);
    assert(
      run('git', ['-C', path, 'status', '--porcelain']) === '',
      'Source checkout has local changes',
    );
    run('git', [...auth, '-C', path, 'fetch', '--depth', '1', 'origin', pin.commit], {
      timeout: 300_000,
    });
    run('git', ['-C', path, 'checkout', '--detach', pin.commit]);
    assert(
      run('git', ['-C', path, 'rev-parse', 'HEAD']) === pin.commit,
      'Source commit differs from the reviewed pin',
    );
    assert(
      !existsSync(resolve(path, '.gitmodules')),
      'Submodules need a separate source review',
    );
  }
}
export function validateSources() {
  validateLock();
  const cache = sourceCache();
  for (const [name, pin] of Object.entries(lock.sources)) {
    const path = validateSourceDirectory(cache, resolve(cache, name));
    checkOrigin(path, pin);
    assert(
      run('git', ['-C', path, 'rev-parse', 'HEAD']) === pin.commit,
      'Source commit differs from the reviewed pin',
    );
    assert(
      run('git', ['-C', path, 'status', '--porcelain']) === '',
      'Source checkout has local changes',
    );
    assert(
      run('git', [
        '-C',
        path,
        'ls-files',
        '--others',
        '--ignored',
        '--exclude-standard',
      ]) === '',
      'Ignored files may change the build context',
    );
    assert(!existsSync(resolve(path, '.gitmodules')), 'Submodules require review');
  }
}
export function packagingDigest() {
  return digest(
    [
      'local/artifacts.lock.json',
      'local/images/backend.Dockerfile',
      'local/images/backend.Dockerfile.dockerignore',
      'local/images/edge.Dockerfile',
      'local/images/edge.Dockerfile.dockerignore',
    ]
      .map((p) => readFileSync(resolve(root, p)))
      .join('\n'),
  );
}
export function buildImages(docker) {
  validateSources();
  for (const name of ['backend', 'edge']) {
    const source = name === 'backend' ? lock.sources.platform : lock.sources.ux;
    const args =
      name === 'backend'
        ? [
            '--build-arg',
            `RUST_IMAGE=${lock.images.rust}`,
            '--build-arg',
            `RUNTIME_IMAGE=${lock.images.runtime}`,
          ]
        : [
            '--build-arg',
            `NODE_IMAGE=${lock.images.node}`,
            '--build-arg',
            `EDGE_IMAGE=${lock.images.edge}`,
            '--build-arg',
            `PNPM_VERSION=${lock.tools.pnpm}`,
          ];
    run(
      'docker',
      [
        '--context',
        docker,
        'buildx',
        'build',
        '--load',
        '--file',
        `local/images/${name}.Dockerfile`,
        ...args,
        '--label',
        `org.opencontainers.image.revision=${source.commit}`,
        '--label',
        `org.opencontainers.image.source=${source.repository}`,
        '--label',
        `com.fleetiq.deploy.packaging=${packagingDigest()}`,
        '--iidfile',
        `.local/${name}.iid`,
        '--tag',
        `fleetiq-deploy-${name}:${source.commit.slice(0, 12)}`,
        `.local/sources/${name === 'backend' ? 'platform' : 'ux'}`,
      ],
      { timeout: 3_600_000, stdio: 'inherit' },
    );
  }
  writeFileSync(
    resolve(root, '.local/images.json'),
    `${JSON.stringify(
      {
        packaging: packagingDigest(),
        backend: readFileSync(resolve(root, '.local/backend.iid'), 'utf8').trim(),
        edge: readFileSync(resolve(root, '.local/edge.iid'), 'utf8').trim(),
      },
      null,
      2,
    )}\n`,
  );
}
export function imageInventory(docker) {
  const images = JSON.parse(readFileSync(resolve(root, '.local/images.json')));
  assert.equal(
    images.packaging,
    packagingDigest(),
    'Packaging changed: rebuild images',
  );
  for (const name of ['backend', 'edge']) {
    assert.match(images[name], /^sha256:[a-f0-9]{64}$/u);
    const [image] = JSON.parse(
      run('docker', ['--context', docker, 'image', 'inspect', images[name]]),
    );
    const source = name === 'backend' ? lock.sources.platform : lock.sources.ux;
    assert.equal(image.Id, images[name]);
    assert.equal(
      image.Config.Labels['org.opencontainers.image.revision'],
      source.commit,
    );
    assert.equal(
      image.Config.Labels['org.opencontainers.image.source'],
      source.repository,
    );
    assert.equal(image.Config.Labels['com.fleetiq.deploy.packaging'], images.packaging);
  }
  return images;
}
