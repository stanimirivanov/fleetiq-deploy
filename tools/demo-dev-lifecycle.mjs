import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { resolve } from 'node:path';
import { prepareDemoInstallation } from './demo.mjs';
import {
  admitDevelopmentState,
  developmentRecipe,
  developmentSecretCheck,
  developmentSource,
  transitionDevelopment,
  validateDevelopmentImage,
} from './demo-dev.mjs';
import { assertOwnership, instancePath, privateJson } from './installation.mjs';
import { pipelineServices } from './pipeline.mjs';
import { digest, lock, ownedPath } from './policy.mjs';
import { root, run } from './process.mjs';

/** Parse before any Docker call; source selections are fixed owned clones, not arbitrary CLI paths. */
export function parseDevelopmentArguments(args) {
  assert.equal(
    args.length,
    2,
    'Development commands require exactly one owned demo name',
  );
  assert(['demo-dev-up', 'demo-rebuild-backend', 'demo-reviewed'].includes(args[0]));
  instancePath(args[1]);
  return {
    command: {
      'demo-dev-up': 'ui',
      'demo-rebuild-backend': 'backend',
      'demo-reviewed': 'reviewed',
    }[args[0]],
    name: args[1],
  };
}

/** Atomic private replacement; unique drafts cannot strand later explicit recovery after a process interruption. */
function persist(path, file, value, mode = 0o600) {
  const destination = resolve(path, file);
  if (existsSync(destination)) {
    ownedPath(path, destination);
    assert(lstatSync(destination).isFile() && lstatSync(destination).nlink === 1);
  }
  const pending = resolve(path, `${file}.${randomUUID()}.pending`);
  writeFileSync(
    pending,
    typeof value === 'string' ? value : `${JSON.stringify(value)}\n`,
    { flag: 'wx', mode },
  );
  renameSync(pending, destination);
}

/** API/session/SSE retain their normal edge handler; only UI/HMR use the private development service. */
export function developmentCaddy(source) {
  const anchor = '  # Only compiled resources bypass';
  assert.equal(source.split(anchor).length, 2);
  return (
    source
      .slice(0, source.indexOf(anchor))
      .replace('https://localhost:8443', 'https://fleet.fleetiq.test:8443')
      .replace(
        'tls internal',
        'tls /run/secrets/demo_tls_cert /run/secrets/demo_tls_key',
      ) +
    `  @maps path /maps/*
  handle @maps {
    root * /srv
    file_server
  }
  @foreignHmr {
    path /__fleetiq_hmr
    not header Origin https://fleet.fleetiq.test:58443
  }
  handle @foreignHmr {
    respond 403
  }
  @sample query preview=sample
  handle @sample {
    respond 400
  }
  handle {
    reverse_proxy ui-dev:5173
  }
}
`
  );
}

