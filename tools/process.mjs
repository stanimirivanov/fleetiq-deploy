import { spawnSync } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import { delimiter, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = fileURLToPath(new URL('../', import.meta.url));
export function run(program, args, options = {}) {
  const result = spawnSync(program, args, {
    cwd: root,
    encoding: 'utf8',
    timeout: 120_000,
    maxBuffer: 16 * 1024 * 1024,
    windowsHide: true,
    shell: false,
    ...options,
  });
  if (result.error || result.status !== 0) {
    // Child stderr may contain private configuration; never attach it to evidence.
    const phase =
      program === 'docker'
        ? `docker/${args.find((argument) => ['up', 'down', 'run', 'exec', 'inspect', 'config', 'info', 'ps', 'ls', 'cp', 'version', 'show', 'build'].includes(argument)) ?? 'preflight'}`
        : `${program} ${args[0] ?? ''}`;
    const outcome =
      result.error?.code ?? result.signal ?? result.status ?? 'unavailable';
    throw new Error(`Command failed: ${phase} (${outcome})`);
  }
  return result.stdout?.trim() ?? '';
}
export function pnpm(args, options) {
  // Invoke the actual JavaScript CLI, avoiding cmd.exe/PowerShell and .cmd
  // launching differences. pnpm 12 does not always provide npm_execpath.
  const candidates = [process.env.npm_execpath];
  for (const directory of (process.env.PATH ?? process.env.Path ?? '').split(
    delimiter,
  )) {
    for (const file of [
      'node_modules/pnpm/bin/pnpm.mjs',
      'node_modules/pnpm/bin/pnpm.cjs',
      'node_modules/corepack/dist/pnpm.js',
    ])
      candidates.push(resolve(directory, file));
    const command = resolve(directory, 'pnpm');
    if (existsSync(command)) candidates.push(realpathSync(command));
  }
  const executable = candidates.find(
    (path) =>
      ['pnpm.cjs', 'pnpm.mjs', 'pnpm.js'].some((name) => path?.endsWith(name)) &&
      existsSync(path),
  );
  if (!executable) throw new Error('The pinned pnpm JavaScript CLI is unavailable.');
  return run(process.execPath, [executable, ...args], options);
}
