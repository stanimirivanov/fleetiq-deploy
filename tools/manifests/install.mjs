import assert from 'node:assert/strict';
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { run } from '../process.mjs';
import {
  cacheDirectory,
  manifestTools,
  plainDirectory,
  sha256,
  toolsLock,
} from './toolchain.mjs';

async function download(url, checksum) {
  assert(
    /^https:\/\/(get\.helm\.sh|github\.com|raw\.githubusercontent\.com)\//u.test(url),
    'Unreviewed manifest download host',
  );
  const response = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  assert(response.ok, 'Reviewed manifest input download failed');
  const bytes = Buffer.from(await response.arrayBuffer());
  assert(
    bytes.length <= 128 * 1024 * 1024 && sha256(bytes) === checksum,
    'Manifest input checksum mismatch',
  );
  return bytes;
}

const destination = cacheDirectory();
const parent = await realpath(tmpdir());
const temporary = await mkdtemp(join(parent, 'fleetiq-manifest-install-'));
try {
  for (const [name, tool] of Object.entries(toolsLock.tools)) {
    const platform = tool.platforms[`${process.platform}-${process.arch}`];
    assert(platform, 'Manifest tool installer supports Linux/Windows x64');
    const directory = join(temporary, name);
    await mkdir(directory);
    const archive = join(directory, basename(new URL(platform.url).pathname));
    await writeFile(archive, await download(platform.url, platform.sha256));
    const members = run('tar', ['-tf', archive]).split(/\r?\n/u);
    assert(
      members.every(
        (entry) =>
          !entry.startsWith('/') && !entry.includes('..') && !entry.includes('\\'),
      ),
      'Unsafe archive member',
    );
    run('tar', ['-xf', archive, '-C', directory, platform.executable]);
    const bytes = await readFile(join(directory, platform.executable));
    assert.equal(
      sha256(bytes),
      platform.binarySha256,
      'Extracted executable checksum mismatch',
    );
    const file = join(destination, name + (process.platform === 'win32' ? '.exe' : ''));
    const pending = `${file}.pending`;
    await writeFile(pending, bytes, { mode: 0o755, flag: 'wx' });
    await chmod(pending, 0o755);
    await rename(pending, file);
    console.log(`Installed checksum-verified ${name} ${tool.version}`);
  }
  const schemas = join(destination, 'schemas');
  plainDirectory(schemas);
  for (const schema of toolsLock.schemas) {
    const pending = join(schemas, `${schema.file}.pending`);
    await writeFile(pending, await download(schema.url, schema.sha256), { flag: 'wx' });
    await rename(pending, join(schemas, schema.file));
  }
  manifestTools();
  console.log(
    'All pinned manifest tools and schemas verified; subsequent rendering is offline.',
  );
} finally {
  assert.equal(dirname(await realpath(temporary)), parent, 'Unsafe installer cleanup');
  assert(basename(temporary).startsWith('fleetiq-manifest-install-'));
  await rm(temporary, { recursive: true, force: true });
}
