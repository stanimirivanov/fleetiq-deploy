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
import { setTimeout as delay } from 'node:timers/promises';
import {
  readPhase,
  waitPhase,
  writePhase,
} from '../../local/qualification/product/channel.mjs';
import { context } from '../installation.mjs';
import { digest, lock, ownedPath } from '../policy.mjs';
import { capture, root, run } from '../process.mjs';
import { qualifiedEdge } from '../qualified-edge.mjs';
import { imageInventory } from '../sources.mjs';
import { productCompose } from './compose.mjs';
import { collectServiceDiagnostics, diagnosticSummary } from './diagnostics.mjs';
import { prepareNormalEdge, prepareProductEdge } from './edge.mjs';
import { qualifyLifecycle } from './lifecycle.mjs';
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
      resolve(root, 'tools/demo-seed.mjs'),
      resolve(root, 'local/demo/seed.mjs'),
      resolve(root, 'local/demo/identity.yaml'),
    ]
      .map((path) => readFileSync(path))
      .join('\n'),
  );
}
async function waitForDelivery(observe) {
  const deadline = Date.now() + 90000;
  do {
    if (observe()) return;
    await delay(1000);
  } while (Date.now() < deadline);
  throw new Error('Synthetic notification observation timed out');
}

/** No local live operations are implied by structural validation. CI invokes this explicitly. */
export async function qualifyProduct(onProgress = () => {}) {
  // The driver is portable Node/CLI orchestration; context() verifies the actual
  // local daemon runs Linux containers before any artifact or runtime operation.
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
  const receiverState = () =>
    JSON.parse(
      compose(
        [
          'exec',
          '-T',
          'receiver',
          'node',
          '-e',
          "fetch('http://127.0.0.1:9094/state',{signal:AbortSignal.timeout(3000)}).then(async r=>{if(!r.ok)process.exit(1);console.log(await r.text())}).catch(()=>process.exit(1))",
        ],
        { timeout: 10000 },
      ),
    );
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
  const fingerprint = packaging();
  images.normalEdge = images.edge;
  images.edge = prepareProductEdge(docker, directory);
  prepareNormalEdge(directory);
  const helperName = `fleetiq-product-fixture:${fingerprint.slice(0, 24)}`;
  // Pull verifies remote availability independently of a warm local image cache.
  command(['pull', lock.images.alertmanager], { timeout: 300000, stdio: 'inherit' });
  command(['pull', inputs.objectStorage], { timeout: 300000, stdio: 'inherit' });
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
    ui: qualifiedEdge.revision,
    uiPublication: qualifiedEdge.publication,
    images: {
      backend: images.backend,
      edge: images.edge,
      normalEdge: images.normalEdge,
      helper,
    },
    checks: [],
    workerDefinitions: ['local/pipeline/compose.yaml', 'local/analytics/compose.yaml'],
    cleanup: 'pending',
    databaseReadiness: 'pending',
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
        'normal-edge',
        'alertmanager',
        'receiver',
      ],
      { timeout: 300000 },
    );
    owned();
    stage('verify-tcp-readiness-barrier');
    assert.equal(
      compose([
        'exec',
        '-T',
        '--user',
        'postgres',
        'postgres',
        'cat',
        '/tmp/fleetiq-readiness-proof',
      ]),
      'socket-only-readiness-rejected',
      'Fresh database must exercise the initialization race',
    );
    result.databaseReadiness = 'qualified';
    progress();
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
    stage('configure-disposable-history-budget');
    // One 4 MiB staged export plus one 2 MiB streaming download reservation.
    compose([
      'exec',
      '-T',
      'postgres',
      'psql',
      '-U',
      'fleetiq',
      '-d',
      'fleetiq',
      '-v',
      'ON_ERROR_STOP=1',
      '-c',
      "INSERT INTO history.lifecycle_policies (tenant_id, revision, actor_id, hot_days, archive_days, max_jobs, max_bytes) VALUES ('tenant-a',1,'operator-a',7,30,2,6291456)",
    ]);
    stage('register-calculator-release');
    const calculator = ownedPath(
      root,
      resolve(root, 'local/qualification/product/calculator.fixture.json'),
    );
    compose([
      'run',
      '--rm',
      '--no-deps',
      '--volume',
      `${calculator}:/run/calculator.json:ro`,
      '-e',
      'FLEETIQ_CALCULATOR_DEFINITION_FILE=/run/calculator.json',
      'analytics',
      'register-calculator',
    ]);
    owned();
    compose(['up', '-d', 'ingest', 'replay', 'semantic', 'projection']);
    tcpReady();
    writePhase(control, 'workers-started');
    result.lifecycle = await qualifyLifecycle({ compose, control, owned, stage });
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
    compose(['up', '-d', 'ingest', 'replay', 'semantic', 'projection']);
    tcpReady();
    owned();
    stage('isolate-router-and-receiver-outages');
    assert.deepEqual(receiverState(), {
      firing: false,
      resolved: false,
      rejected: false,
    });
    compose(['stop', 'alertmanager', 'receiver']);
    owned();
    compose(['up', '-d', '--no-deps', 'analytics', 'notification']);
    writePhase(control, 'restart-complete');

    stage('wait-for-durable-notification-exhaustion');
    await waitPhase(control, 'delivery-exhausted');
    owned();
    stage('restart-analytics-and-notification-workers');
    compose(['restart', '--timeout', '15', 'analytics', 'notification'], {
      timeout: 90000,
    });
    owned();
    compose(
      ['up', '-d', '--no-deps', '--wait', '--wait-timeout', '60', 'alertmanager'],
      { timeout: 90000 },
    );
    writePhase(control, 'retry-ready');

    stage('prove-router-accepted-with-receiver-stopped');
    await waitPhase(control, 'recovery-submitted');
    owned();
    const receiverId = compose(['ps', '-aq', 'receiver']);
    assert.equal(
      command(['inspect', '--format', '{{.State.Status}}', receiverId]),
      'exited',
    );
    await waitForDelivery(() => {
      const active = JSON.parse(
        compose(
          [
            'exec',
            '-T',
            'alertmanager',
            'wget',
            '-q',
            '-O',
            '-',
            'http://127.0.0.1:9093/api/v2/alerts',
          ],
          { timeout: 10000 },
        ),
      );
      return active.length === 1 && active[0].labels?.fleetiq_rule === 'latitude-spike';
    });
    owned();
    stage('restore-synthetic-receiver');
    compose(['start', 'receiver']);
    const delivered = (status) =>
      waitForDelivery(() => {
        let state;
        try {
          state = receiverState();
        } catch {
          return false;
        }
        assert.equal(state.rejected, false, 'Receiver rejected a mismatched episode');
        return state[status] === true;
      });
    await delivered('firing');
    writePhase(control, 'firing-delivered');

    stage('prove-resolution-at-synthetic-receiver');
    await waitPhase(control, 'analytics-resolved');
    owned();
    await delivered('resolved');
    writePhase(control, 'resolution-delivered');
    stage('browser-correction-and-revocation');
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
    result.failureDiagnostics = collectServiceDiagnostics({
      project: name,
      owner,
      command,
      capture: (args, options) =>
        capture('docker', ['--context', docker, ...args], options),
    });
    console.error(
      `Product services before cleanup: ${diagnosticSummary(result.failureDiagnostics)}`,
    );
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
