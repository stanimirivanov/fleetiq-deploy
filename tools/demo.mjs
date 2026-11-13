import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { resolve } from 'node:path';
import { reconcileDemoBrowser } from '../local/demo/seed.mjs';
import {
  demoIdentity,
  initializeDemoIdentity,
  loadDemoIdentity,
  preflightDemoIdentity,
} from './demo-identity.mjs';
import { initializeDemoSeed, loadDemoSeed } from './demo-seed.mjs';
import {
  appliedInstallation,
  assertOwnership,
  initialize,
  installation,
  instancePath,
} from './installation.mjs';
import { pipelineInstallation, pipelineServices } from './pipeline.mjs';
import { lock, validateSimulatorPin } from './policy.mjs';
import { root, run } from './process.mjs';
import { imageInventory } from './sources.mjs';

/** Parse the explicit demo interface before Docker access; destructive reset requires a matching name. */
export function parseDemoArguments(args) {
  try {
    const [action, name, value, confirmation, ...extra] = args;
    assert(
      ['demo-init', 'demo-up', 'demo-down', 'demo-reset'].includes(action),
      'Invalid demo command',
    );
    instancePath(name ?? '');
    assert.equal(extra.length, 0, 'Unexpected demo arguments');
    assert.equal(
      args.length,
      action === 'demo-reset' ? 4 : action === 'demo-init' ? 3 : 2,
    );
    if (action === 'demo-reset') {
      assert.equal(
        value,
        '--confirm-owned-instance',
        'Reset requires --confirm-owned-instance <name>',
      );
      assert.equal(
        confirmation,
        name,
        'Reset confirmation must match the owned instance',
      );
    } else if (action === 'demo-init') {
      assert(
        typeof value === 'string' && value.length > 0 && !confirmation,
        'Init requires one private component path',
      );
    } else assert(!value && !confirmation, 'Unexpected demo arguments');
    return {
      command: action.slice(5),
      name,
      artifactPath: action === 'demo-init' ? value : undefined,
    };
  } catch {
    throw new Error(
      'Invalid demo arguments; use demo-init <name> <private-component>, demo-up|demo-down <name>, or demo-reset <name> --confirm-owned-instance <name>',
    );
  }
}

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const identityDirectory = (name) => resolve(root, '.local/demo-identities', name);
const privateDirectory = (path) => {
  const stat = lstatSync(path);
  assert(
    stat.isDirectory() &&
      realpathSync(path) === path &&
      stat.uid === process.getuid() &&
      (stat.mode & 0o777) === 0o700,
    'Demo private directory invalid',
  );
  return path;
};
/** Validate existing namespace parents before mkdir or any lifecycle mutation. */
export function validateDemoParents(base = root) {
  for (const [name, privateMode] of [
    ['.local', false],
    ['.local/instances', true],
    ['.local/demo-identities', true],
  ]) {
    const path = resolve(base, name);
    if (!existsSync(path)) continue;
    const stat = lstatSync(path);
    assert(
      stat.isDirectory() &&
        realpathSync(path) === path &&
        stat.uid === process.getuid() &&
        (privateMode ? (stat.mode & 0o777) === 0o700 : (stat.mode & 0o002) === 0),
      'Demo namespace invalid',
    );
  }
}
function privateFile(path, mode = 0o600) {
  const stat = lstatSync(path);
  assert(
    stat.isFile() &&
      stat.nlink === 1 &&
      realpathSync(path) === path &&
      stat.uid === process.getuid() &&
      (stat.mode & 0o777) === mode &&
      stat.size <= 8388608,
    'Demo private file invalid',
  );
  return readFileSync(path);
}
function retain(path, value, mode = 0o600) {
  const bytes = Buffer.isBuffer(value)
    ? value
    : Buffer.from(`${JSON.stringify(value)}\n`);
  if (existsSync(path))
    assert(privateFile(path, mode).equals(bytes), 'Demo retained input changed');
  else writeFileSync(path, bytes, { mode, flag: 'wx' });
}
function seedSettings(identity) {
  return {
    actorId: `demo-${hash(identity.subject).slice(0, 24)}`,
    identityFingerprint: hash(JSON.stringify(identity)),
  };
}
/** Seal each private file independently so byte shifts cannot preserve the fingerprint. */
export function demoInputFingerprint(path) {
  return hash(
    JSON.stringify(
      ['config.json', 'identities.json'].map((name) => [
        name,
        hash(privateFile(resolve(path, 'demo-inputs', name))),
      ]),
    ),
  );
}

