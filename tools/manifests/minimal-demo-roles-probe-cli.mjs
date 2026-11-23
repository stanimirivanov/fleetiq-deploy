import assert from 'node:assert/strict';
import { lstatSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { capture, root, run } from '../process.mjs';
import {
  databaseName,
  loadGrantInputs,
  roleName,
  sha256,
} from './minimal-demo-roles.mjs';
import {
  qualifyMinimalDemoRoles,
  validateRoleProbeRequest,
} from './minimal-demo-roles-probe.mjs';
import { renderMinimalDemoRoles } from './minimal-demo-roles-render.mjs';
import { manifestTools, toolsLock } from './toolchain.mjs';

function privateFile(path, maxBytes = 128 * 1024) {
  assert(typeof path === 'string' && resolve(path) === path);
  const stat = lstatSync(path);
  assert(
    stat.isFile() &&
      realpathSync(path) === path &&
      stat.nlink === 1 &&
      stat.uid === process.getuid() &&
      (stat.mode & 0o077) === 0 &&
      stat.size > 0 &&
      stat.size <= maxBytes,
  );
  return path;
}

function readSource() {
  const files = [
    'charts/fleetiq-data/templates/cluster.yaml',
    'charts/fleetiq-data/templates/network.yaml',
    'charts/fleetiq-data/values.schema.json',
    'charts/fleetiq-data/values.yaml',
    'environments/minimal-demo-candidate/backend.json',
    'environments/minimal-demo-candidate/data.yaml',
    'tools/manifests/minimal-demo-data.mjs',
    'tools/manifests/minimal-demo-network.mjs',
    'tools/manifests/minimal-demo-roles-probe-cli.mjs',
    'tools/manifests/minimal-demo-roles-probe.mjs',
    'tools/manifests/minimal-demo-roles-render.mjs',
    'tools/manifests/minimal-demo-roles.mjs',
    'tools/manifests/tools.lock.json',
    'tools/process.mjs',
  ];
  return {
    commit: run('git', ['rev-parse', 'HEAD'], { timeout: 4_000 }),
    fingerprint: sha256(
      JSON.stringify(
        files.map((file) => [file, sha256(readFileSync(resolve(root, file)))]),
      ),
    ),
  };
}

function producerFixture(platform, inputs) {
  assert(
    typeof platform === 'string' &&
      resolve(platform) === platform &&
      realpathSync(platform) === platform,
  );
  const revision = inputs.selection.backend.source.revision;
  assert.equal(
    run(
      'git',
      ['--no-replace-objects', '-C', platform, 'rev-parse', `${revision}^{commit}`],
      { timeout: 4_000 },
    ),
    revision,
  );
  const source = (path) =>
    run(
      'git',
      ['--no-replace-objects', '-C', platform, 'show', `${revision}:${path}`],
      { timeout: 4_000, maxBuffer: 256 * 1024 },
    );
  const sql = source('contracts/postgresql/runtime-grants-check.sql');
  const retention = ['context.sql', 'candidates.sql'].map((file) =>
    source(`crates/postgres/src/history/retention/${file}`),
  );
  return { sql, retention, fingerprint: sha256(JSON.stringify([sql, retention])) };
}

const psqlArgs = [
  '-X',
  '-q',
  '-A',
  '-t',
  '-w',
  '-v',
  'ON_ERROR_STOP=1',
  '-d',
  databaseName,
  '-f',
  '-',
];

function main() {
  const { values } = parseArgs({
    options: {
      execute: { type: 'boolean' },
      'confirm-target': { type: 'string' },
      'confirm-stage': { type: 'string' },
      'confirm-candidate': { type: 'string' },
      kubeconfig: { type: 'string' },
      request: { type: 'string' },
      grants: { type: 'string' },
      inventory: { type: 'string' },
      ca: { type: 'string' },
      passfile: { type: 'string' },
      platform: { type: 'string' },
      previous: { type: 'string' },
    },
  });
  assert(values.execute && values['confirm-target'] && values['confirm-candidate']);
  const request = JSON.parse(readFileSync(privateFile(values.request), 'utf8'));
  const { spaces, phase } = validateRoleProbeRequest(request);
  assert.equal(request.target.name, values['confirm-target']);
  assert.equal(request.stage, values['confirm-stage']);
  assert.equal(request.candidate, values['confirm-candidate']);
  const config = privateFile(values.kubeconfig, 1024 * 1024);
  const ca = privateFile(values.ca);
  const passfile = privateFile(values.passfile);
  assert.equal(sha256(readFileSync(ca)), request.caDigest);
  const inputs = loadGrantInputs(
    readFileSync(privateFile(values.grants)),
    readFileSync(privateFile(values.inventory)),
  );
  const profile = renderMinimalDemoRoles(manifestTools(), request.consumer, phase);
  assert.equal(request.candidate, profile.candidate);
  const previous =
    request.stage === 'after-restart'
      ? JSON.parse(readFileSync(privateFile(values.previous), 'utf8'))
      : undefined;
  assert.equal(Boolean(values.previous), request.stage === 'after-restart');
  assert.equal(Boolean(values.platform), request.stage === 'grant');
  const fixture =
    request.stage === 'grant' ? producerFixture(values.platform, inputs) : undefined;
  const source = readSource();
  const { clientVersion } = JSON.parse(
    run('kubectl', ['version', '--client', '-o', 'json'], { timeout: 4_000 }),
  );
  assert.equal(clientVersion?.gitVersion, `v${toolsLock.kubernetes}`);
  const psqlVersion = run('psql', ['--version'], { timeout: 4_000 });
  assert.match(psqlVersion, /^psql \(PostgreSQL\) 18\.[0-9]+(?: .*)?$/u);
  const cache = mkdtempSync(join(tmpdir(), 'fleetiq-minimal-data-'));
  const started = performance.now();
  const deadline = (limit) => {
    const remaining = Math.floor(240_000 - (performance.now() - started));
    assert(remaining > 0, 'database probe deadline expired');
    return Math.min(limit, remaining);
  };
  const kube = (args, { input, limit = 9_000 } = {}) =>
    run(
      'kubectl',
      [
        '--kubeconfig',
        config,
        '--context',
        `kind-${request.target.name}`,
        '--cache-dir',
        cache,
        '--request-timeout=8s',
        ...args,
      ],
      { input, timeout: deadline(limit), maxBuffer: 256 * 1024 },
    );
  const pgEnv = {
    HOME: cache,
    LANG: 'C',
    PATH: process.env.PATH,
    PGHOST: `fleetiq-db-rw.${spaces.data}.svc`,
    PGHOSTADDR: '127.0.0.1',
    PGPORT: String(request.port),
    PGSSLROOTCERT: ca,
    PGPASSFILE: passfile,
    PGSSLMODE: 'verify-full',
    PGGSSENCMODE: 'disable',
    PGCHANNELBINDING: 'require',
    PGCONNECT_TIMEOUT: '4',
    PGAPPNAME: 'fleetiq-role-probe',
    PGOPTIONS: '-c statement_timeout=8000 -c lock_timeout=2000',
  };
  let receipt;
  try {
    const [endpoint, insecure, proxy, tlsName, caData, caFile] = kube([
      'config',
      'view',
      '--minify',
      '-o',
      'jsonpath={.clusters[0].cluster.server}{"|"}{.clusters[0].cluster.insecure-skip-tls-verify}{"|"}{.clusters[0].cluster.proxy-url}{"|"}{.clusters[0].cluster.tls-server-name}{"|"}{.clusters[0].cluster.certificate-authority-data}{"|"}{.clusters[0].cluster.certificate-authority}',
    ]).split('|');
    const server = new URL(endpoint);
    assert(
      server.protocol === 'https:' &&
        server.hostname === '127.0.0.1' &&
        server.port &&
        server.pathname === '/' &&
        !server.username &&
        !server.password &&
        !server.search &&
        !server.hash &&
        (!insecure || insecure === 'false') &&
        !proxy &&
        !tlsName &&
        caData &&
        !caFile,
      'require the private loopback kind API with embedded CA verification',
    );
    receipt = qualifyMinimalDemoRoles(request, {
      profile,
      inputs,
      source,
      kube,
      fixture,
      previous,
      admin: (pod, sql) => {
        assert.equal(
          kube([
            '--namespace',
            spaces.data,
            'auth',
            'can-i',
            'create',
            `pods/${pod}`,
            '--subresource=exec',
          ]),
          'yes',
        );
        return kube(
          [
            '--namespace',
            spaces.data,
            'exec',
            '-i',
            pod,
            '--container=postgres',
            '--',
            'env',
            'PGOPTIONS=-c statement_timeout=8000 -c lock_timeout=2000',
            'psql',
            '-h',
            '/controller/run',
            '-U',
            'postgres',
            ...psqlArgs,
          ],
          { input: sql, limit: 22_000 },
        );
      },
      login: (command, sql) =>
        run('psql', psqlArgs, {
          input: sql,
          env: { ...pgEnv, PGUSER: roleName(command) },
          timeout: deadline(17_000),
          maxBuffer: 64 * 1024,
        }),
      rejectCleartext: () => {
        const result = capture('psql', psqlArgs, {
          input: 'SELECT 1;',
          env: {
            ...pgEnv,
            PGUSER: roleName('serve --check-schema'),
            PGSSLMODE: 'disable',
            PGCHANNELBINDING: 'disable',
            PGPASSFILE: '/dev/null',
          },
          timeout: deadline(8_000),
          maxBuffer: 32 * 1024,
          acceptedExitCodes: [0, 2],
        });
        return (
          result.exitCode === 2 &&
          /FATAL:\s+pg_hba\.conf rejects connection .*no encryption/u.test(
            result.stderr,
          )
        );
      },
    });
    assert.deepEqual(readSource(), source);
    assert.equal(sha256(readFileSync(ca)), request.caDigest);
    if (fixture) receipt.producerFixture = fixture.fingerprint;
  } catch {
    receipt ??= {
      format: 'fleetiq-minimal-demo-data-probe.v1',
      stage: request.stage,
      candidate: request.candidate,
      target: request.target,
      source,
      checks: [],
    };
    receipt.outcome = 'failed';
    receipt.reason =
      'private target, local tooling or source identity verification failed';
  } finally {
    try {
      rmSync(cache, { recursive: true, force: true });
    } catch {
      receipt.outcome = 'failed';
      receipt.reason = 'private cache cleanup failed';
    }
  }
  receipt.kubectlVersion = clientVersion.gitVersion;
  receipt.psqlVersion = psqlVersion.match(/\b18\.[0-9]+\b/u)[0];
  receipt.elapsedMilliseconds = Math.round(performance.now() - started);
  console.log(JSON.stringify(receipt, null, 2));
  if (receipt.outcome !== 'passed') process.exitCode = 1;
}

try {
  main();
} catch {
  console.error(
    'Minimal-demo database probe did not execute. Verify explicit authorization, private reviewed inputs, and pinned tools.',
  );
  process.exitCode = 1;
}
