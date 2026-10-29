import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { composePolicy, config, identityKeys, lock, ownedPath } from './policy.mjs';
import { root, run } from './process.mjs';
import { imageInventory } from './sources.mjs';

export function context({ execute = run, environment = process.env } = {}) {
  for (const key of [
    'COMPOSE_FILE',
    'COMPOSE_PROJECT_NAME',
    'COMPOSE_PROFILES',
    'COMPOSE_ENV_FILES',
    'DOCKER_HOST',
    'DOCKER_TLS_VERIFY',
    'NODE_TLS_REJECT_UNAUTHORIZED',
  ])
    assert(!environment[key], `Unsupported ambient setting: ${key}`);
  const selected = execute('docker', ['context', 'show']);
  const [details] = JSON.parse(execute('docker', ['context', 'inspect', selected]));
  assert(
    /^unix:\/\//u.test(details.Endpoints.docker.Host),
    'Use a local Docker context',
  );
  assert.equal(
    execute('docker', ['--context', selected, 'info', '--format', '{{.OSType}}']),
    'linux',
  );
  assert.equal(
    execute('docker', ['--context', selected, 'compose', 'version', '--short']).replace(
      /^v/u,
      '',
    ),
    lock.tools.compose,
  );
  return selected;
}
export function privateJson(parent, name) {
  try {
    return JSON.parse(readFileSync(ownedPath(parent, resolve(parent, name))));
  } catch {
    throw new Error('Private configuration is missing or malformed');
  }
}
export function instancePath(name) {
  assert.match(name, /^[a-z][a-z0-9-]{0,30}$/u, 'Invalid instance name');
  return resolve(root, '.local/instances', name);
}
export function initialize(
  name,
  docker,
  settings = config(
    JSON.parse(readFileSync(resolve(root, 'local/config.example.json'))),
  ),
) {
  config(settings);
  const path = instancePath(name);
  if (existsSync(resolve(root, '.local'))) ownedPath(root, resolve(root, '.local'));
  assert(!existsSync(path), 'Instance already exists; reuse or choose a new name');
  mkdirSync(path, { recursive: true, mode: 0o700 });
  chmodSync(path, 0o700);
  const owner = {
    schemaVersion: 1,
    name,
    id: randomUUID(),
    context: docker,
    daemonId: run('docker', ['--context', docker, 'info', '--format', '{{.ID}}']),
  };
  writeFileSync(resolve(path, 'owner.json'), `${JSON.stringify(owner, null, 2)}\n`);
  writeFileSync(resolve(path, 'config.json'), `${JSON.stringify(settings, null, 2)}\n`);
  // Parent directory is private. File readability is needed for UID 10001 when
  // Compose implements secrets as bind mounts (its mode option is not portable).
  writeFileSync(resolve(path, 'database-password'), randomBytes(32).toString('hex'), {
    mode: 0o644,
  });
  writeFileSync(
    resolve(path, 'oidc-client-secret'),
    'REPLACE_WITH_PROVIDER_CLIENT_SECRET',
    { mode: 0o644 },
  );
  return owner;
}
export function installation(
  name,
  docker,
  qualification = false,
  requireIdentity = true,
) {
  const path = instancePath(name);
  ownedPath(root, resolve(root, '.local'));
  ownedPath(resolve(root, '.local'), resolve(root, '.local/instances'));
  ownedPath(resolve(root, '.local/instances'), path);
  const owner = privateJson(path, 'owner.json');
  assert.match(owner.id, /^[a-f0-9-]{36}$/u);
  assert.equal(owner.name, name);
  assert.match(owner.id, /^[a-f0-9-]{36}$/u);
  assert.equal(owner.context, docker, 'Docker context changed since initialization');
  assert.equal(
    owner.daemonId,
    run('docker', ['--context', docker, 'info', '--format', '{{.ID}}']),
    'Docker daemon changed since initialization',
  );
  const settings = config(privateJson(path, 'config.json'));
  const passwordFile = ownedPath(path, resolve(path, 'database-password'));
  assert(
    /^[a-f0-9]{64}$/u.test(readFileSync(passwordFile, 'utf8')),
    'Invalid database password file',
  );
  const secretFile = ownedPath(path, resolve(path, 'oidc-client-secret'));
  const secret = readFileSync(secretFile, 'utf8').replace(/\r?\n$/u, '');
  assert(
    secret.length > 0 && secret.length <= 4096 && !/[\r\n\0]/u.test(secret),
    'Invalid OIDC secret file',
  );
  if (!qualification && requireIdentity) {
    assert(
      !settings.oidc.issuer.includes('.invalid'),
      'Configure a real HTTPS OIDC issuer before normal startup',
    );
    assert(
      !secret.startsWith('REPLACE_'),
      'Configure the provider client secret before normal startup',
    );
  }
  const images = imageInventory(docker);
  const environment = {
    ...process.env,
    COMPOSE_DISABLE_ENV_FILE: '1',
    FLEETIQ_OWNER: owner.id,
    FLEETIQ_HTTPS_PORT: String(settings.httpsPort),
    FLEETIQ_POSTGRES_IMAGE: lock.images.postgres,
    FLEETIQ_NODE_IMAGE: lock.images.node,
    FLEETIQ_BACKEND_IMAGE: images.backend,
    FLEETIQ_EDGE_IMAGE: images.edge,
    FLEETIQ_DATABASE_PASSWORD_FILE: passwordFile,
    FLEETIQ_OIDC_SECRET_FILE: secretFile,
    FLEETIQ_BROWSER_ORIGIN: `https://localhost:${settings.httpsPort}`,
    FLEETIQ_OIDC_ISSUER: settings.oidc.issuer,
    FLEETIQ_OIDC_CLIENT_ID: settings.oidc.clientId,
    FLEETIQ_OIDC_IDENTITY_AUTHORITY: settings.oidc.authority,
  };
  // Prevent a caller's workload tokens or stray secret overriding browser mode.
  for (const key of Object.keys(environment))
    if (
      key.startsWith('FLEETIQ_') &&
      !(
        key in
        {
          FLEETIQ_OWNER: 1,
          FLEETIQ_HTTPS_PORT: 1,
          FLEETIQ_POSTGRES_IMAGE: 1,
          FLEETIQ_NODE_IMAGE: 1,
          FLEETIQ_BACKEND_IMAGE: 1,
          FLEETIQ_EDGE_IMAGE: 1,
          FLEETIQ_DATABASE_PASSWORD_FILE: 1,
          FLEETIQ_OIDC_SECRET_FILE: 1,
          ...Object.fromEntries(identityKeys.map((key) => [key, 1])),
        }
      )
    )
      delete environment[key];
  const project = `fleetiq-dev-${name}`;
  const base = [
    '--context',
    docker,
    'compose',
    '--project-name',
    project,
    '--project-directory',
    resolve(root, 'local'),
    '--file',
    resolve(root, 'local/compose.yaml'),
  ];
  if (qualification)
    base.push('--file', resolve(root, 'local/qualification/compose.yaml'));
  const compose = (args, options = {}, probe = false) =>
    run(
      'docker',
      [
        ...base,
        ...(probe ? ['--file', resolve(root, 'local/qualification/proxy.yaml')] : []),
        ...args,
      ],
      { ...options, env: { ...environment, ...options.env } },
    );
  const model = JSON.parse(compose(['config', '--format', 'json']));
  composePolicy(model, qualification);
  return { owner, project, path, settings, images, compose, docker, model };
}
export function assertOwnership(site) {
  const ids = run('docker', [
    '--context',
    site.docker,
    'ps',
    '--all',
    '--quiet',
    '--filter',
    `label=com.docker.compose.project=${site.project}`,
  ])
    .split(/\s+/u)
    .filter(Boolean);
  for (const id of ids) {
    const [object] = JSON.parse(
      run('docker', ['--context', site.docker, 'inspect', id]),
    );
    assert.equal(
      object.Config.Labels['com.fleetiq.deploy.owner'],
      site.owner.id,
      'Foreign container in project',
    );
  }
  for (const type of ['volume', 'network']) {
    const names = run('docker', [
      '--context',
      site.docker,
      type,
      'ls',
      '--quiet',
      '--filter',
      `label=com.docker.compose.project=${site.project}`,
    ])
      .split(/\s+/u)
      .filter(Boolean);
    const allNames = run('docker', ['--context', site.docker, type, 'ls', '--quiet'])
      .split(/\s+/u)
      .filter(Boolean);
    const expected = Object.values(
      type === 'volume' ? site.model.volumes : site.model.networks,
    ).map((object) => object.name);
    for (const name of new Set([
      ...names,
      ...expected.filter((name) => allNames.includes(name)),
    ])) {
      const [object] = JSON.parse(
        run('docker', ['--context', site.docker, type, 'inspect', name]),
      );
      assert.equal(
        object.Labels['com.fleetiq.deploy.owner'],
        site.owner.id,
        'Foreign resource in project',
      );
    }
  }
}
export function appliedInstallation(name, docker) {
  const path = instancePath(name);
  ownedPath(root, resolve(root, '.local'));
  ownedPath(resolve(root, '.local/instances'), path);
  const owner = privateJson(path, 'owner.json');
  assert.equal(owner.name, name);
  assert.equal(owner.context, docker, 'Docker context changed since initialization');
  assert.equal(
    owner.daemonId,
    run('docker', ['--context', docker, 'info', '--format', '{{.ID}}']),
    'Docker daemon changed since initialization',
  );
  const model = privateJson(path, 'applied-compose.json');
  const project = `fleetiq-dev-${name}`;
  assert.equal(model.name, project);
  assert.deepEqual(Object.keys(model.services).sort(), ['backend', 'edge', 'postgres']);
  for (const service of Object.values(model.services)) assert(!service.container_name);
  const recipe = ownedPath(path, resolve(path, 'applied-compose.json'));
  const compose = (args, options = {}) =>
    run(
      'docker',
      [
        '--context',
        docker,
        'compose',
        '--project-name',
        project,
        '--file',
        recipe,
        ...args,
      ],
      { ...options, env: { ...process.env, COMPOSE_DISABLE_ENV_FILE: '1' } },
    );
  return { owner, project, path, model, compose, docker };
}
export function up(site) {
  assertOwnership(site);
  const recipe = resolve(site.path, 'applied-compose.json');
  if (existsSync(recipe)) ownedPath(site.path, recipe);
  // Recovery reads this validated rendered recipe, not mutable current config.
  // Secret values are absent; only mounted file paths and public identity settings remain.
  writeFileSync(recipe, `${JSON.stringify(site.model, null, 2)}\n`);
  site.compose(['up', '--detach', '--wait', '--wait-timeout', '180'], {
    timeout: 240_000,
  });
}
export function down(site, volumes = false) {
  assertOwnership(site);
  site.compose(['down', '--remove-orphans', ...(volumes ? ['--volumes'] : [])], {
    timeout: 120_000,
  });
}
export function exportCertificate(site) {
  const id = site.compose(['ps', '--quiet', 'edge']);
  assert(id, 'Edge container is not running');
  assertOwnership(site);
  const path = resolve(site.path, 'root-ca.crt');
  if (existsSync(path)) ownedPath(site.path, path);
  run('docker', [
    '--context',
    site.docker,
    'cp',
    `${id}:/data/caddy/pki/authorities/local/root.crt`,
    path,
  ]);
  return path;
}
