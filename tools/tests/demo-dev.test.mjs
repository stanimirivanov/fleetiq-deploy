import assert from 'node:assert/strict';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  developmentRecipe,
  developmentSource,
  transitionDevelopment,
  validateDevelopmentImage,
} from '../demo-dev.mjs';
import { run } from '../process.mjs';

function source(t) {
  const base = mkdtempSync(join(tmpdir(), 'fleetiq-dev-source-'));
  t.after(() => rmSync(base, { recursive: true }));
  const path = join(base, '.local/dev-sources/ui');
  mkdirSync(path, { recursive: true, mode: 0o700 });
  const git = (...args) => run('git', ['-C', path, ...args]);
  git('init', '--quiet');
  git('config', 'user.name', 'Synthetic');
  git('config', 'user.email', 'synthetic@example.invalid');
  git('remote', 'add', 'origin', 'https://github.com/stanimirivanov/fleetiq-ui.git');
  writeFileSync(join(path, 'source.ts'), 'export const value = 1;\n');
  writeFileSync(join(path, '.gitignore'), 'node_modules/\n.env\n');
  git('add', '.');
  git('commit', '--quiet', '-m', 'synthetic source');
  return { base, path, git, minimum: git('rev-parse', 'HEAD') };
}
test('development source admits explicit owned clones and fingerprints edits without resetting them', (t) => {
  const f = source(t);
  const first = developmentSource('ui', f);
  writeFileSync(join(f.path, 'source.ts'), 'export const value = 2;\n');
  const second = developmentSource('ui', f);
  assert.notEqual(first.fingerprint, second.fingerprint);
  assert.match(readFileSync(join(f.path, 'source.ts'), 'utf8'), /value = 2/u);
  assert.equal(second.revision, f.minimum);
});
for (const change of ['origin', 'private', 'link', 'untracked', 'ancestry']) {
  test(`development source rejects ${change} before container access`, (t) => {
    const f = source(t);
    if (change === 'origin')
      f.git('remote', 'set-url', 'origin', 'https://example.invalid/foreign');
    if (change === 'private') writeFileSync(join(f.path, '.env'), 'synthetic');
    if (change === 'link') {
      rmSync(join(f.path, 'source.ts'));
      symlinkSync('/etc/hosts', join(f.path, 'source.ts'));
    }
    if (change === 'untracked')
      writeFileSync(join(f.path, 'untracked.ts'), 'synthetic');
    if (change === 'ancestry') f.minimum = 'f'.repeat(40);
    assert.throws(() => developmentSource('ui', f), /Invalid development source/u);
  });
}
test('failed backend build never stops consumers or replaces the reviewed recipe', async () => {
  const events = [];
  const ops = Object.fromEntries(
    ['owned', 'build', 'admit', 'stop', 'apply', 'start', 'retain'].map((name) => [
      name,
      async () => {
        events.push(name);
        if (name === 'build') throw new Error('synthetic');
      },
    ]),
  );
  await assert.rejects(transitionDevelopment('backend', ops));
  assert.deepEqual(events, ['owned', 'build']);
});
test('backend replacement verifies all artifacts before stopping and starts only after retaining recoverable state', async () => {
  const events = [];
  const ops = Object.fromEntries(
    ['owned', 'build', 'admit', 'stop', 'apply', 'start', 'retain'].map((name) => [
      name,
      async () => events.push(name),
    ]),
  );
  await transitionDevelopment('backend', ops);
  assert.deepEqual(events, [
    'owned',
    'build',
    'admit',
    'retain',
    'stop',
    'apply',
    'start',
  ]);
});
test('development images require exact source fingerprint, revision and complete executor identity', () => {
  const source = {
    role: 'platform',
    revision: 'a'.repeat(40),
    fingerprint: 'b'.repeat(64),
  };
  const image = {
    Id: `sha256:${'c'.repeat(64)}`,
    Os: 'linux',
    Architecture: 'amd64',
    Config: {
      User: '10001:10001',
      Labels: {
        'com.fleetiq.development': source.fingerprint,
        'org.opencontainers.image.revision': source.revision,
        'org.opencontainers.image.source':
          'https://github.com/stanimirivanov/fleetiq-platform.git',
      },
    },
  };
  assert.equal(validateDevelopmentImage(image, source), image.Id);
  for (const mutate of [
    (v) => delete v.Config.Labels['com.fleetiq.development'],
    (v) => {
      v.Config.User = '0';
    },
    (v) => {
      v.Config.Labels['org.opencontainers.image.revision'] = 'd'.repeat(40);
    },
  ]) {
    const bad = structuredClone(image);
    mutate(bad);
    assert.throws(() => validateDevelopmentImage(bad, source));
  }
});
test('development recipe replaces every backend executor together and preserves persistent state', () => {
  const model = {
    services: {
      backend: { image: 'reviewed', command: ['serve'] },
      'replay-worker': { image: 'reviewed', command: ['replay-worker'] },
      'tcp-ingestion': { image: 'reviewed', command: ['ingest-tcp'] },
      'semantic-worker': { image: 'reviewed', command: ['semantic-worker'] },
      'projection-worker': { image: 'reviewed', command: ['project-current'] },
      postgres: { image: 'database' },
    },
    volumes: { database: { name: 'owned' } },
  };
  const next = developmentRecipe(model, 'sha256:development');
  for (const role of [
    'backend',
    'replay-worker',
    'tcp-ingestion',
    'semantic-worker',
    'projection-worker',
  ])
    assert.equal(next.services[role].image, 'sha256:development');
  assert.deepEqual(next.services.backend.command, ['serve', '--check-schema']);
  assert.deepEqual(next.volumes, model.volumes);
  assert.deepEqual(next.services.postgres, model.services.postgres);
  assert.equal(model.services.backend.image, 'reviewed');
});

