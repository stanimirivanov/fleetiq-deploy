import assert from 'node:assert/strict';
import { contract, digest } from './contracts.mjs';
import { publicationEvidence, reportArchive } from './evidence.mjs';
import { github, maintainer } from './github.mjs';
import { boundedBytes, registryClient, verifyBlobs } from './registry.mjs';

async function artifactArchive(repository, artifact, token) {
  const response = await fetch(
    `https://api.github.com/repos/${repository}/actions/artifacts/${artifact.id}/zip`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
      redirect: 'manual',
      signal: AbortSignal.timeout(15_000),
    },
  );
  assert.equal(
    response.status,
    302,
    'Publication evidence download grant is unavailable',
  );
  const location = new URL(response.headers.get('location'));
  assert(
    location.protocol === 'https:' &&
      !location.username &&
      !location.password &&
      /(?:^|\.)(?:blob\.core\.windows\.net|actions\.githubusercontent\.com)$/u.test(
        location.hostname,
      ),
    'Untrusted evidence download host',
  );
  const archive = await fetch(location, {
    redirect: 'error',
    signal: AbortSignal.timeout(30_000),
  });
  assert(archive.ok, 'Publication evidence archive unavailable');
  const bytes = await boundedBytes(archive, 128 * 1024 * 1024);
  assert.equal(digest(bytes), artifact.digest, 'Publication archive digest mismatch');
  return await reportArchive(bytes);
}

/**
 * Trusted GitHub run/artifact APIs and live content-addressed registry reads are
 * independent of a candidate's JSON. BuildKit statements alone are not signed
 * publisher identity. This verifies the reviewed publisher execution instead.
 * Preserve its digest-bound reports durably before GitHub retention expires.
 */
