import assert from 'node:assert/strict';
import { contract } from './contracts.mjs';
import { candidatePolicy, phaseAdmission } from './phase-policy.mjs';

function deadline(created, expires, now, maxLifetime) {
  const start = Date.parse(created);
  const end = Date.parse(expires);
  assert(Number.isFinite(start) && Number.isFinite(end), 'Invalid release deadline');
  assert.equal(
    new Date(start).toISOString().replace('.000Z', 'Z'),
    created,
    'Noncanonical release time',
  );
  assert.equal(
    new Date(end).toISOString().replace('.000Z', 'Z'),
    expires,
    'Noncanonical release time',
  );
  assert(
    start <= now && now < end && end > start && end - start <= maxLifetime,
    'Expired, future or excessive release deadline',
  );
}

/**
 * Admission is deliberately separate from JSON validation and activation.
 * Context must come from the registered environment and independently verified
 * Git, publisher and cluster adapters, never fields copied from the candidate.
 * D06 supplies the live cluster/receipt adapter; this function never contacts or
 * changes Kubernetes, Argo CD, a protected Git ref, or a database.
 */
export function admitCandidate(candidate, release, context) {
  contract('candidate', candidate);
  contract('release-bom', release);
  assert.equal(candidate.release, context.releaseDigest, 'Release bytes changed');
  assert.equal(candidate.releaseId, release.id, 'Release identity mismatch');
  assert.equal(candidate.environment, context.environment, 'Wrong environment');
  assert.equal(candidate.clusterUid, context.clusterUid, 'Wrong cluster incarnation');
  assert.equal(
    candidate.expectedCurrent,
    context.currentDigest,
    'Stale expected-current receipt',
  );
  assert.equal(
    context.recoveryRequired,
    false,
    'Recovery is required before another release',
  );
  assert.equal(context.clean, true, 'Dirty selection checkout');
  assert.equal(
    context.candidateReviewed,
    true,
    'Candidate commit has not been independently reviewed',
  );
  assert(
    Number.isSafeInteger(context.maxLifetimeMs) && context.maxLifetimeMs > 0,
    'Missing registered policy lifetime',
  );
  assert(Number.isFinite(context.now), 'Missing admission clock');
  deadline(
    candidate.policy.created,
    candidate.policy.expires,
    context.now,
    context.maxLifetimeMs,
  );
  candidatePolicy(candidate, context);
  for (const phase of candidate.phases) {
    const verified = context.reviewedPhases?.get(phase.commit);
    assert(
      verified && verified.tree === phase.tree && verified.name === phase.name,
      'Unreviewed phase commit/tree',
    );
  }
  if (candidate.policy.execution === 'workflow')
    assert(release.inputs.workflowTemplate, 'Workflow template is unavailable');
  for (const [name, input] of Object.entries(release.inputs)) {
    if (input === null) continue;
    assert.equal(
      context.verifiedInputs?.get(name),
      `${input.source.repository}@${input.source.revision}:${input.digest}`,
      'Unverified infrastructure/tool/template input',
    );
  }
  for (const [role, artifact] of Object.entries({
    package: release.package,
    ...release.images,
  })) {
    assert.equal(
      context.verifiedPublications?.get(role),
      JSON.stringify(artifact),
      'Unverified publication/provenance or retagged artifact',
    );
  }
  let previous = -1n;
  for (const migration of release.migrations) {
    const version = BigInt(migration.version);
    assert(version > previous, 'Duplicate/unordered migration inventory');
    previous = version;
  }
  assert.equal(
    context.verifiedMigrationInventory,
    JSON.stringify(release.migrations),
    'Migration inventory differs from producer bytes',
  );
  return { outcome: 'eligible', activation: 'not-performed' };
}

/** A separately authenticated release principal may request an exact CAS only. */
export function admitPromotion(request, candidate, context) {
  contract('request', request);
  contract('candidate', candidate);
  assert.equal(request.candidate, context.candidateDigest, 'Candidate bytes changed');
  assert.equal(
    request.candidateCommit,
    context.candidateCommit,
    'Candidate commit changed',
  );
  assert.equal(
    context.selectionOutcome,
    'eligible',
    'Candidate has not passed live admission',
  );
  assert.equal(
    context.principal,
    context.registeredReleasePrincipal,
    'Wrong release principal',
  );
  assert(
    typeof context.principal === 'string' && context.principal.length > 0,
    'Missing release principal',
  );
  assert.equal(
    context.activationRef,
    `refs/heads/environments/${candidate.environment}/active`,
    'Unregistered activation ref',
  );
  assert.equal(
    context.activeRevision,
    context.expectedActiveRevision,
    'Stale activation compare-and-swap',
  );
  assert(
    /^[a-f0-9]{40}$/u.test(context.activeRevision),
    'Missing observed activation ref revision',
  );
  assert.equal(
    context.clusterUid,
    candidate.clusterUid,
    'Cluster changed before promotion',
  );
  assert.equal(
    context.currentDigest,
    candidate.expectedCurrent,
    'Current receipt changed before promotion',
  );
  assert.equal(
    context.recoveryRequired,
    false,
    'Recovery blocks normal phase promotion',
  );
  phaseAdmission(request, candidate, context);
  for (const key of ['environment', 'clusterUid', 'expectedCurrent'])
    assert.equal(request[key], candidate[key], `Request ${key} mismatch`);
  deadline(request.created, request.expires, context.now, context.maxLifetimeMs);
  assert(
    Date.parse(request.created) >= Date.parse(candidate.policy.created) &&
      Date.parse(request.expires) <= Date.parse(candidate.policy.expires),
    'Request lies outside reviewed policy validity',
  );
  assert(
    candidate.phases.some(
      (phase) =>
        phase.commit === context.targetRevision && phase.name === context.phase,
    ),
    'Unreviewed promotion revision',
  );
  return {
    outcome: 'eligible',
    activation: 'not-performed',
    compareAndSwap: {
      ref: context.activationRef,
      before: context.activeRevision,
      after: context.targetRevision,
    },
  };
}