/** Admit registry-addressed producer bytes, never a similarly named local image. */
export function validateSimulatorImage(pin, image) {
  try {
    validateSimulatorPin(pin);
    assert(image.RepoDigests.includes(pin.image));
    assert.match(image.Id, /^sha256:[a-f0-9]{64}$/u);
    assert.equal(image.Os, 'linux');
    assert.equal(image.Architecture, 'amd64');
    assert.equal(image.Config.User, '65532:65532');
    assert.deepEqual(image.Config.Entrypoint, [
      '/usr/local/bin/node',
      '/app/dist/cli.js',
    ]);
    assert.equal(
      image.Config.Labels['org.opencontainers.image.source'],
      pin.repository,
    );
    assert.equal(image.Config.Labels['org.opencontainers.image.revision'], pin.commit);
    assert.equal(image.Config.Labels['com.fleetiq.source.sha256'], pin.sourceSha256);
    return image.Id;
  } catch {
    throw new Error('Demo simulator artifact invalid');
  }
}

/** Provisioning failures never fall through to a send; ordinary down cannot reset state. */
export async function runDemoLifecycle(command, operations) {
  assert(['up', 'down', 'reset'].includes(command), 'Invalid demo command');
  await operations.owned();
  if (command === 'up') {
    await operations.infrastructure();
    await operations.provision();
    await operations.pipeline();
    await operations.simulate();
  } else if (command === 'down') await operations.down();
  else await operations.reset();
}

/** Bind private lifecycle state to the installation and exact retained provisioning journal. */
export function validateDemoOwner(state, site, seed, pin, inputsSha256) {
  try {
    assert.deepEqual(state, {
      schemaVersion: 1,
      owner: site.owner.id,
      context: site.docker,
      daemonId: site.owner.daemonId,
      seedOwner: seed.owner,
      identityFingerprint: seed.identityFingerprint,
      artifactSha256: seed.artifact.sha256,
      simulator: pin.image,
      inputsSha256,
    });
    assert.equal(site.owner.context, site.docker);
  } catch {
    throw new Error('Demo ownership invalid');
  }
}