test('reviewed image admission rejects development markers even with matching reviewed labels', async () => {
  const { rejectDevelopmentImage } = await import('../sources.mjs');
  assert.doesNotThrow(() => rejectDevelopmentImage({ Config: { Labels: {} } }));
  assert.throws(() =>
    rejectDevelopmentImage({
      Config: { Labels: { 'com.fleetiq.development': 'synthetic' } },
    }),
  );
});

test('real Compose development overlay preserves private networks and rejects unsafe deltas', async (t) => {
  const { root } = await import('../process.mjs');
  const { lock } = await import('../policy.mjs');
  assert.equal(
    run('docker', ['compose', 'version', '--short']).replace(/^v/u, ''),
    lock.tools.compose,
    'Native rendering requires the reviewed Compose; run node tools/install-compose.mjs',
  );
  const { validateDevelopmentModel, developmentCaddy, parseDevelopmentArguments } =
    await import('../demo-dev-lifecycle.mjs');
  for (const args of [
    ['demo-dev-up', '../escape'],
    ['demo-dev-up', 'demo', 'extra'],
    ['other', 'demo'],
  ])
    assert.throws(() => parseDevelopmentArguments(args));
  assert.deepEqual(parseDevelopmentArguments(['demo-dev-up', 'example']), {
    command: 'ui',
    name: 'example',
  });
  const config = developmentCaddy(readFileSync(join(root, 'local/Caddyfile'), 'utf8'));
  assert.match(config, /@backend path \/api \/api\/\* \/health\/\*/u);
  assert.match(config, /reverse_proxy \{\$FLEETIQ_API_UPSTREAM:backend:8080\}/u);
  assert.match(config, /not header Origin https:\/\/fleet.fleetiq.test:58443/u);
  assert.match(config, /reverse_proxy ui-dev:5173/u);
  assert(!config.includes('tls internal') && !config.includes('try_files'));
  const fixture = JSON.parse(
    readFileSync(
      new URL('./fixtures/demo-rendered.json', import.meta.url),
      'utf8',
    ).replaceAll('/fixture-repository', root.replace(/\/$/u, '')),
  );
  const reviewed = {
    ...fixture.baseline,
    services: { ...fixture.baseline.services, ...fixture.overlay.services },
    secrets: fixture.overlay.secrets,
  };
  const temporary = mkdtempSync(join(tmpdir(), 'fleetiq-dev-render-'));
  t.after(() => rmSync(temporary, { recursive: true }));
  writeFileSync(join(temporary, 'reviewed.json'), JSON.stringify(reviewed));
  const source = {
    path: join(root, '.local/dev-sources/ui'),
    fingerprint: 'a'.repeat(64),
  };
  const caddy = join(temporary, 'Caddyfile');
  const model = JSON.parse(
    run(
      'docker',
      [
        'compose',
        '--file',
        join(temporary, 'reviewed.json'),
        '--file',
        join(root, 'local/demo/dev.yaml'),
        '--profile',
        'demo-send',
        'config',
        '--format',
        'json',
      ],
      {
        env: {
          ...process.env,
          COMPOSE_DISABLE_ENV_FILE: '1',
          FLEETIQ_DEV_NODE_IMAGE: lock.images.node,
          FLEETIQ_DEV_USER: `${process.getuid()}:${process.getgid()}`,
          FLEETIQ_OWNER: 'fixture',
          FLEETIQ_DEV_FINGERPRINT: source.fingerprint,
          FLEETIQ_DEV_UI_SOURCE: source.path,
          FLEETIQ_DEV_CADDY_FILE: caddy,
          FLEETIQ_DEV_VITE_FILE: join(root, 'local/demo/vite.config.mjs'),
        },
      },
    ),
  );
  const settings = { owner: 'fixture', source, caddy };
  for (const volume of [
    ...model.services['ui-dev'].volumes,
    model.services.edge.volumes.find((v) => v.target === '/etc/caddy/Caddyfile'),
  ])
    assert.equal(volume.bind.create_host_path, false);
  validateDevelopmentModel(model, reviewed, settings);
  for (const mutate of [
    (v) => {
      v.services['ui-dev'].volumes[0].bind.create_host_path = true;
    },
    (v) => {
      v.services.edge.volumes.find(
        (volume) => volume.target === '/etc/caddy/Caddyfile',
      ).bind.create_host_path = true;
    },
    (v) => {
      v.services['ui-dev'].healthcheck.test = ['CMD', 'true'];
    },
    (v) => {
      v.services['ui-dev'].ports = [
        { target: 5173, published: '5173', host_ip: '127.0.0.1' },
      ];
    },
    (v) => {
      v.services['ui-dev'].volumes[0].read_only = false;
    },
    (v) => {
      v.services['ui-dev'].environment.TOKEN = 'synthetic';
    },
    (v) => {
      v.services['ui-dev'].group_add = ['0'];
    },
    (v) => {
      v.services.backend.image = 'foreign';
    },
    (v) => {
      v.services['replay-worker'].command = ['foreign'];
    },
    (v) => {
      v.volumes.database.name = 'foreign';
    },
  ]) {
    const bad = structuredClone(model);
    mutate(bad);
    assert.throws(() => validateDevelopmentModel(bad, reviewed, settings));
  }
  const getuid = process.getuid,
    getgid = process.getgid;
  try {
    process.getuid = () => 0;
    process.getgid = () => 0;
    const rootModel = structuredClone(model);
    rootModel.services['ui-dev'].user = '0:0';
    assert.throws(() => validateDevelopmentModel(rootModel, reviewed, settings));
  } finally {
    process.getuid = getuid;
    process.getgid = getgid;
  }
});

