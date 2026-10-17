import assert from 'node:assert/strict';
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { ownedPath } from './policy.mjs';
import { root, run } from './process.mjs';

export function checkSecrets(base = undefined, repository = root) {
  const binary = resolve(
    root,
    'target/tools/gitleaks',
    process.platform === 'win32' ? 'gitleaks.exe' : 'gitleaks',
  );
  assert.equal(run(binary, ['version']), '8.30.1');
  const files = run(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    { cwd: repository },
  )
    .split('\0')
    .filter(Boolean);
  assert(
    !files.some((name) =>
      /(?:^|\/)(?:\.gitleaksignore|\.gitleaks\.toml)$/iu.test(name),
    ),
    'Secret exemptions require an explicit policy review',
  );
  const temporary = mkdtempSync(join(tmpdir(), 'fleetiq-deploy-secrets-'));
  try {
    const policy = join(temporary, 'scanner.toml');
    writeFileSync(policy, '[extend]\nuseDefault = true\n');
    const scannerEnvironment = { ...process.env };
    for (const key of Object.keys(scannerEnvironment))
      if (key.startsWith('GITLEAKS_')) delete scannerEnvironment[key];
    const scannerOptions = { cwd: temporary, env: scannerEnvironment };
    for (const scope of ['working', 'index']) {
      const snapshot = join(temporary, scope);
      mkdirSync(snapshot);
      const paths =
        scope === 'working'
          ? files
          : run('git', ['ls-files', '-z'], { cwd: repository })
              .split('\0')
              .filter(Boolean);
      for (const file of new Set(paths)) {
        assert(!file.split('/').includes('..'));
        const destination = resolve(snapshot, file);
        assert(
          destination.startsWith(
            snapshot + (process.platform === 'win32' ? '\\' : '/'),
          ),
        );
        mkdirSync(resolve(destination, '..'), { recursive: true });
        if (scope === 'working') {
          const source = resolve(repository, file);
          if (!existsSync(source)) continue;
          assert(
            !lstatSync(source).isSymbolicLink(),
            'Tracked symlinks need explicit deployment review',
          );
          cpSync(source, destination);
        } else
          writeFileSync(
            destination,
            run('git', ['show', `:${file}`], { cwd: repository }),
          );
      }
      run(
        binary,
        [
          'dir',
          snapshot,
          '--config',
          policy,
          '--redact=100',
          '--no-banner',
          '--ignore-gitleaks-allow',
        ],
        scannerOptions,
      );
    }
    const options = base ? `${base}..HEAD` : '--all';
    if (base) {
      assert.match(base, /^[a-f0-9]{40}$/u);
      run('git', ['merge-base', '--is-ancestor', base, 'HEAD'], { cwd: repository });
    }
    run(
      binary,
      [
        'git',
        repository,
        '--config',
        policy,
        '--redact=100',
        '--no-banner',
        '--ignore-gitleaks-allow',
        `--log-opts=${options}`,
      ],
      scannerOptions,
    );
  } finally {
    // This exact mkdtemp child is owned by this invocation.
    ownedPath(tmpdir(), temporary);
    rmSync(temporary, { recursive: true, force: true });
  }
}
