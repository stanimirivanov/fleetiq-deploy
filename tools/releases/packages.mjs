import assert from 'node:assert/strict';
import {
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { stringify } from 'yaml';
import { documents } from '../manifests/render.mjs';
import { toolsLock } from '../manifests/toolchain.mjs';
import { root, run } from '../process.mjs';
import { contract, digest } from './contracts.mjs';
import { registryClient, verifyBlobs } from './registry.mjs';

export function packageVersion(revision, run, attempt) {
  assert(
    /^[a-f0-9]{40}$/u.test(revision) &&
      /^[1-9][0-9]*$/u.test(String(run)) &&
      /^[1-9][0-9]*$/u.test(String(attempt)),
    'Invalid immutable package identity',
  );
  return `0.1.0-r${revision}.run${run}.attempt${attempt}`;
}

function chartRender(tools, chart, role, directory) {
  return documents(
    tools.helm(
      [
        'template',
        'fleetiq',
        chart,
        '--namespace',
        role === 'runtime' ? 'fleetiq-local' : 'fleetiq-data',
        '--kube-version',
        toolsLock.kubernetes,
        '--values',
        resolve(root, `environments/local-preview/${role}.yaml`),
      ],
      { cwd: directory },
    ),
  );
}

/** A push is incomplete until exact archive bytes are pulled by OCI digest and rendered. */
export async function publishChart(
  tools,
  directory,
  chart,
  name,
  version,
  target,
  options = {},
) {
  const repository = `${target}/${name}`;
  const registry = registryClient(repository, options);
  await registry.absent(version);
  tools.helm(['package', chart, '--version', version, '--destination', directory]);
  const archive = join(directory, `${name}-${version}.tgz`);
  const archiveDigest = digest(readFileSync(archive));
  const auth = options.registryConfig
    ? ['--registry-config', options.registryConfig]
    : [];
  const transport = options.loopback ? ['--plain-http'] : [];
  tools.helm(['push', archive, `oci://${target}`, ...auth, ...transport]);
  const published = await registry.object(version);
  await verifyBlobs(registry, published.value);
  assert.equal(
    published.value.config?.mediaType,
    'application/vnd.cncf.helm.config.v1+json',
    'Unexpected Helm config media type',
  );
  assert.equal(published.value.layers?.length, 1, 'Unexpected Helm package layers');
  assert.equal(
    published.value.layers[0].mediaType,
    'application/vnd.cncf.helm.chart.content.v1.tar+gzip',
    'Unexpected chart media type',
  );
  assert.equal(
    published.value.layers[0].digest,
    archiveDigest,
    'Registry chart differs from packaged bytes',
  );
  const output = join(directory, `pulled-${name}`);
  mkdirSync(output);
  tools.helm([
    'pull',
    `oci://${repository}@${published.digest}`,
    '--destination',
    output,
    ...auth,
    ...transport,
  ]);
  const retrieved = readdirSync(output);
  assert.equal(retrieved.length, 1, 'Unexpected OCI pull output');
  assert(retrieved[0].endsWith('.tgz'), 'OCI pull did not produce a chart');
  const pulled = join(output, retrieved[0]);
  assert(
    lstatSync(pulled).isFile() && !lstatSync(pulled).isSymbolicLink(),
    'Linked chart archive refused',
  );
  assert.equal(digest(readFileSync(pulled)), archiveDigest, 'Pulled archive differs');
  return {
    reference: `${repository}@${published.digest}`,
    archive: archiveDigest,
    pulled,
    registry,
    tag: version,
  };
}

/** The metadata-only Helm artifact is a portable OCI envelope, with no Kubernetes objects. */
export async function publishReleasePackage(
  tools,
  directory,
  { target, source, run: runId, attempt, qualification, ...options },
) {
  const version = packageVersion(source.revision, runId, attempt);
  const charts = {};
  for (const role of ['runtime', 'data']) {
    const sourceChart = resolve(root, `charts/fleetiq-${role}`);
    const chart = await publishChart(
      tools,
      directory,
      sourceChart,
      `fleetiq-${role}`,
      version,
      target,
      options,
    );
    assert.deepEqual(
      chartRender(tools, chart.pulled, role, directory),
      chartRender(tools, sourceChart, role, directory),
      'Packaged chart render differs from reviewed source',
    );
    charts[role] = { reference: chart.reference, archive: chart.archive };
  }
  const bom = {
    format: 'fleetiq-release-package.v1',
    source,
    version,
    toolchain: digest(readFileSync(resolve(root, 'tools/manifests/tools.lock.json'))),
    qualification: digest(Buffer.from(JSON.stringify(qualification))),
    charts,
  };
  contract('package-bom', bom);
  const metadata = join(directory, 'fleetiq-release');
  mkdirSync(metadata);
  writeFileSync(
    join(metadata, 'Chart.yaml'),
    stringify({
      apiVersion: 'v2',
      name: 'fleetiq-release',
      description: 'FleetIQ immutable package inventory; no workloads or hooks',
      type: 'application',
      version,
    }),
  );
  writeFileSync(join(metadata, 'values.yaml'), '{}\n');
  writeFileSync(join(metadata, 'release.json'), `${JSON.stringify(bom, null, 2)}\n`);
  const result = await publishChart(
    tools,
    directory,
    metadata,
    'fleetiq-release',
    version,
    target,
    options,
  );
  assert.deepEqual(
    documents(tools.helm(['template', 'inventory', result.pulled])),
    [],
    'Release envelope must never activate resources',
  );
  // Inspect the exact retrieved inventory, not the local pre-push copy.
  const inventory = run('tar', ['-xOf', result.pulled, 'fleetiq-release/release.json']);
  assert.deepEqual(
    JSON.parse(inventory),
    bom,
    'Retrieved inventory differs from published BOM',
  );
  writeFileSync(
    join(directory, 'package-bom.json'),
    `${JSON.stringify(bom, null, 2)}\n`,
  );
  return { bom, reference: result.reference, archive: result.archive };
}