test('separate development qualification is inventoried without replacing reviewed acceptance or credential isolation', async () => {
  const { catalogue } = await import('../verification-catalogue.mjs');
  const { expectedWorkflow } = await import('../ci.mjs');
  assert.deepEqual(catalogue.development, [
    'toolchain',
    'policy',
    'development-reload',
  ]);
  assert(!catalogue.acceptance.includes('development-reload'));
  assert(expectedWorkflow.includes('pnpm development:sources'));
  assert(expectedWorkflow.includes('pnpm qualify:development'));
  assert(expectedWorkflow.includes('node tools/ci-evidence.mjs development'));
});

test('all frozen UI workspace dependency directories are allowed without permitting private files', (t) => {
  const f = source(t);
  writeFileSync(
    join(f.path, '.gitignore'),
    'node_modules/\napps/web/node_modules/\napps/web-e2e/node_modules/\n.env\n',
  );
  for (const dir of [
    'node_modules',
    'apps/web/node_modules',
    'apps/web-e2e/node_modules',
  ]) {
    mkdirSync(join(f.path, dir), { recursive: true });
    writeFileSync(join(f.path, dir, 'package.json'), '{}');
  }
  for (const owner of ['web', 'web-e2e'])
    writeFileSync(join(f.path, 'apps', owner, 'source.ts'), 'export {};');
  f.git('add', 'apps');
  developmentSource('ui', f);
  writeFileSync(join(f.path, '.env'), 'synthetic');
  assert.throws(() => developmentSource('ui', f), /Invalid development source/u);
});

test('development failure diagnostics preserve only closed phases and never raw payloads', async () => {
  const { developmentFailureCode } = await import('../demo-dev-lifecycle.mjs');
  assert.equal(
    developmentFailureCode(new Error('Development lifecycle failed: secrets:command')),
    'secrets:command',
  );
  assert.equal(
    developmentFailureCode(new Error('Development browser failed: sse')),
    'browser:sse',
  );
  for (const message of [
    'private diagnostic payload',
    'Development lifecycle failed: private:token',
    'Development browser failed: token',
  ])
    assert.equal(developmentFailureCode(new Error(message)), 'unexpected');
});

