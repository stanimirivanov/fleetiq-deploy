import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { request } from 'node:https';
import { resolve } from 'node:path';
import { demoCommand } from './demo.mjs';
import { preflightDemoIdentity } from './demo-identity.mjs';
import { appliedInstallation, context, instancePath } from './installation.mjs';
import { digest, lock } from './policy.mjs';
import { CommandFailure, capture, root, run } from './process.mjs';
import { productInputs } from './product/compose.mjs';
import {
  collectServiceDiagnostics,
  diagnosticSummary,
} from './product/diagnostics.mjs';
import { imageInventory } from './sources.mjs';

/** Keep native errors private while identifying only reviewed source modules and failure classes. */
export function demoFailureDiagnostic(error) {
  const category =
    error instanceof CommandFailure
      ? 'command-failed'
      : error instanceof assert.AssertionError
        ? 'assertion'
        : 'unexpected';
  const location =
    error instanceof Error
      ? error.stack?.match(
          /tools\/(demo(?:-qualification|-seed)?\.mjs):([0-9]+):[0-9]+/u,
        )
      : null;
  return `${category}${location ? `@${location[1]}:${location[2]}` : ''}`;
}

/** Exercises the actual producer and owned lifecycle; evidence contains fixed checks only. */
export async function qualifyDemo() {
  assert(lock.simulator, 'Published simulator pin missing');
  const docker = context();
  const execute = (args, options = {}) =>
    run('docker', ['--context', docker, ...args], options);
  const owner = randomUUID(),
    name = `demo-q-${owner.slice(0, 12)}`;
  mkdirSync(resolve(root, '.local'), { recursive: true });
  const scratch = mkdtempSync(resolve(root, '.local/demo-qualification-'));
  const identity = resolve(root, '.local/demo-identities', name),
    path = instancePath(name);
  const artifactContainer = `demo-artifact-${owner}`,
    browserContainer = `demo-browser-${owner}`;
  const unrelatedContainer = `demo-unrelated-${owner}`,
    unrelatedVolume = `demo-unrelated-${owner}`;
  const foreignVolume = `fleetiq-dev-${name}_database`;
  const marker = 'com.fleetiq.demo.test-owner';
  let initialized = false,
    foreign = false,
    phase = 'prepare';
  let siteOwner;
  const checks = [];
  let failure = null,
    measurements = null;
  const remove = (type, id) => {
    const [resource] = JSON.parse(execute([type, 'inspect', id]));
    assert.equal(
      (type === 'container' ? resource.Config.Labels : resource.Labels)[marker],
      owner,
    );
    execute([type, 'rm', ...(type === 'container' ? ['--force'] : []), id]);
  };
  const retained = () =>
    digest(
      Buffer.concat([
        readFileSync(resolve(identity, 'identity.json')),
        readFileSync(resolve(identity, 'seed/journal.json')),
        readFileSync(resolve(path, 'demo.json')),
        readFileSync(resolve(path, 'demo-inputs/config.json')),
        readFileSync(resolve(path, 'demo-inputs/identities.json')),
      ]),
    );
  try {
    const images = imageInventory(docker);
    execute([
      'create',
      '--name',
      artifactContainer,
      '--label',
      `${marker}=${owner}`,
      '--network',
      'none',
      images.backend,
    ]);
    const artifact = resolve(scratch, 'teltonika.wasm');
    execute([
      'cp',
      `${artifactContainer}:/usr/share/fleetiq/qualification/teltonika.wasm`,
      artifact,
    ]);
    chmodSync(artifact, 0o600);
    phase = 'initialize';
    await demoCommand('init', name, docker, artifact);
    initialized = true;
    const site = appliedInstallation(name, docker);
    siteOwner = site.owner.id;
    const original = retained();
    execute(['volume', 'create', '--label', `${marker}=${owner}`, unrelatedVolume]);
    execute([
      'run',
      '--detach',
      '--name',
      unrelatedContainer,
      '--label',
      `${marker}=${owner}`,
      '--network',
      'none',
      '--read-only',
      '--cap-drop',
      'ALL',
      '--security-opt',
      'no-new-privileges',
      '--user',
      '65534:65534',
      '--entrypoint',
      '/usr/local/bin/node',
      lock.simulator.image,
      '-e',
      'setTimeout(()=>{},600000)',
    ]);
    phase = 'ownership-rejection';
    execute([
      'volume',
      'create',
      '--label',
      `${marker}=${owner}`,
      '--label',
      `com.docker.compose.project=${site.project}`,
      '--label',
      'com.fleetiq.deploy.owner=foreign',
      foreignVolume,
    ]);
    foreign = true;
    await assert.rejects(demoCommand('reset', name, docker));
    assert.equal(retained(), original);
    checks.push('foreign-owner-refused');
    remove('volume', foreignVolume);
    foreign = false;
    await assert.rejects(demoCommand('reset', name, 'foreign-context'));
    assert.equal(retained(), original);
    checks.push('foreign-context-refused');
    phase = 'browser-fixture';
    const helper = `fleetiq-demo-browser:${owner}`;
    execute(
      [
        'buildx',
        'build',
        '--load',
        '--file',
        'local/qualification/product/Dockerfile',
        '--build-arg',
        `BROWSER_IMAGE=${productInputs.browser}`,
        '--tag',
        helper,
        '.',
      ],
      { timeout: 600000 },
    );
    const [built] = JSON.parse(execute(['image', 'inspect', helper]));
    const bind = (source, target, readonly = true) => [
      '--mount',
      `type=bind,source=${source},target=${target}${readonly ? ',readonly' : ''}`,
    ];
    const adapters = {
      preflight: () =>
        preflightDemoIdentity({
          resolveHost: async () => [{ address: '127.0.0.1', family: 4 }],
          requestHttps: (url, options, callback) =>
            request(
              url,
              { ...options, ca: readFileSync(resolve(path, 'demo-public/ca.crt')) },
              callback,
            ),
        }),
      reconcile: async (directory, component, settings) => {
        assert(component.equals(readFileSync(resolve(path, 'teltonika.wasm'))));
        writeFileSync(resolve(scratch, 'request.json'), JSON.stringify(settings), {
          mode: 0o600,
        });
        try {
          const result = execute(
            [
              'run',
              '--rm',
              '--init',
              '--name',
              browserContainer,
              '--label',
              `${marker}=${owner}`,
              '--network',
              'host',
              '--user',
              `${process.getuid()}:${process.getgid()}`,
              '--read-only',
              '--cap-drop',
              'ALL',
              '--security-opt',
              'no-new-privileges',
              '--pids-limit',
              '256',
              '--memory',
              '1g',
              '--env',
              'HOME=/tmp/home',
              '--tmpfs',
              '/tmp:size=256m,mode=1777,noexec,nosuid',
              '--tmpfs',
              `/run/seed-parent:size=1m,mode=0700,uid=${process.getuid()},gid=${process.getgid()},noexec,nosuid`,
              ...bind(resolve(directory, 'seed'), '/run/seed-parent/seed', false),
              ...bind(resolve(path, 'teltonika.wasm'), '/run/input/teltonika.wasm'),
              ...bind(
                resolve(scratch, 'request.json'),
                '/run/qualification/request.json',
              ),
              ...bind(resolve(path, 'demo-public/ca.crt'), '/run/public/ca.crt'),
              ...bind(
                resolve(root, 'local/demo/qualify-browser.mjs'),
                '/fixture/local/demo/qualify-browser.mjs',
              ),
              built.Id,
              'local/demo/qualify-browser.mjs',
            ],
            { timeout: 180000 },
          );
          assert.equal(result, 'demo-seed-qualified');
        } finally {
          const ids = execute([
            'ps',
            '--all',
            '--quiet',
            '--filter',
            `name=^${browserContainer}$`,
          ]);
          if (ids) remove('container', browserContainer);
        }
      },
    };
    phase = 'first-up';
    await demoCommand('up', name, docker, undefined, adapters);
    checks.push('real-producer-ack');
    const provisioned = retained();
    phase = 'retained-restart';
    await demoCommand('down', name, docker);
    assert.equal(retained(), provisioned);
    await demoCommand('up', name, docker, undefined, adapters);
    assert.equal(retained(), provisioned);
    checks.push('retained-restart');
    phase = 'reset';
    await demoCommand('reset', name, docker);
    initialized = false;
    assert(!existsSync(path) && !existsSync(identity));
    checks.push('owned-reset');
    const [canary] = JSON.parse(execute(['container', 'inspect', unrelatedContainer]));
    assert.equal(canary.State.Running, true);
    assert.equal(canary.Config.Labels[marker], owner);
    const [volume] = JSON.parse(execute(['volume', 'inspect', unrelatedVolume]));
    assert.equal(volume.Labels[marker], owner);
    checks.push('unrelated-resources-retained');
    measurements = {
      checks,
      simulator: lock.simulator.image,
      source: lock.simulator.commit,
    };
  } catch (error) {
    const diagnostics = siteOwner
      ? collectServiceDiagnostics({
          project: `fleetiq-dev-${name}`,
          owner: siteOwner,
          command: execute,
          capture: (args, options) =>
            capture('docker', ['--context', docker, ...args], options),
        })
      : { services: [] };
    failure = new Error(
      `Demo lifecycle qualification failed at ${phase} (${demoFailureDiagnostic(error)}); ${diagnosticSummary(diagnostics)}; no acceptance pass`,
    );
  } finally {
    try {
      if (foreign) remove('volume', foreignVolume);
      if (initialized) await demoCommand('reset', name, docker);
      for (const id of [artifactContainer, browserContainer, unrelatedContainer]) {
        const ids = execute(['ps', '--all', '--quiet', '--filter', `name=^${id}$`]);
        if (ids) remove('container', id);
      }
      const volumes = execute([
        'volume',
        'ls',
        '--quiet',
        '--filter',
        `name=^${unrelatedVolume}$`,
      ]);
      if (volumes) remove('volume', unrelatedVolume);
      rmSync(scratch, { recursive: true, force: true });
    } catch {
      failure = new Error(
        `Demo lifecycle cleanup incomplete after ${phase}; no acceptance pass`,
      );
    }
  }
  if (failure) throw failure;
  return measurements;
}