/** Initialize only a fresh installation; interrupted or foreign state is never adopted. */
export function initializeDemo(name, docker, artifactPath) {
  instancePath(name);
  validateDemoParents();
  assert(process.getuid() > 0, 'Demo requires a nonroot host owner');
  assert(lock.simulator, 'Published simulator pin missing');
  assert(
    !existsSync(instancePath(name)),
    'Demo instance already exists; reuse its lifecycle commands',
  );
  const artifact = privateFile(resolve(artifactPath));
  imageInventory(docker);
  admitSimulator(docker);
  const parent = resolve(root, '.local/demo-identities');
  mkdirSync(parent, { recursive: true, mode: 0o700 });
  privateDirectory(parent);
  const directory = identityDirectory(name);
  const identity = initializeDemoIdentity(directory);
  const settings = seedSettings(identity);
  const seed = initializeDemoSeed(directory, { ...settings, artifact });
  assert.equal(seed.devices.length, 1);
  const owner = initialize(name, docker, {
    httpsPort: 58443,
    oidc: {
      issuer: demoIdentity.issuer,
      clientId: identity.clientId,
      authority: 'simulator-demo',
    },
  });
  const path = instancePath(name);
  writeFileSync(resolve(path, 'oidc-client-secret'), identity.clientSecret, {
    mode: 0o644,
  });
  for (const folder of ['demo-issuer', 'demo-inputs', 'demo-public'])
    mkdirSync(resolve(path, folder), { mode: 0o700 });
  for (const file of ['identity.json', 'ca.crt', 'tls.crt', 'tls.key'])
    retain(resolve(path, 'demo-issuer', file), privateFile(resolve(directory, file)));
  for (const [source, target] of [
    ['ca.crt', 'ca.crt'],
    ['tls.crt', 'tls.crt'],
    ['tls.key', 'tls.key'],
  ])
    retain(
      resolve(path, 'demo-public', target),
      privateFile(resolve(directory, source)),
      0o644,
    );
  retain(resolve(path, 'teltonika.wasm'), artifact);
  retain(resolve(path, 'demo-inputs/identities.json'), {
    'demo-device': seed.devices[0].imei,
  });
  retain(resolve(path, 'demo-inputs/config.json'), {
    schemaVersion: 1,
    identityFile: 'identities.json',
    deviceId: 'demo-device',
    target: { transport: 'tcp', host: 'tcp-ingestion', port: 55027 },
    retry: { maxAttempts: 2, ackDeadlineMs: 3000, totalDeadlineMs: 10000 },
    record: {
      schemaVersion: 1,
      timestampMs: String(Date.now()),
      priority: 0,
      longitudeE7: 233000000,
      latitudeE7: 427000000,
      altitude: 0,
      angle: 0,
      satellites: 8,
      speed: 0,
      eventId: 0,
      io: [],
    },
  });
  const caddy = readFileSync(resolve(root, 'local/Caddyfile'), 'utf8')
    .replace('https://localhost:8443', 'https://fleet.fleetiq.test:8443')
    .replace(
      'tls internal',
      'tls /run/secrets/demo_tls_cert /run/secrets/demo_tls_key',
    );
  retain(resolve(path, 'demo-public/Caddyfile'), Buffer.from(caddy), 0o644);
  retain(resolve(path, 'demo.json'), {
    schemaVersion: 1,
    owner: owner.id,
    context: docker,
    daemonId: owner.daemonId,
    seedOwner: seed.owner,
    identityFingerprint: settings.identityFingerprint,
    artifactSha256: seed.artifact.sha256,
    simulator: lock.simulator.image,
    inputsSha256: demoInputFingerprint(path),
  });
  const { site } = prepareDemoInstallation(name, docker);
  retain(
    resolve(path, 'applied-compose.json'),
    Buffer.from(`${JSON.stringify(site.model, null, 2)}\n`),
  );
}

