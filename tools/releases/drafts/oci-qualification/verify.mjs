import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { run } from '../../../process.mjs';
import { digest } from '../../contracts.mjs';
import { publishReleasePackage } from '../../packages.mjs';
import { registryClient } from '../../registry.mjs';

const [input, expectedDigest, resultPath = '/dev/stdout'] = process.argv.slice(2);
const host = process.env.OCI_DRAFT_HOST ?? '127.0.0.1:5000';
assert.match(host, /^127\.0\.0\.1:[1-9][0-9]{0,4}$/u);
assert(statSync(input).size <= 768 * 1024, 'Reviewed bundle exceeds the draft limit');
const bytes = readFileSync(input);
assert.equal(digest(bytes), expectedDigest, 'Reviewed input digest mismatch');
const { revision, qualification, files } = JSON.parse(bytes);
assert.match(revision, /^[a-f0-9]{40}$/u);
assert(qualification && typeof qualification === 'object' && !Array.isArray(qualification));
assert(files && typeof files === 'object' && !Array.isArray(files));

const scratch = mkdtempSync(join(process.env.TMPDIR ?? '/tmp', 'oci-draft-'));
try {
  const packageRoot = join(scratch, 'inputs');
  const output = join(scratch, 'packages');
  mkdirSync(output);
  for (const [name, contents] of Object.entries(files)) {
    const allowed = /^(?:charts\/fleetiq-(?:runtime|data)\/[\w./-]+|environments\/(?:local-preview|qualified-local-preview)\/(?:runtime|data)\.yaml|tools\/manifests\/tools\.lock\.json)$/u;
    assert(allowed.test(name) && name.split('/').every(part => part && part !== '.' && part !== '..'));
    assert.equal(typeof contents, 'string');
    const file = join(packageRoot, name);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, contents, { flag: 'wx' });
  }
  const lock = JSON.parse(readFileSync(join(packageRoot, 'tools/manifests/tools.lock.json')));
  const helm = process.env.OCI_DRAFT_HELM ?? '/usr/local/bin/helm';
  assert.equal(digest(readFileSync(helm)), `sha256:${lock.tools.helm.platforms['linux-x64'].binarySha256}`);
  const tools = {
    helm: args => run(helm, args, {
      cwd: output,
      env: {
        PATH: '/usr/local/bin:/usr/bin:/bin',
        HOME: scratch,
        HELM_CONFIG_HOME: join(scratch, 'helm-config'),
        HELM_CACHE_HOME: join(scratch, 'helm-cache'),
        HELM_DATA_HOME: join(scratch, 'helm-data'),
        HELM_PLUGINS: join(scratch, 'no-plugins'),
      },
    }),
  };
  assert((await fetch(`http://${host}/v2/`, { signal: AbortSignal.timeout(3000) })).ok);
  const result = await publishReleasePackage(tools, output, {
    packageRoot,
    target: `${host}/fleetiq-deploy`,
    source: { repository: 'stanimirivanov/fleetiq-deploy', revision },
    run: '1',
    attempt: '1',
    loopback: true,
    qualification,
  });

  const [repository, originalDigest] = result.bom.charts.runtime.reference.split('@');
  const registry = registryClient(repository, { loopback: true });
  const version = result.bom.version;
  await assert.rejects(() => registry.absent(version), /exists/u);
  await assert.rejects(() => registry.object(`sha256:${'0'.repeat(64)}`), /unavailable/u);
  const original = await registry.object(originalDigest);
  const response = await fetch(`http://${host}/v2/fleetiq-deploy/fleetiq-runtime/manifests/${version}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/vnd.oci.image.manifest.v1+json' },
    body: JSON.stringify({
      ...original.value,
      annotations: { ...original.value.annotations, 'io.fleetiq.fixture': 'retagged' },
    }),
    signal: AbortSignal.timeout(10_000),
    redirect: 'error',
  });
  assert(response.ok, 'Fixture tag mutation failed');
  assert.notEqual((await registry.object(version)).digest, originalDigest);
  assert.equal((await registry.object(originalDigest)).digest, originalDigest);

  const artifacts = Object.fromEntries(
    Object.entries({ ...result.bom.charts, envelope: result }).map(([role, artifact]) => [
      role, { archive: artifact.archive, oci: artifact.reference.split('@')[1] },
    ]),
  );
  writeFileSync(resultPath, JSON.stringify({
    revision,
    inputDigest: expectedDigest,
    artifacts,
    checks: { archives: true, renders: true, missing: true, overwrite: true, retag: true },
  }));
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