test('scanner control attestation rejects changed code even when Git external diff hides it', async (t) => {
  const { assertReviewedScanner } = await import('../demo-dev.mjs');
  const f = source(t);
  mkdirSync(join(f.path, 'tools/security'), { recursive: true });
  writeFileSync(
    join(f.path, 'tools/security/secrets.mjs'),
    'export const safe = true;\n',
  );
  f.git('add', '.');
  f.git('commit', '--quiet', '-m', 'scanner baseline');
  const revision = f.git('rev-parse', 'HEAD');
  assertReviewedScanner({ path: f.path }, { revision });
  writeFileSync(
    join(f.path, 'tools/security/secrets.mjs'),
    'export const safe = false;\n',
  );
  f.git('config', 'diff.external', '/bin/true');
  assert.equal(f.git('diff', revision, '--', 'tools'), '');
  assert.throws(() => assertReviewedScanner({ path: f.path }, { revision }));
});

test('platform scanner builds only immutable reviewed controls and scans the candidate without network or credentials', async (t) => {
  const { scanPlatformSource } = await import('../demo-dev-platform-scan.mjs');
  const f = source(t);
  writeFileSync(join(f.path, 'source.ts'), 'candidate changed after reviewed commit');
  let built = false,
    scanned = false,
    labels;
  await scanPlatformSource(
    { role: 'platform', path: f.path },
    {
      docker: 'owned-context',
      revision: f.minimum,
      execute: (args, options) => {
        assert(!options.env.GH_TOKEN && !options.env.GITHUB_TOKEN);
        if (args[0] === 'buildx') {
          assert.match(
            readFileSync(join(args.at(-1), 'source.ts'), 'utf8'),
            /value = 1/u,
          );
          labels = Object.fromEntries(
            args.flatMap((arg, index) =>
              arg === '--label' ? [args[index + 1].split('=')] : [],
            ),
          );
          built = true;
          return '';
        }
        if (args[0] === 'image')
          return JSON.stringify([
            { Id: `sha256:${'a'.repeat(64)}`, Config: { Labels: labels } },
          ]);
        assert(built);
        assert(args.includes('none') && args.includes('--read-only'));
        assert(args.includes(`type=bind,source=${f.path},target=/workspace,readonly`));
        assert(args.includes(f.minimum));
        scanned = true;
        return '';
      },
    },
  );
  assert(scanned);
});

test('an interrupted mode switch permits only reviewed recovery before new development work', async () => {
  const { assertDevelopmentTransition } = await import('../demo-dev.mjs');
  for (const target of ['ui', 'backend', 'reviewed']) {
    const state = { target, status: 'pending' };
    for (const command of ['ui', 'backend'])
      assert.throws(() => assertDevelopmentTransition(state, command));
    assertDevelopmentTransition(state, 'reviewed');
    for (const command of ['ui', 'backend', 'reviewed'])
      assertDevelopmentTransition({ ...state, status: 'ready' }, command);
  }
  assert.throws(() =>
    assertDevelopmentTransition({ target: 'ui', status: 'unknown' }, 'reviewed'),
  );
});

test('reviewed recovery discards stale development details while retaining every ownership binding', async () => {
  const { admitDevelopmentState } = await import('../demo-dev.mjs');
  const binding = {
    schemaVersion: 1,
    owner: 'owned',
    context: 'owned-context',
    daemonId: 'owned-daemon',
    baseline: 'reviewed-fingerprint',
  };
  const interrupted = {
    ...binding,
    target: 'backend',
    status: 'pending',
    recipe: 'interrupted-recipe',
    backend: { image: 'stale' },
  };
  assert.deepEqual(admitDevelopmentState(interrupted, binding, 'reviewed'), binding);
  assert.throws(() => admitDevelopmentState(interrupted, binding, 'ui'));
  for (const key of Object.keys(binding))
    assert.throws(() =>
      admitDevelopmentState({ ...interrupted, [key]: 'foreign' }, binding, 'reviewed'),
    );
});

test('every CI consumer of native harness verification installs the reviewed Compose first', async () => {
  const { parse } = await import('yaml');
  const { expectedWorkflow, expectedPublicationWorkflow } = await import('../ci.mjs');
  for (const authority of [expectedWorkflow, expectedPublicationWorkflow]) {
    const consumers = Object.values(parse(authority).jobs).filter((job) =>
      job.steps.some((step) => step.run === 'pnpm check'),
    );
    assert(consumers.length > 0);
    for (const { steps } of consumers) {
      const install = steps.findIndex(
        (step) => step.run === 'node tools/install-compose.mjs',
      );
      const check = steps.findIndex((step) => step.run === 'pnpm check');
      assert(
        install >= 0 && install < check,
        'Native rendering requires the same checksum-verified Compose as runtime qualification',
      );
    }
  }
});
