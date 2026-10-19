import assert from 'node:assert/strict';
import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { completedReceipt } from '../ci-evidence.mjs';
import { manifestTools } from '../manifests/toolchain.mjs';
import { root, run } from '../process.mjs';
import { digest } from './contracts.mjs';
import { authorize, REPOSITORY } from './github.mjs';
import { releaseOutput } from './output.mjs';
import { publishReleasePackage } from './packages.mjs';

function receipt(group, revision) {
  const directory = resolve(root, '.verification');
  const reports = readdirSync(directory)
    .filter((name) => name.startsWith(`${group}-`) && name.endsWith('.json'))
    .map((name) => readFileSync(join(directory, name)));
  const valid = reports.filter((bytes) =>
    completedReceipt(JSON.parse(bytes), group, revision),
  );
  assert.equal(
    valid.length,
    1,
    'Publication needs exactly one current successful verification receipt per group',
  );
  return valid[0];
}

/** Chart/package writes only; this credential has no Git promotion or Kubernetes authority. */
export async function publish() {
  assert.equal(
    process.platform,
    'linux',
    'Production publication runs only on the reviewed Linux job',
  );
  const authorization = await authorize();
  assert.equal(
    run('git', ['status', '--porcelain']),
    '',
    'Publication requires clean source',
  );
  assert.equal(
    run('git', ['rev-parse', 'HEAD']),
    authorization.revision,
    'Source checkout differs',
  );
  const qualificationBytes = receipt('packages', authorization.revision);
  receipt('structural', authorization.revision);
  const tools = manifestTools();
  const parent = realpathSync(tmpdir());
  const output = releaseOutput('release-reports');
  assert.equal(realpathSync(output), output, 'Linked publication output refused');
  assert.equal(
    readdirSync(output).length,
    0,
    'Previous publication reports must not be overwritten',
  );
  const temporary = mkdtempSync(join(parent, 'fleetiq-release-publish-'));
  try {
    // Only this process-owned file contains registry credentials. No global login.
    const registryConfig = join(temporary, 'registry.json');
    assert(process.env.GITHUB_TOKEN, 'Publication registry token unavailable');
    writeFileSync(
      registryConfig,
      JSON.stringify({
        auths: {
          'ghcr.io': {
            auth: Buffer.from(
              `${authorization.actor}:${process.env.GITHUB_TOKEN}`,
            ).toString('base64'),
          },
        },
      }),
      { mode: 0o600, flag: 'wx' },
    );
    const confirmed = await authorize();
    assert.deepEqual(confirmed, authorization, 'Publication authorization changed');
    const source = { repository: REPOSITORY, revision: authorization.revision };
    const artifact = await publishReleasePackage(tools, temporary, {
      target: `ghcr.io/${REPOSITORY}`,
      source,
      run: authorization.run,
      attempt: authorization.attempt,
      qualification: JSON.parse(qualificationBytes),
      registryConfig,
      credential: { actor: authorization.actor, token: process.env.GITHUB_TOKEN },
    });
    assert.equal(
      run('git', ['status', '--porcelain']),
      '',
      'Source changed during publication',
    );
    const bom = readFileSync(join(temporary, 'package-bom.json'));
    const record = {
      format: 'fleetiq-package-publication.v1',
      outcome: 'published',
      image: artifact.reference,
      archive: artifact.archive,
      bom: digest(bom),
      source: { ...source, dirty: false },
      qualification: digest(qualificationBytes),
      authorization,
    };
    writeFileSync(join(output, 'qualification.json'), qualificationBytes);
    writeFileSync(join(output, 'package-bom.json'), bom);
    writeFileSync(
      join(output, 'publication.json'),
      `${JSON.stringify(record, null, 2)}\n`,
    );
    console.log(`Published immutable release package: ${artifact.reference}`);
  } finally {
    assert.equal(
      dirname(realpathSync(temporary)),
      parent,
      'Unsafe publication scratch cleanup',
    );
    rmSync(temporary, { recursive: true, force: true });
  }
}