/** Closed delta validation keeps the database, secrets, host ports and reviewed process restrictions intact. */
export function validateDevelopmentModel(
  model,
  reviewed,
  { owner, source, caddy, backendImage = reviewed.services.backend.image },
) {
  const expected = developmentRecipe(reviewed, backendImage);
  if (backendImage === reviewed.services.backend.image)
    expected.services.backend = structuredClone(reviewed.services.backend);
  if (model.services['ui-dev']) {
    assert(process.getuid() > 0, 'Development UI requires a nonroot host user');
    assert.equal(source.path, resolve(root, '.local/dev-sources/ui'));
    const ui = model.services['ui-dev'];
    const keys = [
      'image',
      'pull_policy',
      'user',
      'init',
      'read_only',
      'cap_drop',
      'security_opt',
      'mem_limit',
      'cpus',
      'pids_limit',
      'tmpfs',
      'labels',
      'working_dir',
      'entrypoint',
      'command',
      'environment',
      'networks',
      'volumes',
      'healthcheck',
    ];
    assert(Object.keys(ui).every((key) => keys.includes(key)));
    assert.equal(ui.init, true);
    assert.equal(ui.working_dir, '/workspace/apps/web');
    assert.deepEqual(ui.tmpfs, ['/tmp:size=256m,mode=1777,nosuid']);
    expected.services.edge.volumes.find(
      (v) => v.target === '/etc/caddy/Caddyfile',
    ).source = caddy;
    assert.equal(ui.image, lock.images.node);
    assert.equal(ui.pull_policy, 'never');
    assert.equal(ui.user, `${process.getuid()}:${process.getgid()}`);
    assert.equal(ui.read_only, true);
    assert.deepEqual(ui.cap_drop, ['ALL']);
    assert.deepEqual(ui.security_opt, ['no-new-privileges:true']);
    assert.deepEqual(ui.entrypoint, ['/usr/local/bin/node']);
    assert.deepEqual(ui.command, [
      '/workspace/node_modules/vite/bin/vite.js',
      '--config',
      '/opt/fleetiq/vite.config.mjs',
      '--configLoader',
      'native',
    ]);
    assert.deepEqual(ui.environment, {
      FLEETIQ_CONNECTED_ORIGIN: 'https://fleet.fleetiq.test:58443',
    });
    assert.deepEqual(Object.keys(ui.networks), ['application']);
    assert.deepEqual(ui.labels, {
      'com.fleetiq.deploy.owner': owner,
      'com.fleetiq.development': source.fingerprint,
    });
    assert(
      !ui.ports?.length &&
        !ui.secrets &&
        !ui.env_file &&
        !ui.build &&
        !ui.network_mode &&
        !ui.container_name &&
        !ui.privileged &&
        !ui.devices &&
        !ui.cap_add?.length &&
        !ui.pid &&
        !ui.ipc,
    );
    assert.equal(String(ui.mem_limit), '1073741824');
    assert.equal(ui.cpus, 2);
    assert.equal(ui.pids_limit, 128);
    assert.deepEqual(ui.healthcheck, {
      test: [
        'CMD',
        '/usr/local/bin/node',
        '-e',
        "fetch('http://127.0.0.1:5173/@vite/client').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))",
      ],
      interval: '3s',
      timeout: '3s',
      retries: 40,
    });
    assert.deepEqual(ui.volumes, [
      {
        type: 'bind',
        source: source.path,
        target: '/workspace',
        read_only: true,
        bind: {},
      },
      {
        type: 'bind',
        source: resolve(root, 'local/demo/vite.config.mjs'),
        target: '/opt/fleetiq/vite.config.mjs',
        read_only: true,
        bind: {},
      },
    ]);
    expected.services['ui-dev'] = ui;
  }
  assert.deepEqual(model, expected);
}

/** Only fixed phase/category codes may cross the qualification diagnostic boundary. */
export function developmentFailureCode(error) {
  const lifecycle =
    /^Development lifecycle failed: (prepare|state|source|secrets|ui-deps|ui-image|ui-config|backend-build|backend-schema|model|retain|stop|start):(command|assertion|unexpected)$/u.exec(
      error?.message ?? '',
    );
  if (lifecycle) return `${lifecycle[1]}:${lifecycle[2]}`;
  const browser =
    /^Development browser failed: (trust|login|map|sse|edit-initial|edit-update|edit-document|sample-refusal|origin-refusal|logout)$/u.exec(
      error?.message ?? '',
    );
  return browser ? `browser:${browser[1]}` : 'unexpected';
}

