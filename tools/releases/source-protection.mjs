import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { documents } from '../manifests/render.mjs';
import { digest } from './contracts.mjs';
import { github, REPOSITORY, SHA } from './github.mjs';
import { phaseManifestPolicy, sourceRegistration } from './source-graphs.mjs';

/** Guided D06 supports read-only activation refs, not a speculative writer bypass. */
export function lockedProtection(branch, protection, registration, revision) {
  assert(
    branch?.name === registration.branch &&
      branch.commit?.sha === revision &&
      branch.protected === true,
    'Activation branch is absent, changed or unprotected',
  );
  for (const [name, expected] of Object.entries({
    enforce_admins: true,
    lock_branch: true,
    allow_force_pushes: false,
    allow_deletions: false,
    allow_fork_syncing: false,
  }))
    assert.equal(
      protection?.[name]?.enabled,
      expected,
      'Guided activation requires administrator-enforced locked protection',
    );
}

/** GET-only observations; no branch, protection, cluster or sync mutation is performed. */
export async function verifyProtectedSources(
  environment,
  revision,
  { token, request = github } = {},
) {
  const registration = sourceRegistration(environment);
  assert(
    typeof revision === 'string' && SHA.test(revision),
    'Expected exact phase commit SHA',
  );
  assert(token, 'Missing source-read credential with protection-read access');
  const path = `branches/${encodeURIComponent(registration.branch)}`;
  const read = (suffix) => request(REPOSITORY, suffix, token);
  const before = await read(path);
  const protection = await read(`${path}/protection`);
  lockedProtection(before, protection, registration, revision);
  const commit = await read(`git/commits/${revision}`);
  assert(
    commit.sha === revision && SHA.test(commit.tree?.sha),
    'Invalid activation commit tree',
  );
  const tree = await read(`git/trees/${commit.tree.sha}?recursive=1`);
  assert(
    tree.sha === commit.tree.sha &&
      tree.truncated === false &&
      Array.isArray(tree.tree) &&
      tree.tree.length <= 20000,
    'Incomplete or changed activation tree',
  );
  const counts = {};
  for (const entry of tree.tree) {
    assert(
      typeof entry.path === 'string' &&
        !entry.path.startsWith('/') &&
        !entry.path.includes('\\') &&
        !entry.path.split('/').includes('..'),
      'Unsafe activation tree path',
    );
    assert(
      !/^\.argocd-source(?:[.-])/u.test(entry.path.split('/').at(-1)),
      'Argo parameter override files are forbidden',
    );
  }
  for (const role of Object.keys(registration.destinations)) {
    const directory = `releases/active/${environment}/${role}`;
    const entries = tree.tree.filter((e) => e.path.startsWith(`${directory}/`));
    assert(
      entries.length === 1 &&
        entries[0].path === `${directory}/manifests.yaml` &&
        entries[0].type === 'blob' &&
        entries[0].mode === '100644' &&
        SHA.test(entries[0].sha),
      'Phase source requires exactly one ordinary manifests.yaml file',
    );
    const blob = await read(`git/blobs/${entries[0].sha}`);
    assert(
      blob.sha === entries[0].sha &&
        blob.encoding === 'base64' &&
        typeof blob.content === 'string' &&
        Number.isSafeInteger(blob.size) &&
        blob.size > 0 &&
        blob.size <= 512 * 1024,
      'Invalid or oversized phase manifest blob',
    );
    const encoded = blob.content.replaceAll('\n', '');
    const bytes = Buffer.from(encoded, 'base64');
    assert(
      bytes.toString('base64') === encoded && bytes.length === blob.size,
      'Invalid phase blob encoding',
    );
    assert(
      createHash('sha1')
        .update(`blob ${bytes.length}\0`)
        .update(bytes)
        .digest('hex') === blob.sha,
      'Phase blob content differs from Git identity',
    );
    counts[role] = phaseManifestPolicy(role, documents(bytes.toString('utf8')));
  }
  const after = await read(path);
  const finalProtection = await read(`${path}/protection`);
  lockedProtection(after, finalProtection, registration, revision);
  const protectionDigest = digest(Buffer.from(JSON.stringify(protection)));
  assert.equal(
    digest(Buffer.from(JSON.stringify(finalProtection))),
    protectionDigest,
    'Activation protection changed during verification',
  );
  return {
    format: 'fleetiq-argo-source-verification.v1',
    environment,
    revision,
    ref: registration.ref,
    profile: 'guided-locked-ref',
    protectionDigest,
    resources: counts,
    observedAt: new Date().toISOString(),
    outcome: 'source-verified',
    liveAdmission: 'not-performed',
    activation: 'not-performed',
  };
}
