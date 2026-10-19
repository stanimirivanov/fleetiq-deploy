import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { crc32 } from 'node:zlib';
import { expectedPublicationWorkflow, verifyPublicationWorkflow } from '../ci.mjs';
import { checkContracts, contract, digest } from '../releases/contracts.mjs';
import { publicationEvidence, reportArchive } from '../releases/evidence.mjs';
import { releaseBoundary } from '../releases/git-policy.mjs';
import { maintainer, publicationRequest, reviewedCi } from '../releases/github.mjs';
import { packageVersion } from '../releases/packages.mjs';
import { phaseAdmission } from '../releases/phase-policy.mjs';
import { blobLocation, registryClient, verifyBlobs } from '../releases/registry.mjs';
import { admitCandidate, admitPromotion } from '../releases/selection.mjs';

const sha = 'a'.repeat(40);
const tree = 'b'.repeat(40);
const hash = `sha256:${'c'.repeat(64)}`;
const now = Date.parse('2026-10-19T12:00:00Z');
const source = { repository: 'stanimirivanov/fleetiq-deploy', revision: sha };
const publication = { run: 12, attempt: 1, artifactDigest: hash, recordDigest: hash };
const input = { source, digest: hash };

function fixture() {
  const release = {
    format: 'fleetiq-release.v1',
    id: 'release-1',
    package: {
      reference: `ghcr.io/stanimirivanov/fleetiq-deploy/fleetiq-release@${hash}`,
      source,
      publication,
    },
    images: Object.fromEntries(
      [
        ['backend', 'fleetiq-platform'],
        ['ux', 'fleetiq-ux'],
      ].map(([role, repo]) => [
        role,
        {
          reference: `ghcr.io/stanimirivanov/${repo}@${hash}`,
          source: { repository: `stanimirivanov/${repo}`, revision: sha },
          publication,
        },
      ]),
    ),
    inputs: { infrastructure: input, tools: input, workflowTemplate: null },
    migrations: [
      {
        version: '202610190001',
        description: 'initial schema',
        checksum: 'd'.repeat(96),
      },
    ],
  };
  const candidate = {
    format: 'fleetiq-release-candidate.v1',
    release: hash,
    releaseId: release.id,
    environment: 'local',
    clusterUid: 'cluster-incarnation-1',
    expectedCurrent: null,
    phases: [{ name: 'activation', commit: sha, tree }],
    policy: {
      mode: 'install',
      execution: 'guided',
      migration: 'none',
      backup: 'none',
      created: '2026-10-19T11:00:00Z',
      expires: '2026-10-19T13:00:00Z',
    },
  };
  const context = {
    releaseDigest: hash,
    environment: 'local',
    clusterUid: candidate.clusterUid,
    currentDigest: null,
    recoveryRequired: false,
    clean: true,
    candidateReviewed: true,
    maxLifetimeMs: 86400000,
    now,
    reviewedPhases: new Map([[sha, { tree, name: 'activation' }]]),
    emptyTargetVerified: true,
    verifiedInputs: new Map(
      Object.entries(release.inputs)
        .filter(([, value]) => value)
        .map(([key, value]) => [
          key,
          `${value.source.repository}@${value.source.revision}:${value.digest}`,
        ]),
    ),
    verifiedPublications: new Map(
      Object.entries({ package: release.package, ...release.images }).map(
        ([role, value]) => [role, JSON.stringify(value)],
      ),
    ),
    verifiedMigrationInventory: JSON.stringify(release.migrations),
  };
  const request = {
    format: 'fleetiq-release-request.v1',
    id: 'request-1',
    candidate: hash,
    candidateCommit: sha,
    environment: 'local',
    clusterUid: candidate.clusterUid,
    expectedCurrent: null,
    created: candidate.policy.created,
    expires: candidate.policy.expires,
  };
  return { release, candidate, context, request };
}

