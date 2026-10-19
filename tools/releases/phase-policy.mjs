import assert from 'node:assert/strict';

/** Candidate policy can be reviewed before maintenance produces execution evidence. */
export function candidatePolicy(candidate, context) {
  const names = candidate.phases.map((phase) => phase.name);
  assert.equal(new Set(names).size, names.length, 'Duplicate phase');
  assert.deepEqual(
    names,
    ['maintenance', 'migration', 'activation', 'recovery'].filter((name) =>
      names.includes(name),
    ),
    'Unordered release phases',
  );
  assert(names.includes('activation'), 'Missing activation phase');
  if (candidate.policy.mode === 'install') {
    assert.equal(
      candidate.expectedCurrent,
      null,
      'Install cannot replace an existing release',
    );
    assert.equal(context.emptyTargetVerified, true, 'No live empty-target proof');
  } else {
    assert.notEqual(
      candidate.expectedCurrent,
      null,
      'Upgrade requires a durable current receipt',
    );
    assert(names.includes('maintenance'), 'Upgrade needs reviewed maintenance');
  }
  if (candidate.policy.migration === 'forward-only') {
    assert(names.includes('migration'), 'Missing migration phase');
    assert.equal(
      candidate.policy.backup,
      'required',
      'Forward migration needs a backup requirement',
    );
  } else {
    assert.equal(candidate.policy.backup, 'none', 'Unexpected migration backup');
    assert(
      !names.includes('migration'),
      'No-migration policy cannot run a migration phase',
    );
  }
}

/** Phase continuation requires the same owned live lease; completed requests cannot replay. */
export function phaseAdmission(request, candidate, context) {
  assert.equal(context.leaseHeld, true, 'Release synchronization lease is not held');
  assert.equal(
    typeof context.usedRequestIds?.has(request.id),
    'boolean',
    'Request ledger is unavailable',
  );
  const used = context.usedRequestIds.has(request.id);
  if (used) {
    assert(
      context.activeRequest &&
        context.activeRequest.id === request.id &&
        context.activeRequest.candidate === request.candidate &&
        context.activeRequest.principal === context.principal,
      'Replayed request or foreign release lease',
    );
  } else assert(!context.activeRequest, 'Another release request owns the environment');
  assert(context.completedPhases instanceof Set, 'Phase ledger is unavailable');
  const normal = candidate.phases.filter((phase) => phase.name !== 'recovery');
  assert.deepEqual(
    [...context.completedPhases].sort(),
    normal
      .slice(0, context.completedPhases.size)
      .map((phase) => phase.name)
      .sort(),
    'Phase ledger is not a completed prefix',
  );
  if (!used)
    assert.equal(
      context.completedPhases.size,
      0,
      'New request cannot inherit completed phases',
    );
  const next = normal.find((phase) => !context.completedPhases.has(phase.name));
  assert(
    next && next.name === context.phase && next.commit === context.targetRevision,
    'Phase skipped, replayed or unreviewed',
  );
  assert.notEqual(
    context.activeRevision,
    context.targetRevision,
    'Activation revision was already applied',
  );
  if (context.phase !== 'maintenance' && candidate.policy.mode === 'upgrade')
    assert.equal(context.drainVerified, true, 'No verified old-worker drain');
  if (context.phase === 'migration') {
    assert(
      /^sha256:[a-f0-9]{64}$/u.test(context.backupDigest) &&
        context.verifiedBackups?.has(context.backupDigest),
      'Backup is missing/unverified',
    );
    assert.equal(
      context.irreversibleApproval,
      true,
      'Irreversible migration lacks independent approval',
    );
  }
}
