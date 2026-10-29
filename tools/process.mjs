import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { gitFailureCategory } from './git-diagnostics.mjs';
import { pnpmLaunchers } from './pnpm-launchers.mjs';

export const root = fileURLToPath(new URL('../', import.meta.url));
/** Safe metadata only: process output and credentials are never retained in errors. */
export class CommandFailure extends Error {
  constructor(phase, result, category) {
    const outcome =
      result.error?.code ?? result.signal ?? result.status ?? 'unavailable';
    super(`Command failed: ${phase} (${outcome}; ${category})`);
    this.name = 'CommandFailure';
    this.category = category;
    this.exitCode = result.status;
  }
}

function execute(program, args, options = {}) {
  const result = spawnSync(program, args, {
    cwd: root,
    encoding: 'utf8',
    timeout: 120_000,
    maxBuffer: 16 * 1024 * 1024,

    shell: false,
    ...options,
  });
  if (result.error || result.status !== 0) {
    // Child stderr may contain private configuration; never attach it to evidence.
    const phase =
      program === 'docker'
        ? `docker/${args.find((argument) => ['up', 'down', 'run', 'exec', 'inspect', 'config', 'info', 'ps', 'ls', 'cp', 'version', 'show', 'build'].includes(argument)) ?? 'preflight'}`
        : program === 'git'
          ? `git ${args.find((argument) => ['clone', 'fetch', 'checkout', 'remote', 'status', 'rev-parse', 'ls-files', 'init', 'config', 'add', 'commit', 'merge-base', 'archive', 'log'].includes(argument)) ?? 'operation'}`
          : `${program} ${args[0] ?? ''}`;
    const category =
      program === 'git'
        ? gitFailureCategory(result.stderr, result.error?.code)
        : 'command-failed';
    throw new CommandFailure(phase, result, category);
  }
  return result;
}
export function run(program, args, options = {}) {
  return execute(program, args, options).stdout?.trim() ?? '';
}
/** Private diagnostic capture. Callers must return only allowlisted projections;
 * never log or retain this object or attach it to an Error. Failures remain redacted.
 */
export function capture(program, args, options = {}) {
  const result = execute(program, args, options);
  return { stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}
/** Select only a launcher that actually reports the repository's exact pnpm pin. */
export function pinnedPnpm({ environment = process.env, execute = run } = {}) {
  const manifest = JSON.parse(
    readFileSync(new URL('../package.json', import.meta.url)),
  );
  const expected = /^pnpm@(\d+\.\d+\.\d+)$/u.exec(manifest.packageManager)?.[1];
  if (!expected) throw new Error('Invalid pnpm version pin');
  for (const launcher of pnpmLaunchers(root, { environment })) {
    try {
      if (
        execute(launcher.command, [...launcher.args, '--version'], {
          env: environment,
          timeout: 30_000,
        }) === expected
      )
        return launcher;
    } catch {
      // An unavailable, incompatible or broken launcher cannot qualify.
    }
  }
  throw new Error(
    'The pinned pnpm executable is unavailable; install the exact package including its native-executable setup.',
  );
}
export function pnpm(args, options) {
  const launcher = pinnedPnpm();
  return run(launcher.command, [...launcher.args, ...args], options);
}