test('closed release contracts compile offline and reject unknown nested fields/types', () => {
  assert.equal(checkContracts().contracts, 6);
  const { release, candidate, request } = fixture();
  for (const [name, value] of [
    ['release-bom', release],
    ['candidate', candidate],
    ['request', request],
  ]) {
    contract(name, value);
    assert.throws(() => contract(name, { ...value, approved: true }));
  }
  const altered = structuredClone(candidate);
  altered.policy.approved = true;
  assert.throws(() => contract('candidate', altered));
  assert.throws(() => contract('candidate', { ...candidate, clusterUid: 123 }));
  assert.throws(() =>
    contract('release-bom', {
      ...release,
      images: { ...release.images, spare: release.images.ux },
    }),
  );
  assert.throws(() => contract('candidate', { ...candidate, release: 'latest' }));
  const receipt = {
    format: 'fleetiq-release-receipt.v1',
    requestId: request.id,
    candidate: hash,
    release: hash,
    environment: 'local',
    clusterUid: candidate.clusterUid,
    previous: null,
    outcome: 'recovery-required',
    phase: 'migration',
    revision: sha,
    evidence: [hash],
    finished: '2026-10-19T12:00:00Z',
  };
  contract('receipt', receipt);
  assert.throws(() => contract('receipt', { ...receipt, outcome: 'rolled-back' }));
  assert.notEqual(
    digest(Buffer.from('{}\n')),
    digest(Buffer.from('{}\r\n')),
    'Records bind bytes, including line endings',
  );
});

test('candidate admission needs independent publication/review/live-target evidence', () => {
  const { candidate, release, context } = fixture();
  assert.equal(admitCandidate(candidate, release, context).activation, 'not-performed');
  const changes = [
    (v) => {
      v.context.clusterUid = 'other-cluster';
    },
    (v) => {
      v.context.currentDigest = hash;
    },
    (v) => {
      v.context.recoveryRequired = true;
    },
    (v) => {
      v.context.clean = false;
    },
    (v) => {
      v.context.candidateReviewed = false;
    },
    (v) => {
      v.context.emptyTargetVerified = false;
    },
    (v) => {
      v.context.reviewedPhases.clear();
    },
    (v) => {
      v.candidate.phases[0].tree = sha;
    },
    (v) => {
      v.context.verifiedPublications.delete('ux');
    },
    (v) => {
      v.context.verifiedInputs.delete('infrastructure');
    },
    (v) => {
      v.context.verifiedMigrationInventory = '[]';
    },
    (v) => {
      v.candidate.policy.expires = '2026-10-19T12:00:00Z';
    },
    (v) => {
      v.candidate.policy.created = '2026-10-19T12:01:00Z';
    },
    (v) => {
      v.candidate.policy.expires = '2026-10-21T12:00:00Z';
    },
    (v) => {
      v.candidate.policy.expires = '2026-02-31T12:00:00Z';
    },
    (v) => {
      v.candidate.policy.execution = 'workflow';
    },
    (v) => {
      v.candidate.policy.mode = 'upgrade';
    },
    (v) => {
      v.candidate.policy.migration = 'forward-only';
    },
    (v) => {
      v.release.migrations.push({
        ...v.release.migrations[0],
        checksum: 'e'.repeat(96),
      });
      v.context.verifiedMigrationInventory = JSON.stringify(v.release.migrations);
    },
  ];
  for (const change of changes) {
    const value = fixture();
    change(value);
    assert.throws(() => admitCandidate(value.candidate, value.release, value.context));
  }
});

