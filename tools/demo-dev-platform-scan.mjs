import assert from 'node:assert/strict';
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { digest, lock, ownedPath } from './policy.mjs';
import { capture, root, run } from './process.mjs';

/** Execute the platform's reviewed exact-exception wrapper without building candidate code or trusting its tools. */
export async function scanPlatformSource(
  source,
  {
    docker,
    revision = lock.sources.platform.commit,
    execute = (args, options) => run('docker', ['--context', docker, ...args], options),
  } = {},
) {
  assert.equal(source.role, 'platform');
  assert(process.getuid() > 0, 'Source scanning requires a nonroot owner');
  assert.match(revision, /^[a-f0-9]{40}$/u);
  assert(typeof docker === 'string' && docker.length > 0);
  const scratch = mkdtempSync(resolve(tmpdir(), 'fleetiq-reviewed-scanner-'));
  const recipe = resolve(root, 'local/demo/scanner.Dockerfile');
  const packaging = digest(
    Buffer.concat([readFileSync(recipe), Buffer.from(lock.images.rust)]),
  );
  // No host tokens, Docker config overrides, compiler settings or provider inputs
  // are inherited by build/run processes. Docker uses the explicitly owned context.
  const environment = { PATH: process.env.PATH, HOME: process.env.HOME };
  const options = { env: environment, timeout: 600000 };
  try {
    const archive = capture(
      'git',
      ['-C', source.path, 'archive', '--format=tar', revision],
      { encoding: null },
    ).stdout;
    const file = resolve(scratch, 'reviewed.tar');
    writeFileSync(file, archive, { flag: 'wx', mode: 0o600 });
    run('tar', [
      '--extract',
      '--file',
      file,
      '--directory',
      scratch,
      '--no-same-owner',
    ]);
    rmSync(file);
    const tag = `fleetiq-development-scanner:${revision}-${packaging}`;
    execute(
      [
        'buildx',
        'build',
        '--load',
        '--file',
        recipe,
        '--build-arg',
        `RUST_IMAGE=${lock.images.rust}`,
        '--label',
        `com.fleetiq.scanner.revision=${revision}`,
        '--label',
        `com.fleetiq.scanner.packaging=${packaging}`,
        '--tag',
        tag,
        scratch,
      ],
      options,
    );
    const [image] = JSON.parse(execute(['image', 'inspect', tag], options));
    assert.match(image.Id, /^sha256:[a-f0-9]{64}$/u);
    assert.equal(image.Config.Labels['com.fleetiq.scanner.revision'], revision);
    assert.equal(image.Config.Labels['com.fleetiq.scanner.packaging'], packaging);
    const binary = ownedPath(root, resolve(root, 'target/tools/gitleaks/gitleaks'));
    // Docker needs the nested mountpoint to exist before the parent read-only bind.
    // Mask host build tools; never execute a candidate target/tools detector.
    const target = resolve(source.path, 'target');
    mkdirSync(target, { recursive: true, mode: 0o700 });
    assert.equal(ownedPath(source.path, target), target);
    assert(
      lstatSync(target).isDirectory() && lstatSync(target).uid === process.getuid(),
    );
    execute(
      [
        'run',
        '--rm',
        '--network',
        'none',
        '--read-only',
        '--cap-drop',
        'ALL',
        '--security-opt',
        'no-new-privileges',
        '--user',
        `${process.getuid()}:${process.getgid()}`,
        '--cpus',
        '2',
        '--memory',
        '2g',
        '--pids-limit',
        '128',
        '--tmpfs',
        '/tmp:size=2g,mode=1777,noexec,nosuid',
        '--tmpfs',
        '/workspace/target:size=1m,mode=1777,noexec,nosuid',
        '--mount',
        `type=bind,source=${source.path},target=/workspace,readonly`,
        '--mount',
        `type=bind,source=${binary},target=/usr/local/bin/gitleaks,readonly`,
        image.Id,
        'secrets',
        '--base',
        revision,
      ],
      options,
    );
  } finally {
    // This exact mkdtemp tree contains only immutable reviewed source, never candidate inputs.
    ownedPath(tmpdir(), scratch);
    rmSync(scratch, { recursive: true });
  }
}