export async function verifyPublication(
  role,
  selected,
  { token, registryCredential } = {},
) {
  assert(['backend', 'ux', 'package'].includes(role), 'Unknown release producer');
  const repository = {
    backend: 'stanimirivanov/fleetiq-platform',
    ux: 'stanimirivanov/fleetiq-ux',
    package: 'stanimirivanov/fleetiq-deploy',
  }[role];
  assert.equal(selected.source.repository, repository, 'Wrong producer repository');
  assert(
    Number.isSafeInteger(selected.publication.run) &&
      selected.publication.run > 0 &&
      Number.isSafeInteger(selected.publication.attempt) &&
      selected.publication.attempt > 0,
    'Invalid publisher identity',
  );
  const { run: id, attempt } = selected.publication;
  const [run, artifacts, pulls] = await Promise.all([
    github(repository, `actions/runs/${id}/attempts/${attempt}`, token),
    github(repository, `actions/runs/${id}/artifacts?per_page=100`, token),
    github(repository, `commits/${selected.source.revision}/pulls?per_page=100`, token),
  ]);
  const prefix = {
    backend: 'backend-publication',
    ux: 'ux-image-reports',
    package: 'release-package-reports',
  }[role];
  assert(artifacts.total_count <= 100, 'Publication artifact listing exceeds bound');
  const matches = artifacts.artifacts.filter(
    (artifact) => artifact.name === `${prefix}-${id}-${attempt}` && !artifact.expired,
  );
  assert.equal(matches.length, 1, 'Missing/ambiguous/expired publication evidence');
  const artifact = matches[0];
  assert.equal(
    artifact.digest,
    selected.publication.artifactDigest,
    'Wrong publication artifact digest',
  );
  assert(artifact.size_in_bytes <= 128 * 1024 * 1024, 'Oversize publication artifact');
  const reports = await artifactArchive(repository, artifact, token);
  const record = publicationEvidence(role, selected, run, reports);
  const merged = pulls.find(
    (pull) =>
      pull.merged_at &&
      pull.merge_commit_sha === selected.source.revision &&
      pull.base?.ref === 'main' &&
      pull.head?.repo?.full_name === repository,
  );
  assert(merged, 'Producer source lacks a merged repository review');
  const reviewed = await github(repository, `pulls/${merged.number}`, token);
  assert(
    reviewed.merged &&
      reviewed.merge_commit_sha === selected.source.revision &&
      reviewed.base?.ref === 'main',
    'Producer review changed',
  );
  const actors = new Set([
    run.actor?.login,
    run.triggering_actor?.login,
    reviewed.merged_by?.login,
  ]);
  for (const actor of actors) {
    assert(/^[a-zA-Z0-9][a-zA-Z0-9-]{0,38}$/u.test(actor), 'Invalid producer actor');
    maintainer(
      await github(repository, `collaborators/${actor}/permission`, token),
      actor,
    );
  }
  const [image, reference] = selected.reference.split('@');
  const registry = registryClient(image, { credential: registryCredential });
  const manifest = await registry.object(reference);
  let inventory;
  if (role === 'package') {
    await verifyBlobs(registry, manifest.value);
    assert.equal(manifest.value.layers?.length, 1, 'Unexpected release package layers');
    assert.equal(
      manifest.value.layers[0].digest,
      record.archive,
      'Package archive differs from publisher receipt',
    );
    const bom = reports.get('package-bom.json');
    assert(bom && digest(bom) === record.bom, 'Package inventory bytes differ');
    const inventory = contract('package-bom', JSON.parse(bom));
    assert.deepEqual(
      inventory.source,
      selected.source,
      'Package inventory source differs',
    );
    for (const role of ['runtime', 'data']) {
      const chart = inventory.charts[role];
      const [repository, reference] = chart.reference.split('@');
      assert.equal(
        repository,
        `ghcr.io/stanimirivanov/fleetiq-deploy/fleetiq-${role}`,
        'Unexpected chart repository',
      );
      const charts = registryClient(repository, { credential: registryCredential });
      const content = await charts.object(reference);
      assert.equal(content.value.layers?.length, 1, 'Unexpected chart content');
      assert.equal(
        content.value.layers[0].digest,
        chart.archive,
        'Selected chart bytes differ',
      );
      await verifyBlobs(charts, content.value);
    }
  } else {
    const runtime = manifest.value.manifests?.filter(
      (descriptor) =>
        descriptor.platform?.os === 'linux' &&
        descriptor.platform?.architecture === 'amd64',
    );
    assert.equal(runtime?.length, 1, 'Missing/ambiguous qualified runtime');
    assert(manifest.value.manifests.length <= 16, 'Too many image manifests');
    const children = new Map();
    for (const descriptor of manifest.value.manifests) {
      const child = await registry.object(descriptor.digest);
      assert.equal(child.bytes.length, descriptor.size, 'Image manifest size differs');
      await verifyBlobs(registry, child.value);
      children.set(descriptor.digest, child);
    }
    const runtimeManifest = children.get(runtime[0].digest);
    const config = await registry.object(runtimeManifest.value.config.digest, 'blobs');
    assert.equal(
      config.value.config?.Labels?.['org.opencontainers.image.revision'],
      selected.source.revision,
      'Runtime source label differs',
    );
    assert.equal(
      config.value.config?.Labels?.['org.opencontainers.image.source'],
      `https://github.com/${repository}`,
      'Runtime repository label differs',
    );
    if (role === 'backend') {
      const bytes = reports.get('migrations.json');
      assert(
        bytes && digest(bytes) === record.inventory?.digest,
        'Migration inventory differs from published qualification',
      );
      const value = JSON.parse(bytes);
      assert.equal(
        value.format,
        'fleetiq-migrations.v1',
        'Wrong migration inventory format',
      );
      assert.equal(
        value.checksum_algorithm,
        'sha384',
        'Wrong migration checksum algorithm',
      );
      inventory = value.migrations;
      assert.equal(
        inventory.length,
        record.inventory.count,
        'Migration inventory count differs',
      );
    }
  }
  return { selected: JSON.stringify(selected), inventory, reports };
}