test('maintenance precedes drain, backup and irreversible approval; continuations need the same live lease', () => {
  const { candidate, release, context, request } = fixture();
  candidate.expectedCurrent = hash;
  context.currentDigest = hash;
  candidate.policy.mode = 'upgrade';
  candidate.policy.migration = 'forward-only';
  candidate.policy.backup = 'required';
  candidate.phases.unshift(
    { name: 'maintenance', commit: 'd'.repeat(40), tree },
    { name: 'migration', commit: 'e'.repeat(40), tree },
  );
  for (const phase of candidate.phases)
    context.reviewedPhases.set(phase.commit, { tree, name: phase.name });
  assert.equal(admitCandidate(candidate, release, context).outcome, 'eligible');
  const maintenance = {
    leaseHeld: true,
    usedRequestIds: new Set(),
    completedPhases: new Set(),
    phase: 'maintenance',
    targetRevision: 'd'.repeat(40),
    activeRevision: tree,
  };
  phaseAdmission(request, candidate, maintenance);
  const migration = {
    ...maintenance,
    usedRequestIds: new Set([request.id]),
    activeRequest: {
      id: request.id,
      candidate: request.candidate,
      principal: 'release',
    },
    principal: 'release',
    completedPhases: new Set(['maintenance']),
    phase: 'migration',
    targetRevision: 'e'.repeat(40),
    drainVerified: true,
    backupDigest: hash,
    verifiedBackups: new Set([hash]),
    irreversibleApproval: true,
  };
  phaseAdmission(request, candidate, migration);
  for (const change of [
    { drainVerified: false },
    { irreversibleApproval: false },
    { verifiedBackups: new Set() },
    { leaseHeld: false },
    { activeRequest: null },
    { completedPhases: new Set(['activation']) },
    { principal: 'other' },
  ])
    assert.throws(() =>
      phaseAdmission(request, candidate, { ...migration, ...change }),
    );
  assert.throws(() =>
    phaseAdmission(request, candidate, {
      ...maintenance,
      phase: 'activation',
      targetRevision: sha,
    }),
  );
  phaseAdmission(request, candidate, {
    ...migration,
    completedPhases: new Set(['maintenance', 'migration']),
    phase: 'activation',
    targetRevision: sha,
  });
});

test('promotion requires a distinct principal, active-ref CAS, fresh request identity and reviewed exact phase', () => {
  const { candidate, request } = fixture();
  const context = {
    leaseHeld: true,
    completedPhases: new Set(),
    clusterUid: candidate.clusterUid,
    currentDigest: null,
    recoveryRequired: false,
    candidateDigest: hash,
    candidateCommit: sha,
    selectionOutcome: 'eligible',
    principal: 'fleet-release',
    registeredReleasePrincipal: 'fleet-release',
    activationRef: 'refs/heads/environments/local/active',
    activeRevision: tree,
    expectedActiveRevision: tree,
    usedRequestIds: new Set(),
    now,
    maxLifetimeMs: 86400000,
    targetRevision: sha,
    phase: 'activation',
  };
  assert.equal(admitPromotion(request, candidate, context).compareAndSwap.after, sha);
  for (const change of [
    { principal: 'candidate-ci' },
    { principal: undefined, registeredReleasePrincipal: undefined },
    { activationRef: 'refs/heads/main' },
    { activeRevision: sha },
    { candidateDigest: digest(Buffer.from('changed')) },
    { usedRequestIds: new Set([request.id]) },
    { usedRequestIds: undefined },
    { targetRevision: tree },
    { selectionOutcome: 'unverified' },
    { now: now + 86400000 },
  ])
    assert.throws(() => admitPromotion(request, candidate, { ...context, ...change }));
});

test('candidate boundary rejects active edits, deletions, ApplicationSets and main-tracking Argo graphs', () => {
  const { candidate } = fixture();
  releaseBoundary(
    [['releases/candidates/local.json', JSON.stringify(candidate)]],
    new Set(['releases/candidates/local.json']),
  );
  for (const file of ['releases/active/local.json', 'releases/active/removed.yaml'])
    assert.throws(() => releaseBoundary([], new Set([file])));
  for (const kind of ['Application', 'ApplicationSet'])
    assert.throws(() =>
      releaseBoundary(
        [
          [
            'environments/local/app.yaml',
            `apiVersion: argoproj.io/v1alpha1\nkind: ${kind}\nspec:\n  source:\n    targetRevision: main\n`,
          ],
        ],
        new Set(),
      ),
    );
});

