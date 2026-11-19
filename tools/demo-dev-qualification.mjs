import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { demoCommand, validateDemoParents } from './demo.mjs';
import { developmentSecretCheck, developmentSource } from './demo-dev.mjs';
import { developmentCommand, developmentFailureCode } from './demo-dev-lifecycle.mjs';
import { developmentObjects } from './demo-dev-sources.mjs';
import { qualifyDemo } from './demo-qualification.mjs';
import { assertOwnership } from './installation.mjs';
import { digest, ownedPath } from './policy.mjs';
import { pnpm, root, run } from './process.mjs';
import { prepareRecovery } from './simulator-recovery.mjs';

/** Own two fresh disposable clones; existing developer sources are never adopted or reset. */
function sourceFixtures(owner) {
  validateDemoParents();
  const parent = resolve(root, '.local/dev-sources');
  if (existsSync(parent)) assert.equal(realpathSync(parent), parent);
  mkdirSync(parent, { recursive: true, mode: 0o700 });
  assert.equal(realpathSync(parent), parent);
  const paths = ['ui', 'platform'].map((role) => resolve(parent, role));
  assert(
    paths.every((path) => !lstatSync(path, { throwIfNoEntry: false })),
    'Development smoke requires absent dev source clones',
  );
  const created = [];
  const cleanup = () => {
    for (const path of created) {
      assert.equal(realpathSync(path), path);
      assert.equal(lstatSync(path).uid, process.getuid());
      assert.equal(
        readFileSync(
          ownedPath(path, resolve(path, '.git/fleetiq-qualification-owner')),
          'utf8',
        ),
        owner,
      );
      rmSync(path, { recursive: true });
    }
  };
  try {
    for (const [index, role] of ['ui', 'platform'].entries()) {
      const path = paths[index];
      const selection = developmentObjects(role);
      run('git', ['clone', '--no-checkout', '--no-hardlinks', selection.path, path], {
        timeout: 300000,
      });
      chmodSync(path, 0o700);
      writeFileSync(resolve(path, '.git/fleetiq-qualification-owner'), owner, {
        flag: 'wx',
        mode: 0o600,
      });
      created.push(path);
      run('git', ['-C', path, 'remote', 'set-url', 'origin', selection.repository]);
      run('git', ['-C', path, 'checkout', '--detach', selection.commit], {
        timeout: 300000,
      });
    }
    const environment = { ...process.env };
    for (const key of ['GH_TOKEN', 'GITHUB_TOKEN', 'FLEETIQ_SOURCE_READ_TOKEN'])
      delete environment[key];
    pnpm(['install', '--frozen-lockfile'], {
      cwd: paths[0],
      timeout: 300000,
      env: environment,
    });
    return { ui: paths[0], platform: paths[1], cleanup };
  } catch (error) {
    cleanup();
    throw error;
  }
}

