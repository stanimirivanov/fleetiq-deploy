import { accessSync, constants, realpathSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * Discover the executable actually installed on PATH, including Corepack links.
 * Windows command shims are never passed to a shell: supported npm/Corepack
 * installs expose an adjacent JavaScript entry, or a native pnpm.exe instead.
 */
export function pnpmLaunchers(
  root,
  { environment = process.env, platform = process.platform } = {},
) {
  const directories = (environment.PATH ?? environment.Path ?? '')
    .split(path.delimiter)
    .filter(Boolean)
    .map((directory) => path.resolve(root, directory));
  const candidates = [
    environment.npm_execpath,
    ...directories.flatMap((directory) => [
      path.join(directory, platform === 'win32' ? 'pnpm.exe' : 'pnpm'),
      path.join(
        directory,
        'node_modules/pnpm',
        platform === 'win32' ? 'pnpm.exe' : 'pnpm',
      ),
      path.join(directory, 'node_modules/corepack/dist/pnpm.js'),
      path.join(directory, 'node_modules/pnpm/bin/pnpm.cjs'),
      path.join(directory, 'node_modules/pnpm/bin/pnpm.mjs'),
    ]),
  ];
  const launchers = new Map();
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      const canonical = realpathSync(path.resolve(root, candidate));
      if (!statSync(canonical).isFile()) continue;
      // Never interpret a cmd/PowerShell shim as JavaScript or enable shell:true.
      if (/\.(?:cmd|bat|ps1)$/iu.test(canonical)) continue;
      let launcher;
      if (/\.[cm]?js$/iu.test(canonical)) {
        launcher = { command: process.execPath, args: [canonical] };
      } else if (platform !== 'win32' || /\.exe$/iu.test(canonical)) {
        if (platform !== 'win32') accessSync(canonical, constants.X_OK);
        launcher = { command: canonical, args: [] };
      } else {
        continue;
      }
      launchers.set(JSON.stringify(launcher), launcher);
    } catch {
      // Stale PATH entries or broken symlinks are unavailable, never qualified.
    }
  }
  return [...launchers.values()];
}