test('maintainer-only publication binds exact manual main, latest passing CI and immutable identity', () => {
  const request = {
    repository: source.repository,
    event: 'workflow_dispatch',
    ref: 'refs/heads/main',
    revision: sha,
    workflowRevision: sha,
    run: '12',
    attempt: '1',
  };
  publicationRequest(request, sha);
  for (const change of [
    { event: 'push' },
    { ref: 'refs/heads/feature' },
    { revision: tree },
    { run: '0' },
  ])
    assert.throws(() => publicationRequest({ ...request, ...change }, sha));
  maintainer({ user: { login: 'operator' }, permission: 'admin' }, 'operator');
  assert.throws(() =>
    maintainer({ user: { login: 'operator' }, permission: 'write' }, 'operator'),
  );
  const pulls = [
    {
      number: 7,
      merged_at: 'today',
      merge_commit_sha: sha,
      base: { ref: 'main' },
      head: { sha: tree, repo: { full_name: source.repository } },
    },
  ];
  const run = {
    id: 1,
    run_attempt: 1,
    head_sha: tree,
    event: 'pull_request',
    status: 'completed',
    conclusion: 'success',
    path: '.github/workflows/ci.yml',
    display_title: `FleetIQ PR 7 from ${tree} to main at ${sha}`,
  };
  assert.equal(reviewedCi(pulls, { workflow_runs: [run] }, sha).tested_revision, sha);
  assert.throws(() =>
    reviewedCi(
      pulls,
      { workflow_runs: [run, { ...run, id: 2, conclusion: 'failure' }] },
      sha,
    ),
  );
  assert.throws(() =>
    reviewedCi(
      pulls,
      { workflow_runs: [{ ...run, display_title: 'unbound checkout' }] },
      sha,
    ),
  );
  assert.match(packageVersion(sha, '12', '1'), /^0\.1\.0-r/u);
  assert.throws(() => packageVersion('main', '12', '1'));
  assert.throws(() => registryClient('registry.example/arbitrary'));
  assert.throws(() => registryClient('127.0.0.1:5000/test'));
  assert.equal(
    blobLocation(
      'https://pkg-containers.githubusercontent.com/blobs/x?grant=public-test',
    ).hostname,
    'pkg-containers.githubusercontent.com',
  );
  for (const url of [
    'http://pkg-containers.githubusercontent.com/x',
    'https://attacker.example/x',
    'https://pkg-containers.githubusercontent.com.attacker.example/x',
    'https://user:private@pkg-containers.githubusercontent.com/x',
    'https://pkg-containers.githubusercontent.com:8443/x',
  ])
    assert.throws(() => blobLocation(url));
});

test('publication workflow preserves least privilege, no push trigger and all qualification gates', () => {
  verifyPublicationWorkflow();
  verifyPublicationWorkflow(expectedPublicationWorkflow.replaceAll('\n', '\r\n'));
  for (const [before, after] of [
    ['packages: write', 'contents: write'],
    ['needs: authorize', 'needs: []'],
    ['workflow_dispatch:', 'push:'],
    ['pnpm check', 'echo skipped'],
    ['pnpm packages:check', 'echo skipped'],
    ['persist-credentials: false', 'persist-credentials: true'],
    ['actions/checkout@v7', 'actions/checkout@v8'],
  ])
    assert.throws(() =>
      verifyPublicationWorkflow(expectedPublicationWorkflow.replace(before, after)),
    );
});

// Stored ZIP builder is test-only, to exercise the maintained reader with hostile inputs.
function zip(entries) {
  const local = [];
  const central = [];
  let offset = 0;
  for (const [path, content, mode = 0o100644] of entries) {
    const name = Buffer.from(path);
    const bytes = Buffer.from(content);
    const crc = crc32(bytes);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50);
    header.writeUInt16LE(20, 4);
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(bytes.length, 18);
    header.writeUInt32LE(bytes.length, 22);
    header.writeUInt16LE(name.length, 26);
    local.push(header, name, bytes);
    const directory = Buffer.alloc(46);
    directory.writeUInt32LE(0x02014b50);
    directory.writeUInt16LE(0x0314, 4);
    directory.writeUInt16LE(20, 6);
    directory.writeUInt32LE(crc, 16);
    directory.writeUInt32LE(bytes.length, 20);
    directory.writeUInt32LE(bytes.length, 24);
    directory.writeUInt16LE(name.length, 28);
    directory.writeUInt32LE((mode << 16) >>> 0, 38);
    directory.writeUInt32LE(offset, 42);
    central.push(directory, name);
    offset += header.length + name.length + bytes.length;
  }
  const records = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(records.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, records, end]);
}

