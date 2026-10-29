import { createHash } from 'node:crypto';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { lock } from './policy.mjs';
import { run } from './process.mjs';

if (process.platform !== 'linux' || process.arch !== 'x64')
  throw new Error('This installer supports Linux x64.');
const directory = join(homedir(), '.docker', 'cli-plugins');
const response = await fetch(
  `https://github.com/docker/compose/releases/download/v${lock.tools.compose}/docker-compose-linux-x86_64`,
  { signal: AbortSignal.timeout(120_000) },
);
if (!response.ok) throw new Error('Official Compose download failed');
const bytes = Buffer.from(await response.arrayBuffer());
if (
  createHash('sha256').update(bytes).digest('hex') !==
  'db1889184726840f75c4f9c001048430d4f25b3be3cb084d3ddd762bc0aed576'
)
  throw new Error('Compose checksum mismatch');
await mkdir(directory, { recursive: true });
const pending = join(directory, 'docker-compose.pending');
await writeFile(pending, bytes, { mode: 0o755 });
if (run(pending, ['version', '--short']) !== lock.tools.compose)
  throw new Error('Compose version mismatch');
await rename(pending, join(directory, 'docker-compose'));
console.log('Installed reviewed Compose 5.5.1');
