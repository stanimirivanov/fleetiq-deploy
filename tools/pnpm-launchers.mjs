import { accessSync, constants, realpathSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * Discover the executable actually installed on PATH, including Corepack links.
 * Resolve JavaScript entries or executable Linux launchers without a shell.
 */
export function pnpmLaunchers(root, { environment = process.env } = {}) {
  const directories = (environment.PATH ?? environment.Path ?? '')
    .split(path.delimiter)
    .filter(Boolean)
    .map((directory) => path.resolve(root, directory));
  const candidates = [
    environment.npm_execpath,
    ...directories.flatMap((directory) => [
      path.join(directory, 'pnpm'),
      path.join(directory, 'node_modules/pnpm', 'pnpm'),
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
      // Reject shell shims rather than interpreting them as JavaScript.
      if (/\.(?:cmd|bat|ps1)$/iu.test(canonical)) continue;
      let launcher;
      if (/\.[cm]?js$/iu.test(canonical)) {
        launcher = { command: process.execPath, args: [canonical] };
      } else {
        accessSync(canonical, constants.X_OK);
        launcher = { command: canonical, args: [] };
      }
      launchers.set(JSON.stringify(launcher), launcher);
    } catch {
      // Stale PATH entries or broken symlinks are unavailable, never qualified.
    }
  }
  return [...launchers.values()];
}