/** Separate unqualified development witness; the ordinary reviewed-image lifecycle still owns teardown. */
export async function qualifyDevelopment() {
  const owner = randomUUID();
  let sources;
  let phase = 'sources';
  let detail = 'unexpected';
  let failure, evidence;
  let active,
    browserProof,
    backendProof = false,
    retained = false,
    recovered = false,
    restored = false;
  try {
    sources = sourceFixtures(owner);
    phase = 'source-secrets';
    const uiSource = developmentSource('ui');
    await developmentSecretCheck(uiSource);
    const identityFile = resolve(
      sources.ui,
      'apps/web/src/features/identity/ui/OperatorSessionProvider.tsx',
    );
    const identitySource = readFileSync(identityFile);
    let credentialRefused = false;
    try {
      writeFileSync(
        identityFile,
        Buffer.concat([
          identitySource,
          Buffer.from(
            '\nconst access_token = ' +
              JSON.stringify(`ghp_${randomUUID().replaceAll('-', '')}a1B2`) +
              ';\n',
          ),
        ]),
      );
      try {
        await developmentSecretCheck(uiSource);
      } catch (error) {
        credentialRefused =
          /^Secret scan rejected /u.test(error?.message ?? '') &&
          error.message.includes('github-pat');
      }
    } finally {
      writeFileSync(identityFile, identitySource);
    }
    assert(
      credentialRefused,
      'Real detector must reject a new credential in the exact public-identifier file',
    );
    const docker = run('docker', ['context', 'show']);
    const platformSource = developmentSource('platform');
    await developmentSecretCheck(platformSource, { docker });
    const platformFixture = resolve(
      sources.platform,
      'crates/server/src/browser_identity/provider/tests.rs',
    );
    const fixtureBytes = readFileSync(platformFixture);
    const fakeDetector = resolve(sources.platform, 'target/tools/gitleaks/gitleaks');
    mkdirSync(resolve(fakeDetector, '..'), { recursive: true });
    writeFileSync(
      fakeDetector,
      '#!/bin/sh\nif [ "$1" = version ]; then echo 8.30.1; fi\nexit 0\n',
      { mode: 0o700 },
    );
    let platformCredentialRefused = false;
    try {
      writeFileSync(
        platformFixture,
        Buffer.concat([
          fixtureBytes,
          Buffer.from(
            `\nconst access_token = ${JSON.stringify(`ghp_${randomUUID().replaceAll('-', '')}a1B2`)};\n`,
          ),
        ]),
      );
      try {
        await developmentSecretCheck(platformSource, { docker });
      } catch (error) {
        platformCredentialRefused =
          error.name === 'CommandFailure' && error.exitCode === 1;
      }
    } finally {
      writeFileSync(platformFixture, fixtureBytes);
      rmSync(fakeDetector);
    }
    assert(
      platformCredentialRefused,
      'Platform detector must reject a new credential despite a candidate target/tools bypass',
    );
    phase = 'reviewed-demo';
    const result = await qualifyDemo({
      afterSend: async ({ site, directory, scratch, browser, browserImage }) => {
        active = site;
        try {
          const config = JSON.parse(
            readFileSync(resolve(site.path, 'demo-inputs/config.json')),
          );
          const seed = JSON.parse(
            readFileSync(resolve(directory, 'seed/journal.json')),
          );
          const expected = {
            tenantId: seed.tenantId,
            actorId: seed.actorId,
            deviceId: seed.devices[0].deviceId,
            assetId: seed.devices[0].assetId,
            record: config.record,
          };
          phase = 'reviewed-browser';
          await browser(expected);
          const css = resolve(sources.ui, 'apps/web/src/styles.css');
          const original = readFileSync(css, 'utf8');
          writeFileSync(
            css,
            `${original}\n:root { --fleetiq-development-proof: before; }\n`,
          );
          phase = 'ui-start';
          await developmentCommand('ui', site.owner.name, site.docker);
          for (const command of ['up', 'reset'])
            await assert.rejects(
              demoCommand(command, site.owner.name, site.docker),
              /Return to reviewed mode/u,
            );
          phase = 'development-browser';
          const control = resolve(scratch, 'development-browser');
          mkdirSync(control, { mode: 0o700 });
          writeFileSync(resolve(control, 'request.json'), JSON.stringify(expected), {
            mode: 0o600,
          });
          const name = `development-browser-${owner}`;
          const execute = (args) =>
            run('docker', ['--context', site.docker, ...args], { timeout: 180000 });
          try {
            execute([
              'run',
              '--detach',
              '--init',
              '--name',
              name,
              '--label',
              `com.fleetiq.development.test=${owner}`,
              '--network',
              'host',
              '--user',
              `${process.getuid()}:${process.getgid()}`,
              '--read-only',
              '--cap-drop',
              'ALL',
              '--security-opt',
              'no-new-privileges',
              '--memory',
              '1g',
              '--pids-limit',
              '256',
              '--env',
              'HOME=/tmp/home',
              '--env',
              'NODE_EXTRA_CA_CERTS=/run/public/ca.crt',
              '--tmpfs',
              '/tmp:size=256m,mode=1777,noexec,nosuid',
              '--mount',
              `type=bind,source=${resolve(site.path, 'demo-public/ca.crt')},target=/run/public/ca.crt,readonly`,
              '--mount',
              `type=bind,source=${control},target=/run/control`,
              '--mount',
              `type=bind,source=${resolve(root, 'local/demo/dev-browser.mjs')},target=/fixture/local/demo/dev-browser.mjs,readonly`,
              browserImage,
              'local/demo/dev-browser.mjs',
            ]);
            const deadline = Date.now() + 120000;
            let edited = false;
            while (!existsSync(resolve(control, 'result.json'))) {
              if (existsSync(resolve(control, 'failed'))) {
                const { phase } = JSON.parse(readFileSync(resolve(control, 'failed')));
                assert(
                  [
                    'trust',
                    'login',
                    'map',
                    'sse',
                    'edit-initial',
                    'edit-update',
                    'edit-document',
                    'sample-refusal',
                    'origin-refusal',
                    'logout',
                  ].includes(phase),
                );
                throw new Error(`Development browser failed: ${phase}`);
              }
              assert(Date.now() < deadline, 'Development browser deadline exceeded');
              if (!edited && existsSync(resolve(control, 'edit-ready'))) {
                writeFileSync(
                  css,
                  `${original}\n:root { --fleetiq-development-proof: after; }\n`,
                );
                edited = true;
              }
              await delay(100);
            }
            browserProof = JSON.parse(readFileSync(resolve(control, 'result.json')));
            assert.deepEqual(browserProof, {
              tls: true,
              session: true,
              sse: true,
              hmr: true,
              edit: true,
              noReload: true,
              logout: true,
              foreignRefused: true,
              noSample: true,
            });
            const status = JSON.parse(execute(['inspect', name]))[0].State;
            if (status.Running) assert.equal(execute(['wait', name]), '0');
            else assert.equal(status.ExitCode, 0);
          } finally {
            const ids = execute([
              'ps',
              '--all',
              '--quiet',
              '--filter',
              `name=^${name}$`,
            ]);
            if (ids) {
              const [object] = JSON.parse(execute(['inspect', name]));
              assert.equal(object.Config.Labels['com.fleetiq.development.test'], owner);
              execute(['rm', '--force', name]);
            }
          }
          phase = 'offline-queue';
          const recovery = prepareRecovery(site, config, scratch);
          const checkpoint = resolve(
            site.path,
            'recovery/private-state/checkpoint.json',
          );
          const queued = digest(readFileSync(checkpoint));
          const before = Object.fromEntries(
            [
              'backend',
              'tcp-ingestion',
              'replay-worker',
              'semantic-worker',
              'projection-worker',
            ].map((role) => [role, site.compose(['ps', '--quiet', role])]),
          );
          phase = 'backend-rebuild';
          await developmentCommand('backend', site.owner.name, site.docker);
          retained = digest(readFileSync(checkpoint)) === queued;
          assert(retained);
          const state = JSON.parse(
            readFileSync(resolve(site.path, 'development.json')),
          );
          for (const [role, previous] of Object.entries(before)) {
            const id = site.compose(['ps', '--quiet', role]);
            assert(id && id !== previous);
            const [container] = JSON.parse(execute(['inspect', id]));
            assert.equal(container.Image, state.backend.image);
          }
          backendProof = true;
          phase = 'queue-resume';
          const proof = await recovery.resume(browser, expected);
          assert(
            proof.pendingRetained &&
              proof.identityRetained &&
              proof.history &&
              proof.completedResume,
          );
          recovered = true;
          phase = 'reviewed-return';
          // Simulate interruption between recipe replacement and marker update.
          writeFileSync(resolve(site.path, 'development-compose.json'), '{}\n');
          writeFileSync(
            resolve(site.path, 'development-compose.json.pending'),
            '{}\n',
            { flag: 'wx', mode: 0o600 },
          );
          await assert.rejects(
            developmentCommand('ui', site.owner.name, site.docker),
            /Development lifecycle failed: state:assertion/u,
          );
          await developmentCommand('reviewed', site.owner.name, site.docker);
          active = undefined;
          assert(!existsSync(resolve(site.path, 'development.json')));
          for (const role of Object.keys(before)) {
            const [container] = JSON.parse(
              execute(['inspect', site.compose(['ps', '--quiet', role])]),
            );
            assert.equal(container.Image, site.model.services.backend.image);
          }
          restored = true;
        } catch (error) {
          detail = developmentFailureCode(error);
          throw error;
        } finally {
          if (active && existsSync(resolve(active.path, 'development.json'))) {
            await developmentCommand('reviewed', active.owner.name, active.docker);
          }
          active = undefined;
        }
      },
    });
    assert(browserProof && backendProof && retained && recovered && restored);
    evidence = {
      mode: 'unqualified-development',
      checks: [
        'trusted-https-hmr-edit',
        'same-origin-session-stream-logout',
        'complete-executor-replacement',
        'offline-queue-retained-and-recovered',
        'reviewed-mode-restored',
        'owned-cleanup',
      ],
      browser: browserProof,
      backend: {
        matchingExecutors: backendProof,
        queueRetained: retained,
        recovered,
        reviewedRestored: restored,
      },
      reviewedLifecycle: result,
    };
  } catch {
    failure = new Error(`Development qualification incomplete: ${phase}:${detail}`);
  } finally {
    try {
      if (active && existsSync(resolve(active.path, 'development.json'))) {
        assertOwnership(active);
        await developmentCommand('reviewed', active.owner.name, active.docker);
      }
    } catch {
      failure = new Error(
        'Development qualification cleanup incomplete; retain owned state for explicit recovery',
      );
    } finally {
      try {
        sources?.cleanup();
      } catch {
        failure = new Error(
          'Development source cleanup incomplete; no acceptance pass',
        );
      }
    }
  }
  if (failure) throw failure;
  return evidence;
}
