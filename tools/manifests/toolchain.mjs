import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstatSync, mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { root, run } from '../process.mjs';

export const toolsLock = JSON.parse(
  readFileSync(new URL('./tools.lock.json', import.meta.url)),
);
export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

export function plainDirectory(directory) {
  try {
    const stat = lstatSync(directory);
    assert(
      stat.isDirectory() && !stat.isSymbolicLink(),
      'Linked manifest cache refused',
    );
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    mkdirSync(directory);
  }
  return directory;
}

/** Cache paths are repository-owned and must never traverse a junction or symlink. */
export function cacheDirectory() {
  let current = root;
  for (const fragment of ['target', 'tools', 'manifests']) {
    current = join(current, fragment);
    plainDirectory(current);
  }
  return current;
}

export function verifiedBytes(file, expected) {
  const stat = lstatSync(file);
  assert(
    stat.isFile() && !stat.isSymbolicLink(),
    'Manifest tool/schema must be a plain file',
  );
  const bytes = readFileSync(file);
  assert.equal(
    sha256(bytes),
    expected,
    'Manifest tool/schema checksum mismatch; reinstall reviewed inputs',
  );
  return bytes;
}

/** All validation is local after explicit installation. No PATH or network fallback. */
export function manifestTools() {
  assert.equal(toolsLock.format, 'fleetiq-manifest-tools.v1');
  assert.deepEqual(Object.keys(toolsLock.tools).sort(), [
    'helm',
    'kubeconform',
    'kustomize',
  ]);
  const directory = cacheDirectory();
  const result = {};
  for (const [name, tool] of Object.entries(toolsLock.tools)) {
    const platform = tool.platforms[`${process.platform}-${process.arch}`];
    assert(platform, 'Manifest tools support Linux/Windows x64; unsupported platform');
    const binary = resolve(
      directory,
      name + (process.platform === 'win32' ? '.exe' : ''),
    );
    verifiedBytes(binary, platform.binarySha256);
    assert.match(
      run(binary, tool.versionArgs),
      new RegExp(`^v?${tool.version.replaceAll('.', '\\.')}(?:$|[+\\s])`, 'u'),
    );
    result[name] = (args, options = {}) =>
      run(binary, args, {
        ...options,
        env: {
          ...process.env,
          KUBECONFIG: join(directory, 'unused-offline-kubeconfig'),
          HELM_PLUGINS: join(directory, 'no-plugins'),
          HELM_CONFIG_HOME: join(directory, 'helm-config'),
          HELM_CACHE_HOME: join(directory, 'helm-cache'),
          HELM_DATA_HOME: join(directory, 'helm-data'),
        },
      });
  }
  const schemas = join(directory, 'schemas');
  assert(!lstatSync(schemas).isSymbolicLink(), 'Linked schema directory refused');
  for (const schema of toolsLock.schemas)
    assertLocalReferences(
      JSON.parse(verifiedBytes(join(schemas, schema.file), schema.sha256)),
    );
  result.schemaLocation = join(
    schemas,
    '{{.ResourceKind}}_{{.ResourceAPIVersion}}.json',
  );
  return result;
}

/** Standalone schemas must not reintroduce network access through an external $ref. */
export function assertLocalReferences(value) {
  if (!value || typeof value !== 'object') return;
  if (Object.hasOwn(value, '$ref'))
    assert(
      typeof value.$ref === 'string' && value.$ref.startsWith('#'),
      'External schema reference refused',
    );
  for (const child of Object.values(value)) assertLocalReferences(child);
}