test('evidence reader rejects traversal, links, ambiguous reports, non-JSON and expanded bounds', async () => {
  assert.equal(
    (await reportArchive(zip([['reports/publication.json', '{}']])))
      .get('publication.json')
      .toString(),
    '{}',
  );
  for (const entries of [
    [['../publication.json', '{}']],
    [['linked.json', '{}', 0o120777]],
    [
      ['a/publication.json', '{}'],
      ['b/publication.json', '{}'],
    ],
    [['secret.txt', 'no']],
    [['huge.json', 'x'.repeat(32 * 1024 * 1024)]],
  ])
    await assert.rejects(() => reportArchive(zip(entries)));
});

test('schema-valid producer claims cannot substitute for independent GitHub publication evidence', () => {
  const { release } = fixture();
  const selected = structuredClone(release.images.backend);
  const qualification = Buffer.from('{"outcome":"passed"}\n');
  const record = {
    format: 'fleetiq-image-publication.v1',
    outcome: 'published',
    image: selected.reference,
    source: { revision: sha, dirty: false },
    authorization: {
      repository: selected.source.repository,
      revision: sha,
      run: '12',
      attempt: '1',
      actor: 'operator',
      triggeringActor: 'operator',
    },
    qualification: digest(qualification),
  };
  const bytes = Buffer.from(JSON.stringify(record));
  selected.publication.recordDigest = digest(bytes);
  const reports = new Map([
    ['publication.json', bytes],
    ['qualification.json', qualification],
  ]);
  const run = {
    id: 12,
    run_attempt: 1,
    repository: { full_name: selected.source.repository },
    path: '.github/workflows/publish-image.yml',
    event: 'workflow_dispatch',
    head_branch: 'main',
    head_sha: sha,
    status: 'completed',
    conclusion: 'success',
    actor: { login: 'operator' },
    triggering_actor: { login: 'operator' },
  };
  publicationEvidence('backend', selected, run, reports);
  for (const change of [
    { conclusion: 'failure' },
    { event: 'push' },
    { head_sha: tree },
    { path: '.github/workflows/untrusted.yml' },
    { run_attempt: 2 },
    { actor: { login: 'other' } },
  ])
    assert.throws(() =>
      publicationEvidence('backend', selected, { ...run, ...change }, reports),
    );
  assert.throws(() => publicationEvidence('ux', selected, run, reports));
  assert.throws(() => publicationEvidence('backend', selected, run, new Map()));
});

test('live OCI descriptor checks reject missing blobs, wrong sizes and retagged bytes', async (context) => {
  let status = 200;
  let length = '2';
  let identity = hash;
  const server = createServer((_request, response) => {
    response.writeHead(status, {
      'Content-Length': length,
      'Docker-Content-Digest': identity,
    });
    response.end();
  });
  await new Promise((ready) => server.listen(0, '127.0.0.1', ready));
  context.after(() => new Promise((done) => server.close(done)));
  const registry = registryClient(`127.0.0.1:${server.address().port}/fixture`, {
    loopback: true,
  });
  const descriptor = { digest: hash, size: 2 };
  await verifyBlobs(registry, { config: descriptor, layers: [descriptor] });
  status = 404;
  await assert.rejects(() => registry.descriptor(descriptor));
  status = 200;
  length = '3';
  await assert.rejects(() => registry.descriptor(descriptor));
  length = '2';
  identity = digest(Buffer.from('changed'));
  await assert.rejects(() => registry.descriptor(descriptor));
  await assert.rejects(() => registry.descriptor({ digest: 'latest', size: 2 }));
});
