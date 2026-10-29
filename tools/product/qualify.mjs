import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  chmodSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { resolve } from 'node:path';
import {
  readPhase,
  waitPhase,
  writePhase,
} from '../../local/qualification/product/channel.mjs';
import { context } from '../installation.mjs';
import { digest, lock, ownedPath } from '../policy.mjs';
import { root, run } from '../process.mjs';
import { imageInventory } from '../sources.mjs';
import { productCompose } from './compose.mjs';
import { assertResource, completeProduct, inputs, productPolicy } from './policy.mjs';

function packaging() {
  const directory = resolve(root, 'local/qualification/product');
  const paths = readdirSync(directory, { recursive: true })
    .map((path) => resolve(directory, path))
    .filter((path) => statSync(path).isFile())
    .sort();
  return digest(
    [
      ...paths,
      resolve(root, 'package.json'),
      resolve(root, 'pnpm-lock.yaml'),
      resolve(root, 'local/backend-entrypoint.sh'),
    ]
      .map((path) => readFileSync(path))
      .join('\n'),
  );
}
/** No local live operations are implied by structural validation. CI invokes this explicitly. */
export async function qualifyProduct(onProgress = () => {}) {
  assert.equal(
    process.platform,
    'linux',
    'Installed qualification requires Linux Docker',
  );
  const docker = context(),
    images = imageInventory(docker);
  const daemon = run('docker', ['--context', docker, 'info', '--format', '{{.ID}}']);
  const owner = randomUUID(),
    name = `product-${owner.replaceAll('-', '').slice(0, 16)}`;
  ownedPath(root, resolve(root, '.local'));
  const directory = resolve(root, '.local', name);
  mkdirSync(directory, { mode: 0o700 });
  ownedPath(root, directory);
  const control = resolve(directory, 'control');
  mkdirSync(control, { mode: 0o777 });
  chmodSync(control, 0o777);
  const file = resolve(directory, 'compose.json');
  const command = (args, options) =>
    run('docker', ['--context', docker, ...args], options);
  const compose = (args, options) =>
    command(['compose', '--project-name', name, '--file', file, ...args], options);
  // Probe only TCP readiness, never a fabricated identifier or telemetry record.
  const tcpReady = () => {
    compose(
      [
        'exec',
        '-T',
        'browser',
        'node',
        '--input-type=module',
        '-e',
        `import net from 'node:net'; import {setTimeout as delay} from 'node:timers/promises'; for(let i=0;i<60;i++){ const ok=await new Promise(r=>{const s=net.connect(55027,'ingest');s.setTimeout(1000);s.once('connect',()=>{s.destroy();r(true)});s.once('error',()=>r(false));s.once('timeout',()=>{s.destroy();r(false)});}); if(ok)process.exit(0);await delay(1000);}process.exit(1);`,
      ],
      { timeout: 90000 },
    );
  };
  const filter = ['--filter', `label=com.docker.compose.project=${name}`];
  const resources = () => ({
    container: command(['ps', '-aq', ...filter])
      .split(/\s+/u)
      .filter(Boolean),
    volume: command(['volume', 'ls', '-q', ...filter])
      .split(/\s+/u)
      .filter(Boolean),
    network: command(['network', 'ls', '-q', ...filter])
      .split(/\s+/u)
      .filter(Boolean),
  });
  function owned() {
    assert.equal(
      command(['info', '--format', '{{.ID}}']),
      daemon,
      'Docker daemon changed',
    );
    for (const [kind, ids] of Object.entries(resources()))
      for (const id of ids) {
        const [resource] = JSON.parse(
          command(kind === 'container' ? ['inspect', id] : [kind, 'inspect', id]),
        );
        assertResource(resource, name, owner, kind);
      }
  }
  // Refuse pre-existing names, even if their labels would conceal them from discovery.
  for (const kind of ['volume', 'network']) {
    const names = command([kind, 'ls', '--format', '{{.Name}}']).split(/\s+/u);
    assert(
      !names.some((candidate) => candidate.startsWith(`${name}_`)),
      'Refusing existing resource names',
    );
  }
  assert(Object.values(resources()).every((values) => values.length === 0));
  const fingerprint = packaging(),
    helperName = `fleetiq-product-fixture:${fingerprint.slice(0, 24)}`;
  // Pull verifies remote availability independently of a warm local image cache.
  command(['pull', inputs.browser], { timeout: 300000, stdio: 'inherit' });
  command(
    [
      'buildx',
      'build',
      '--load',
      '--file',
      'local/qualification/product/Dockerfile',
      '--build-arg',
      `BROWSER_IMAGE=${inputs.browser}`,
      '--label',
      `com.fleetiq.deploy.packaging=${fingerprint}`,
      '--iidfile',
      resolve(directory, 'helper.iid'),
      '--tag',
      helperName,
      '.',
    ],
    { timeout: 600000, stdio: 'inherit' },
  );
  const helper = readFileSync(resolve(directory, 'helper.iid'), 'utf8').trim();
  assert.match(helper, /^sha256:[a-f0-9]{64}$/u);
  const [built] = JSON.parse(command(['image', 'inspect', helper]));
  assert.equal(built.Id, helper);
  assert.equal(built.Config.Labels['com.fleetiq.deploy.packaging'], fingerprint);
  const spec = productCompose({ name, owner, images, helper, control });
  productPolicy(spec);
  writeFileSync(file, JSON.stringify(spec, null, 2));
  writeFileSync(
    resolve(directory, 'owner.json'),
    JSON.stringify({
      name,
      owner,
      docker,
      daemon: command(['info', '--format', '{{.ID}}']),
    }),
  );
  const result = {
    identity: 'real-disposable-oidc',
    platform: lock.sources.platform.commit,
    ui: lock.sources.ux.commit,
    images: { backend: images.backend, edge: images.edge, helper },
    checks: [],
    cleanup: 'pending',
    stage: 'initialize',
  };
  const progress = () => onProgress(structuredClone(result));
  const stage = (value) => {
    result.stage = value;
    progress();
  };
  progress();
  try {
    owned();
    stage('generate-disposable-trust');
    compose(['run', '--rm', '--no-deps', 'init']);
    owned();
    stage('prepare-compiled-component');
    compose(['run', '--rm', '--no-deps', 'artifacts']);
    owned();
    stage('start-trusted-services');
    compose(
      [
        'up',
        '-d',
        '--wait',
        '--wait-timeout',
        '240',
        'postgres',
        'issuer',
        'backend',
        'edge',
      ],
      { timeout: 300000 },
    );
    owned();
    stage('bootstrap-operator');
    compose([
      'run',
      '--rm',
      '--no-deps',
      '-e',
      'FLEETIQ_BOOTSTRAP_ACTOR_ID=operator-a',
      '-e',
      'FLEETIQ_BOOTSTRAP_AUTHORITY_ID=qualification-oidc',
      '-e',
      'FLEETIQ_BOOTSTRAP_EXTERNAL_SUBJECT=operator-a',
      'backend',
      'bootstrap-platform-operator',
      '--check-schema',
    ]);
    owned();
    compose(['up', '-d', '--no-deps', 'browser']);
    stage('browser-sign-in-and-commissioning');
    await waitPhase(control, 'setup-ready');
    owned();
    compose(['up', '-d', '--no-deps', 'ingest', 'replay', 'semantic', 'projection']);
    tcpReady();
    writePhase(control, 'workers-started');
    stage('device-to-browser');
    await waitPhase(control, 'initial-visible');
    owned();
    stage('restart-and-generation-reset');
    compose(['stop', 'ingest', 'replay', 'semantic', 'projection', 'backend'], {
      timeout: 120000,
    });
    owned();
    compose(['restart', 'postgres'], { timeout: 120000 });
    owned();
    compose(['up', '-d', '--wait', '--wait-timeout', '120', 'postgres'], {
      timeout: 180000,
    });
    // Advance only this disposable projection generation: old live cursors must reset.
    owned();
    compose(
      [
        'run',
        '--rm',
        '--no-deps',
        '-e',
        'FLEETIQ_PROJECTION_REBUILD_TENANT=tenant-a',
        'backend',
        'rebuild-current',
      ],
      { timeout: 120000 },
    );
    owned();
    compose(['up', '-d', '--wait', '--wait-timeout', '180', 'backend'], {
      timeout: 240000,
    });
    owned();
    compose(['up', '-d', '--no-deps', 'ingest', 'replay', 'semantic', 'projection']);
    tcpReady();
    writePhase(control, 'restart-complete');
    stage('browser-resnapshot-map-and-revocation');
    const completed = await waitPhase(control, 'complete', 360);
    result.checks = completeProduct(completed);
    progress();
    const [browserContainer] = JSON.parse(
      command(['inspect', compose(['ps', '-aq', 'browser'])]),
    );
    if (browserContainer.State.Status !== 'exited')
      command(['wait', browserContainer.Id], { timeout: 30000 });
    const [finished] = JSON.parse(command(['inspect', browserContainer.Id]));
    assert.equal(finished.State.ExitCode, 0);
  } catch (error) {
    const failure = readPhase(control, 'failed');
    if (failure) result.checks = failure.checks;
    progress();
    throw new Error(
      `Installed product failed at ${result.stage}; last completed check: ${result.checks.at(-1) ?? 'none'}. ${error.message}`,
    );
  } finally {
    // Fail closed on foreign ownership. Never prune, remove images, or inspect secrets.
    owned();
    compose(['down', '--volumes', '--remove-orphans', '--timeout', '20'], {
      timeout: 120000,
    });
    assert(
      Object.values(resources()).every((values) => values.length === 0),
      'Owned cleanup incomplete',
    );
    result.cleanup = 'passed';
    progress();
  }
  return result;
}
