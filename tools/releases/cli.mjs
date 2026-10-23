import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { checkContracts, readContract } from './contracts.mjs';
import { checkReleaseBoundaries } from './git-policy.mjs';
import { authorize } from './github.mjs';
import { releaseOutput } from './output.mjs';
import { verifyPublication } from './provenance.mjs';
import { publish } from './publication.mjs';
import { verifyProtectedSources } from './source-protection.mjs';

try {
  const [command, file, revision] = process.argv.slice(2);
  if (command === 'authorize') {
    await authorize();
    console.log(
      'Exact reviewed main publication authorized; no environment authority granted.',
    );
  } else if (command === 'publish') await publish();
  else if (command === 'contracts') {
    console.log(JSON.stringify({ ...checkContracts(), ...checkReleaseBoundaries() }));
  } else if (command === 'verify-sources') {
    assert(
      process.argv.slice(2).length === 3,
      'Provide registered environment and exact phase commit',
    );
    const { sourceGraphs } = checkReleaseBoundaries();
    assert(
      sourceGraphs.environments.includes(file),
      'Complete registered source graph is required',
    );
    const verified = await verifyProtectedSources(file, revision, {
      token: process.env.FLEETIQ_SOURCE_READ_TOKEN,
    });
    const output = mkdtempSync(
      join(releaseOutput('source-graph-evidence', file), 'run-'),
    );
    writeFileSync(
      join(output, 'verification.json'),
      JSON.stringify({ ...verified, graphDigest: sourceGraphs.graphDigest }, null, 2) +
        '\n',
      { flag: 'wx' },
    );
    console.log(
      'Locked activation source verified; live admission, sync and activation were not performed.',
    );
  } else if (command === 'verify-artifacts') {
    assert(file, 'Provide the complete release BOM file');
    const release = readContract('release-bom', resolve(file));
    const output = mkdtempSync(
      join(releaseOutput('release-evidence', release.digest.slice(7)), 'run-'),
    );
    for (const [role, selected] of Object.entries({
      package: release.value.package,
      ...release.value.images,
    })) {
      const verified = await verifyPublication(role, selected, {
        token: process.env.FLEETIQ_SOURCE_READ_TOKEN,
        registryCredential: process.env.FLEETIQ_REGISTRY_READ_TOKEN
          ? {
              actor: process.env.FLEETIQ_REGISTRY_ACTOR,
              token: process.env.FLEETIQ_REGISTRY_READ_TOKEN,
            }
          : undefined,
      });
      if (role === 'backend')
        assert.equal(
          JSON.stringify(verified.inventory),
          JSON.stringify(release.value.migrations),
          'Selected migrations differ from published backend',
        );
      const directory = join(output, role);
      mkdirSync(directory);
      for (const [name, bytes] of verified.reports)
        writeFileSync(join(directory, name), bytes, { flag: 'wx' });
    }
    writeFileSync(
      join(output, 'artifact-verification.json'),
      `${JSON.stringify({ format: 'fleetiq-release-artifacts.v1', release: release.digest, outcome: 'verified', liveAdmission: 'not-performed', activation: 'not-performed' }, null, 2)}\n`,
      { flag: 'wx' },
    );
    console.log(
      'Producer artifacts verified; evidence retained locally. Live admission and promotion were not performed.',
    );
  } else
    throw new Error(
      'Use contracts, authorize, publish, verify-artifacts or verify-sources',
    );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