/** Final rendered composition must retain nonroot restrictions and exact artifact/owner boundaries. */
export function validateDemoModel(model, site, pin) {
  assert.deepEqual(
    Object.keys(model.services).sort(),
    [
      'backend',
      'edge',
      'postgres',
      ...pipelineServices,
      'demo-issuer',
      'simulator',
    ].sort(),
  );
  for (const [name, service] of Object.entries(model.services)) {
    assert.equal(service.labels['com.fleetiq.deploy.owner'], site.owner.id);
    assert(
      !service.privileged &&
        !service.devices &&
        !service.cap_add?.length &&
        !service.network_mode &&
        !service.container_name &&
        !service.build &&
        !service.env_file,
    );
    if (name !== 'postgres') {
      assert.equal(service.read_only, true);
      assert.deepEqual(service.cap_drop, ['ALL']);
      assert.deepEqual(service.security_opt, ['no-new-privileges:true']);
      assert.equal(
        service.user,
        ['demo-issuer', 'simulator'].includes(name)
          ? `${process.getuid()}:${process.getgid()}`
          : '10001:10001',
      );
    }
    for (const port of service.ports ?? [])
      assert(['edge', 'demo-issuer'].includes(name) && port.host_ip === '127.0.0.1');
    for (const volume of service.volumes ?? [])
      if (volume.type === 'bind')
        assert(
          volume.read_only &&
            volume.source !== '/' &&
            !volume.target.includes('docker.sock'),
        );
  }
  assert.equal(model.name, site.baseline.name);
  assert.deepEqual(model.networks, site.baseline.networks);
  assert.deepEqual(model.volumes, site.baseline.volumes);
  for (const [name, original] of Object.entries(site.baseline.services)) {
    const expected = structuredClone(original);
    if (name === 'backend') {
      expected.environment.FLEETIQ_BROWSER_ORIGIN = demoIdentity.browser;
      expected.environment.FLEETIQ_OIDC_ADDITIONAL_CA_BUNDLE = '/run/secrets/demo_ca';
      expected.secrets.push({ source: 'demo_ca', target: '/run/secrets/demo_ca' });
      expected.depends_on['demo-issuer'] = structuredClone(
        expected.depends_on.postgres,
      );
    } else if (name === 'edge') {
      expected.volumes.find((v) => v.target === '/etc/caddy/Caddyfile').source =
        resolve(site.path, 'demo-public/Caddyfile');
      expected.volumes.push({
        type: 'bind',
        source: resolve(root, 'local/qualification/product/maps'),
        target: '/srv/maps',
        read_only: true,
        bind: {},
      });
      expected.secrets = ['demo_tls_cert', 'demo_tls_key'].map((source) => ({
        source,
        target: `/run/secrets/${source}`,
      }));
    } else if (name === 'tcp-ingestion') {
      delete expected.ports;
      expected.healthcheck = {
        test: ['CMD', '/bin/bash', '-c', 'exec 3<>/dev/tcp/127.0.0.1/55027'],
        interval: '1s',
        timeout: '3s',
        retries: 60,
      };
    }
    assert.deepEqual(model.services[name], expected);
  }
  const expectedSecrets = { ...site.baseline.secrets };
  for (const [name, file] of [
    ['demo_ca', 'ca.crt'],
    ['demo_tls_cert', 'tls.crt'],
    ['demo_tls_key', 'tls.key'],
  ])
    expectedSecrets[name] = {
      name: `${site.project}_${name}`,
      file: resolve(site.path, 'demo-public', file),
    };
  assert.deepEqual(model.secrets, expectedSecrets);
  const bind = (source, target) => ({
    type: 'bind',
    source,
    target,
    read_only: true,
    bind: {},
  });
  assert.deepEqual(model.services.simulator.volumes, [
    bind(resolve(site.path, 'demo-inputs'), '/run/demo'),
  ]);
  assert.deepEqual(model.services['demo-issuer'].volumes, [
    bind(resolve(root, 'local/demo'), '/app/local/demo'),
    bind(resolve(root, 'tools'), '/app/tools'),
    bind(resolve(root, 'node_modules'), '/app/node_modules'),
    bind(resolve(site.path, 'demo-issuer'), '/run/identity'),
  ]);
  const issuer = model.services['demo-issuer'];
  assert.deepEqual(issuer.entrypoint, [
    '/usr/local/bin/node',
    '--input-type=module',
    '-e',
  ]);
  assert.deepEqual(issuer.command, [
    "import {createDemoIssuer} from './local/demo/issuer.mjs';createDemoIssuer('/run/identity',{verifyCaKey:false}).listen(59443,'0.0.0.0');",
  ]);
  assert.equal(issuer.ports.length, 1);
  assert.equal(issuer.ports[0].target, 59443);
  assert.equal(issuer.ports[0].published, '59443');
  for (const role of ['demo-issuer', 'simulator'])
    assert.equal(Object.keys(model.services[role].environment ?? {}).length, 0);
  assert.equal(model.services.simulator.image, pin.image);
  assert.equal(model.services.simulator.pull_policy, 'never');
  assert.deepEqual(model.services.simulator.profiles, ['demo-send']);
  assert.deepEqual(model.services.simulator.command, [
    'run',
    '--config',
    '/run/demo/config.json',
  ]);
  assert.deepEqual(Object.keys(model.services.simulator.networks), ['device-ingress']);
  assert.equal(String(model.services.simulator.mem_limit), '268435456');
  assert.equal(model.services.simulator.pids_limit, 64);
  assert.equal(model.services.simulator.cpus, 1);
  assert.equal(
    model.services.backend.environment.FLEETIQ_BROWSER_ORIGIN,
    demoIdentity.browser,
  );
  assert.equal(
    model.services.backend.environment.FLEETIQ_OIDC_ISSUER,
    demoIdentity.issuer,
  );
  assert.equal(
    model.services.backend.environment.FLEETIQ_OIDC_ADDITIONAL_CA_BUNDLE,
    '/run/secrets/demo_ca',
  );
  assert.equal(model.services['demo-issuer'].image, pin.image);
  assert.equal(
    model.services['tcp-ingestion'].healthcheck.test.at(-1),
    'exec 3<>/dev/tcp/127.0.0.1/55027',
  );
  for (const kind of ['volumes', 'networks'])
    for (const resource of Object.values(model[kind]))
      assert(
        !resource.external &&
          resource.labels['com.fleetiq.deploy.owner'] === site.owner.id,
      );
}