/** Explicit development controller. The sealed reviewed recipe/image inventory is never overwritten. */
export async function developmentCommand(command, name, docker) {
  let phase = 'prepare';
  try {
    const { site } = prepareDemoInstallation(name, docker);
    assertOwnership(site);
    const baseline = digest(readFileSync(resolve(site.path, 'applied-compose.json')));
    let state = {
      schemaVersion: 1,
      owner: site.owner.id,
      context: docker,
      daemonId: site.owner.daemonId,
      baseline,
    };
    let model = structuredClone(site.model);
    const marker = resolve(site.path, 'development.json');
    const recipe = resolve(site.path, 'development-compose.json');
    const caddy = resolve(site.path, 'development-Caddyfile');
    const execute = (args, options = {}) =>
      run('docker', ['--context', docker, ...args], options);
    const compose = (args) =>
      execute(['compose', '--project-name', site.project, '--file', recipe, ...args], {
        env: { ...process.env, COMPOSE_DISABLE_ENV_FILE: '1' },
        timeout: 240000,
      });
    phase = 'state';
    if (existsSync(marker)) {
      const retained = privateJson(site.path, 'development.json');
      state = admitDevelopmentState(retained, state, command);
      if (command !== 'reviewed') {
        assert.equal(state.recipe, digest(readFileSync(ownedPath(site.path, recipe))));
        model = privateJson(site.path, 'development-compose.json');
        validateDevelopmentModel(model, site.model, {
          owner: site.owner.id,
          source: state.ui,
          caddy,
          backendImage: state.target === 'reviewed' ? undefined : state.backend?.image,
        });
        if (state.backend && state.target !== 'reviewed') {
          const [image] = JSON.parse(
            execute(['image', 'inspect', state.backend.image]),
          );
          validateDevelopmentImage(image, { role: 'platform', ...state.backend });
        }
      }
    } else assert.equal(command === 'reviewed', false, 'No active development mode');
    let source;
    await transitionDevelopment(command, {
      owned: () => assertOwnership(site),
      build: async () => {
        phase = 'source';
        source = developmentSource(command === 'ui' ? 'ui' : 'platform');
        phase = 'secrets';
        await developmentSecretCheck(source, { docker });
        if (command === 'ui') {
          phase = 'ui-deps';
          assert(
            existsSync(resolve(source.path, 'node_modules/vite/bin/vite.js')),
            'Install the UI frozen dependencies explicitly',
          );
          phase = 'ui-image';
          execute(['pull', lock.images.node], { timeout: 300000 });
          phase = 'ui-config';
          persist(
            site.path,
            'development-Caddyfile',
            developmentCaddy(readFileSync(resolve(root, 'local/Caddyfile'), 'utf8')),
            0o644,
          );
          model = JSON.parse(
            site.compose(
              [
                '--file',
                resolve(root, 'local/demo/dev.yaml'),
                '--profile',
                'demo-send',
                'config',
                '--format',
                'json',
              ],
              {
                env: {
                  FLEETIQ_DEV_NODE_IMAGE: lock.images.node,
                  FLEETIQ_DEV_USER: `${process.getuid()}:${process.getgid()}`,
                  FLEETIQ_OWNER: site.owner.id,
                  FLEETIQ_DEV_FINGERPRINT: source.fingerprint,
                  FLEETIQ_DEV_UI_SOURCE: source.path,
                  FLEETIQ_DEV_CADDY_FILE: caddy,
                  FLEETIQ_DEV_VITE_FILE: resolve(root, 'local/demo/vite.config.mjs'),
                },
              },
            ),
          );
          if (state.backend) model = developmentRecipe(model, state.backend.image);
          state.ui = {
            path: source.path,
            fingerprint: source.fingerprint,
            revision: source.revision,
          };
        } else {
          const scratch = mkdtempSync(resolve(root, '.local/dev-build-'));
          writeFileSync(
            resolve(scratch, '.fleetiq-dev-build-owner'),
            source.fingerprint,
            { flag: 'wx', mode: 0o600 },
          );
          try {
            for (const [file, hash] of source.fingerprints) {
              const destination = resolve(scratch, file);
              mkdirSync(resolve(destination, '..'), { recursive: true });
              cpSync(ownedPath(source.path, resolve(source.path, file)), destination);
              assert.equal(
                digest(readFileSync(destination)),
                hash,
                'Source changed during snapshot',
              );
            }
            const tag = `fleetiq-development:${source.fingerprint}`;
            phase = 'backend-build';
            execute(
              [
                'buildx',
                'build',
                '--load',
                '--file',
                resolve(root, 'local/images/backend.Dockerfile'),
                '--build-arg',
                `RUST_IMAGE=${lock.images.rust}`,
                '--build-arg',
                `RUNTIME_IMAGE=${lock.images.runtime}`,
                '--label',
                `com.fleetiq.development=${source.fingerprint}`,
                '--label',
                `org.opencontainers.image.revision=${source.revision}`,
                '--label',
                'org.opencontainers.image.source=https://github.com/stanimirivanov/fleetiq-platform.git',
                '--tag',
                tag,
                scratch,
              ],
              { timeout: 3600000 },
            );
            assert.equal(
              developmentSource('platform').fingerprint,
              source.fingerprint,
              'Source changed during build',
            );
            const [image] = JSON.parse(execute(['image', 'inspect', tag]));
            const id = validateDevelopmentImage(image, source);
            state.backend = {
              image: id,
              fingerprint: source.fingerprint,
              revision: source.revision,
            };
            model = developmentRecipe(model, id);
          } finally {
            assert(
              scratch.startsWith(resolve(root, '.local/dev-build-')) &&
                lstatSync(scratch).isDirectory(),
            );
            assert.equal(
              readFileSync(
                ownedPath(scratch, resolve(scratch, '.fleetiq-dev-build-owner')),
                'utf8',
              ),
              source.fingerprint,
            );
            assert.equal(lstatSync(scratch).uid, process.getuid());
            rmSync(scratch, { recursive: true });
          }
        }
      },
      admit: () => {
        phase = 'backend-schema';
        if (command === 'backend') {
          const options = [
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
            '10001:10001',
          ];
          const inventory = (image) =>
            execute([
              ...options,
              '--entrypoint',
              '/usr/local/bin/fleetiq-server',
              image,
              'migration-inventory',
            ]);
          assert.equal(
            inventory(state.backend.image),
            inventory(site.images.backend),
            'Development migration changes require separate review',
          );
          execute([
            ...options,
            '--entrypoint',
            '/bin/bash',
            state.backend.image,
            '-c',
            'test -x /usr/local/bin/fleetiq-server && test -x /usr/local/bin/fleetiq-protocol-admission && test -x /usr/local/bin/fleetiq-protocol-decode && test -x /usr/local/bin/fleetiq-protocol-live',
          ]);
        }
        phase = 'model';
        validateDevelopmentModel(model, site.model, {
          owner: site.owner.id,
          source: state.ui,
          caddy,
          backendImage: state.backend?.image,
        });
      },
      retain: () => {
        phase = 'retain';
        if (command === 'reviewed') model = structuredClone(site.model);
        persist(site.path, 'development-compose.json', model);
        state.target = command;
        state.status = 'pending';
        state.recipe = digest(readFileSync(recipe));
        persist(site.path, 'development.json', state);
      },
      stop: () => {
        phase = 'stop';
        if (command !== 'ui') {
          compose(['stop', ...pipelineServices]);
          compose(['stop', 'backend']);
        }
        if (command === 'reviewed') {
          const ids = execute([
            'ps',
            '--all',
            '--quiet',
            '--filter',
            `label=com.docker.compose.project=${site.project}`,
            '--filter',
            'label=com.docker.compose.service=ui-dev',
          ])
            .split(/\s+/u)
            .filter(Boolean);
          for (const id of ids) {
            const [container] = JSON.parse(execute(['inspect', id]));
            assert.equal(
              container.Config.Labels['com.fleetiq.deploy.owner'],
              site.owner.id,
            );
            assert.equal(
              container.Config.Labels['com.docker.compose.project'],
              site.project,
            );
            execute(['rm', '--force', id]);
          }
        }
      },
      apply: () => {},
      start: () => {
        phase = 'start';
        if (command !== 'ui') {
          compose([
            'up',
            '--detach',
            '--no-deps',
            '--wait',
            '--wait-timeout',
            '180',
            'backend',
          ]);
          compose([
            'up',
            '--detach',
            '--no-deps',
            '--wait',
            '--wait-timeout',
            '60',
            ...pipelineServices,
          ]);
        }
        if (command === 'ui')
          compose([
            'up',
            '--detach',
            '--no-deps',
            '--wait',
            '--wait-timeout',
            '120',
            'ui-dev',
          ]);
        compose([
          'up',
          '--detach',
          '--no-deps',
          '--force-recreate',
          '--wait',
          '--wait-timeout',
          '60',
          'edge',
        ]);
        if (command !== 'reviewed') {
          state.status = 'ready';
          persist(site.path, 'development.json', state);
        }
        if (command === 'reviewed') {
          unlinkSync(ownedPath(site.path, marker));
          for (const file of ['development-compose.json', 'development-Caddyfile'])
            if (existsSync(resolve(site.path, file)))
              unlinkSync(ownedPath(site.path, resolve(site.path, file)));
        }
      },
    });
  } catch (error) {
    const kind =
      error?.name === 'CommandFailure'
        ? 'command'
        : error instanceof assert.AssertionError
          ? 'assertion'
          : 'unexpected';
    throw new Error(`Development lifecycle failed: ${phase}:${kind}`);
  }
}
