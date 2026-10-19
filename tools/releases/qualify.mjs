import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { checkManifests } from '../manifests/check.mjs';
import { manifestTools } from '../manifests/toolchain.mjs';
import { run } from '../process.mjs';
import { publishReleasePackage } from './packages.mjs';
import { registryClient } from './registry.mjs';

export const REGISTRY_IMAGE =
  'registry:3.0.0@sha256:6c5666b861f3505b116bb9aa9b25175e71210414bd010d92035ff64018f9457e';

/** Real OCI round trip. All mutations and cleanup are restricted to this UUID-owned registry. */
export async function qualifyPackages() {
  const tools = manifestTools();
  const qualification = checkManifests();
  const context = run('docker', ['context', 'show']);
  const docker = (args) => run('docker', ['--context', context, ...args]);
  assert.equal(
    docker(['info', '--format', '{{.OSType}}']),
    'linux',
    'Linux Docker engine required for OCI fixture',
  );
  const owner = `fleetiq-packages-${randomUUID()}`;
  const parent = realpathSync(tmpdir());
  const directory = mkdtempSync(join(parent, 'fleetiq-packages-'));
  let created = false;
  try {
    docker(['pull', REGISTRY_IMAGE]);
    docker([
      'create',
      '--name',
      owner,
      '--label',
      `io.fleetiq.package-owner=${owner}`,
      '--user',
      '65532:65532',
      '--read-only',
      '--cap-drop',
      'ALL',
      '--security-opt',
      'no-new-privileges:true',
      '--memory',
      '192m',
      '--cpus',
      '1',
      '--pids-limit',
      '128',
      '--tmpfs',
      '/var/lib/registry:rw,noexec,nosuid,size=64m,mode=0700,uid=65532,gid=65532',
      '--publish',
      '127.0.0.1::5000',
      REGISTRY_IMAGE,
    ]);
    created = true;
    docker(['start', owner]);
    const inspect = () => JSON.parse(docker(['inspect', owner]))[0];
    const port = inspect().NetworkSettings.Ports['5000/tcp'][0];
    assert.equal(port.HostIp, '127.0.0.1', 'Fixture registry must not be public');
    const target = `127.0.0.1:${port.HostPort}/fleetiq-deploy`;
    let ready = false;
    for (let attempt = 0; attempt < 30; attempt++) {
      try {
        const response = await fetch(`http://127.0.0.1:${port.HostPort}/v2/`, {
          signal: AbortSignal.timeout(1000),
        });
        ready = response.ok;
      } catch {
        /* Startup only; exhaustion fails below. */
      }
      if (ready) break;
      await delay(200);
    }
    assert(ready, 'Owned OCI registry did not become ready');
    const source = {
      repository: 'stanimirivanov/fleetiq-deploy',
      revision: run('git', ['rev-parse', 'HEAD']),
    };
    const result = await publishReleasePackage(tools, directory, {
      target,
      source,
      run: '1',
      attempt: '1',
      loopback: true,
      qualification,
    });
    const chart = result.bom.charts.runtime.reference;
    const [repository, expected] = chart.split('@');
    const registry = registryClient(repository, { loopback: true });
    await assert.rejects(() => registry.absent(result.bom.version), /exists/u);
    await assert.rejects(
      () => registry.object(`sha256:${'0'.repeat(64)}`),
      /unavailable/u,
    );
    // Overwrite only this disposable discovery tag with a different chart manifest.
    const original = await registry.object(expected);
    const altered = {
      ...original.value,
      annotations: { ...original.value.annotations, 'io.fleetiq.fixture': 'retagged' },
    };
    const response = await fetch(
      `http://127.0.0.1:${port.HostPort}/v2/fleetiq-deploy/fleetiq-runtime/manifests/${result.bom.version}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/vnd.oci.image.manifest.v1+json' },
        body: JSON.stringify(altered),
        signal: AbortSignal.timeout(10_000),
      },
    );
    assert(response.ok, 'Owned retag fixture failed');
    assert.notEqual(
      (await registry.object(result.bom.version)).digest,
      expected,
      'Retag mutation was ineffective',
    );
    assert.equal(
      (await registry.object(expected)).digest,
      expected,
      'Digest pull must survive tag mutation',
    );
    return {
      charts: 2,
      package: result.reference,
      renderCompared: true,
      missingRejected: true,
      overwriteRejected: true,
      retagObserved: true,
      digestPreserved: true,
      activation: 'not-performed',
    };
  } finally {
    try {
      if (created) {
        const owned = JSON.parse(docker(['inspect', owner]))[0];
        assert.equal(
          owned.Config.Labels['io.fleetiq.package-owner'],
          owner,
          'Registry cleanup ownership mismatch',
        );
        docker(['rm', '--force', owner]);
        assert.equal(
          docker([
            'ps',
            '--all',
            '--filter',
            `label=io.fleetiq.package-owner=${owner}`,
            '--format',
            '{{.ID}}',
          ]),
          '',
          'Owned registry cleanup incomplete',
        );
      }
    } finally {
      assert.equal(
        dirname(realpathSync(directory)),
        parent,
        'Unsafe package scratch cleanup',
      );
      rmSync(directory, { recursive: true, force: true });
    }
  }
}