function retainedDemo(name, docker) {
  validateDemoParents();
  const site = appliedInstallation(name, docker);
  const directory = privateDirectory(identityDirectory(name));
  const identity = loadDemoIdentity(directory);
  const artifact = privateFile(resolve(site.path, 'teltonika.wasm'));
  const settings = seedSettings(identity);
  const seed = loadDemoSeed(directory, { ...settings, artifact });
  const state = JSON.parse(privateFile(resolve(site.path, 'demo.json')));
  validateDemoOwner(
    state,
    site,
    seed,
    { image: state.simulator },
    demoInputFingerprint(site.path),
  );
  assert.equal(site.model.services.simulator.image, state.simulator);
  return { site, directory, identity, artifact, settings, seed, state };
}

/** Missing cache entries are pulled by digest; mismatched cached provenance fails closed. */
function admitSimulator(docker) {
  validateSimulatorPin(lock.simulator);
  let images;
  try {
    images = JSON.parse(
      run('docker', ['--context', docker, 'image', 'inspect', lock.simulator.image]),
    );
  } catch {
    run('docker', ['--context', docker, 'pull', lock.simulator.image], {
      timeout: 300000,
    });
    images = JSON.parse(
      run('docker', ['--context', docker, 'image', 'inspect', lock.simulator.image]),
    );
  }
  validateSimulatorImage(lock.simulator, images[0]);
}

function prepareDemoInstallation(name, docker) {
  validateDemoParents();
  assert(lock.simulator, 'Published simulator pin missing');
  const base = installation(name, docker);
  const directory = identityDirectory(name),
    identity = loadDemoIdentity(directory);
  assert.deepEqual(base.settings, {
    httpsPort: 58443,
    oidc: {
      issuer: demoIdentity.issuer,
      clientId: identity.clientId,
      authority: 'simulator-demo',
    },
  });
  assert(
    privateFile(resolve(base.path, 'oidc-client-secret'), 0o644).equals(
      Buffer.from(identity.clientSecret),
    ),
  );
  const artifact = privateFile(resolve(base.path, 'teltonika.wasm')),
    settings = seedSettings(identity);
  const seed = loadDemoSeed(directory, { ...settings, artifact });
  const state = JSON.parse(privateFile(resolve(base.path, 'demo.json')));
  validateDemoOwner(state, base, seed, lock.simulator, demoInputFingerprint(base.path));
  for (const file of ['identity.json', 'ca.crt', 'tls.crt', 'tls.key'])
    assert(
      privateFile(resolve(base.path, 'demo-issuer', file)).equals(
        privateFile(resolve(directory, file)),
      ),
    );
  for (const file of ['ca.crt', 'tls.crt', 'tls.key'])
    assert(
      privateFile(resolve(base.path, 'demo-public', file), 0o644).equals(
        privateFile(resolve(directory, file)),
      ),
    );
  admitSimulator(docker);
  const pipeline = pipelineInstallation(base, {
    tenantId: seed.tenantId,
    channelId: 'teltonika-tcp',
    packageId: 'vendor.teltonika',
    packageVersion: 'simulator-demo-1',
    identityPolicy: 'registered-identifiers',
    port: 55027,
  });
  const environment = {
    FLEETIQ_BROWSER_ORIGIN: demoIdentity.browser,
    FLEETIQ_SIMULATOR_IMAGE: lock.simulator.image,
    FLEETIQ_DEMO_USER: `${process.getuid()}:${process.getgid()}`,
    FLEETIQ_DEMO_ISSUER_DIR: resolve(base.path, 'demo-issuer'),
    FLEETIQ_DEMO_INPUT_DIR: resolve(base.path, 'demo-inputs'),
    FLEETIQ_DEMO_CADDY_FILE: resolve(base.path, 'demo-public/Caddyfile'),
    FLEETIQ_DEMO_CA_FILE: resolve(base.path, 'demo-public/ca.crt'),
    FLEETIQ_DEMO_CERT_FILE: resolve(base.path, 'demo-public/tls.crt'),
    FLEETIQ_DEMO_KEY_FILE: resolve(base.path, 'demo-public/tls.key'),
  };
  const compose = (args, options = {}) =>
    pipeline.compose(['--file', resolve(root, 'local/demo/compose.yaml'), ...args], {
      ...options,
      env: { ...environment, ...options.env },
    });
  const model = JSON.parse(
    compose(['--profile', 'demo-send', 'config', '--format', 'json']),
  );
  const site = { ...base, compose, model, baseline: pipeline.model };
  validateDemoModel(model, site, lock.simulator);
  return { site, directory, identity, artifact, settings, seed, state };
}

