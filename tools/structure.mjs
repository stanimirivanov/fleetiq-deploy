import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'yaml';
import { verifyPublicationWorkflow, verifyWorkflow } from './ci.mjs';
import { lock, sourceCompose, validateLock } from './policy.mjs';
import { root, run } from './process.mjs';

/** Keep the existing opening-summary boundary and identify the guide to repair. */
export function guideSummary(file, contents) {
  if (contents.split('\n').length > 100)
    assert(
      contents.slice(0, 500).includes('TL;DR'),
      `Long guide requires a TL;DR in its first 500 characters: ${file}`,
    );
}

export function structure() {
  validateLock();
  verifyWorkflow();
  verifyPublicationWorkflow();
  const packageFile = JSON.parse(readFileSync(resolve(root, 'package.json')));
  assert.equal(packageFile.packageManager, `pnpm@${lock.tools.pnpm}`);
  assert.equal(
    packageFile.scripts.test,
    'node --test --test-concurrency=2 tools/tests/*.test.mjs',
  );
  assert.equal(
    packageFile.scripts['manifests:install'],
    'node tools/manifests/install.mjs',
  );
  assert.equal(
    packageFile.scripts['manifests:check'],
    'node tools/verify.mjs manifests',
  );
  const compose = sourceCompose();
  assert.deepEqual(Object.keys(compose.services).sort(), [
    'backend',
    'edge',
    'postgres',
  ]);
  assert(!compose.services.backend.ports && !compose.services.postgres.ports);
  assert.equal(compose.services.edge.ports[0].host_ip, '127.0.0.1');
  assert.equal(compose.networks.database.internal, true);
  const caddy = readFileSync(resolve(root, 'local/Caddyfile'), 'utf8');
  for (const rule of [
    'admin off',
    'tls internal',
    'header >Cache-Control "no-store"',
    '@backend path /api /api/* /health/*',
    'handle /assets/*',
    'try_files {path} /index.html',
  ])
    assert(caddy.includes(rule), 'Required edge policy changed');
  assert(
    !/header_up\s+(?:Host|Origin|Cookie)|header_down\s+(?:Set-Cookie)|tls_insecure_skip_verify/u.test(
      caddy,
    ),
  );
  for (const file of [
    'local/images/backend.Dockerfile',
    'local/images/edge.Dockerfile',
  ])
    assert(
      !/FROM\s+[^$\s]/u.test(readFileSync(resolve(root, file), 'utf8')),
      'Image bases must come from the reviewed artifact lock',
    );
  const workflow = parse(
    readFileSync(resolve(root, '.github/workflows/ci.yml'), 'utf8'),
  );
  assert.deepEqual(Object.keys(workflow.on), ['pull_request']);
  assert.deepEqual(workflow.permissions, { contents: 'read' });
  assert.deepEqual(Object.keys(workflow.jobs).sort(), [
    'docker',
    'packages',
    'structural',
  ]);
  const expectedActions = {
    'actions/checkout': 'v7',
    'actions/setup-node': 'v7',
    'actions/upload-artifact': 'v7',
  };
  for (const [name, job] of Object.entries(workflow.jobs)) {
    const steps = job.steps;
    for (const step of steps) {
      assert(!step['continue-on-error']);
      if (step.uses) {
        const [action, version] = step.uses.split('@');
        assert.equal(version, expectedActions[action], 'Unreviewed CI action');
      }
    }
    const commands = steps.map((step) => step.run ?? '').join('\n');
    assert(commands.includes('pnpm install --frozen-lockfile'));
    assert(commands.includes('pnpm secrets:install'));
    assert(
      commands.includes(
        name === 'docker'
          ? 'pnpm qualify'
          : name === 'packages'
            ? 'pnpm packages:check'
            : 'pnpm check',
      ),
    );
    if (name === 'structural') assert(commands.includes('pnpm manifests:install'));
  }
  assert(
    readFileSync(resolve(root, '.github/workflows/ci.yml'), 'utf8').includes(
      'secrets.FLEETIQ_SOURCE_READ_TOKEN',
    ),
  );
  const tracked = run('git', [
    'ls-files',
    '--cached',
    '--others',
    '--exclude-standard',
    '-z',
  ])
    .split('\0')
    .filter(Boolean);
  for (const file of tracked) {
    assert(
      !/(?:^|\/)(?:\.local|\.env)(?:\/|$)/u.test(file),
      'Private configuration must not enter Git',
    );
    if (!file.endsWith('.md') || !existsSync(resolve(root, file))) continue;
    const bytes = readFileSync(resolve(root, file), 'utf8');
    guideSummary(file, bytes);
    for (const match of bytes.matchAll(/\]\(([^)#]+)(?:#[^)]*)?\)/gu)) {
      if (/^(?:https?:|mailto:)/u.test(match[1])) continue;
      assert(
        existsSync(resolve(root, file, '..', match[1])),
        `Broken documentation link: ${file}`,
      );
    }
  }
}