/** Stop/reset uses the retained recipe; startup alone admits the current published producer. */
export async function demoCommand(
  command,
  name,
  docker,
  artifactPath,
  { preflight = preflightDemoIdentity, reconcile = reconcileDemoBrowser } = {},
) {
  if (command === 'init') {
    initializeDemo(name, docker, artifactPath);
    return;
  }
  assert(['up', 'down', 'reset'].includes(command));
  const data =
    command === 'up'
      ? prepareDemoInstallation(name, docker)
      : retainedDemo(name, docker);
  const { site, directory, identity, artifact, settings } = data;
  await runDemoLifecycle(command, {
    owned: () => {
      assertOwnership(site);
    },
    infrastructure: async () => {
      retain(
        resolve(site.path, 'applied-compose.json'),
        Buffer.from(`${JSON.stringify(site.model, null, 2)}\n`),
      );
      site.compose(
        [
          'up',
          '--detach',
          '--wait',
          '--wait-timeout',
          '180',
          'postgres',
          'demo-issuer',
          'backend',
          'edge',
        ],
        { timeout: 240000 },
      );
      await preflight();
    },
    provision: async () => {
      site.compose(
        [
          'run',
          '--rm',
          '--no-deps',
          '-T',
          '-e',
          'FLEETIQ_BOOTSTRAP_ACTOR_ID',
          '-e',
          'FLEETIQ_BOOTSTRAP_AUTHORITY_ID',
          '-e',
          'FLEETIQ_BOOTSTRAP_EXTERNAL_SUBJECT',
          'backend',
          'bootstrap-platform-operator',
        ],
        {
          env: {
            FLEETIQ_BOOTSTRAP_ACTOR_ID: settings.actorId,
            FLEETIQ_BOOTSTRAP_AUTHORITY_ID: 'simulator-demo',
            FLEETIQ_BOOTSTRAP_EXTERNAL_SUBJECT: identity.subject,
          },
        },
      );
      await reconcile(directory, artifact, settings);
    },
    pipeline: () =>
      site.compose(
        ['up', '--detach', '--wait', '--wait-timeout', '60', ...pipelineServices],
        { timeout: 90000 },
      ),
    simulate: () => {
      const receipt = JSON.parse(
        site.compose(['run', '--rm', '--no-deps', '-T', 'simulator'], {
          timeout: 30000,
        }),
      );
      assert.deepEqual(receipt, { status: 'acknowledged', recordCount: 1 });
    },
    down: () => site.compose(['down', '--remove-orphans'], { timeout: 120000 }),
    reset: () => {
      site.compose(['down', '--volumes', '--remove-orphans'], { timeout: 120000 });
      assertOwnership(site);
      for (const type of ['volume', 'network'])
        assert.equal(
          run('docker', [
            '--context',
            docker,
            type,
            'ls',
            '--quiet',
            '--filter',
            `label=com.docker.compose.project=${site.project}`,
          ]),
          '',
        );
      assert.equal(
        run('docker', [
          '--context',
          docker,
          'ps',
          '--all',
          '--quiet',
          '--filter',
          `label=com.docker.compose.project=${site.project}`,
        ]),
        '',
      );
      rmSync(privateDirectory(site.path), { recursive: true });
      rmSync(privateDirectory(directory), { recursive: true });
    },
  });
}
