import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { releaseBoundary } from '../releases/git-policy.mjs';
import {
  phaseManifestPolicy,
  registeredGraph,
  sourceGraphPolicy,
  sourceRegistration,
} from '../releases/source-graphs.mjs';
import { verifyProtectedSources } from '../releases/source-protection.mjs';

const revision = 'a'.repeat(40);
const treeSha = 'b'.repeat(40); // A commit SHA is not its tree SHA.
const fixtureToken = 'fixture-read-token';
const graphFiles = () =>
  [...registeredGraph('local')].map(([file]) => [file, readFileSync(file, 'utf8')]);
const encode = (value) => JSON.stringify(value);

test('checked-in graph contains both closed, role-isolated projects and manual-sync applications', () => {
  const result = releaseBoundary(graphFiles(), new Set());
  assert.equal(result.resources, 4);
  assert.deepEqual(result.environments, ['local']);
  for (const [file, value] of registeredGraph('local')) {
    if (file.endsWith('-application.yaml')) {
      assert.equal(
        value.spec.source.targetRevision,
        'refs/heads/environments/local/active',
      );
      assert.equal(value.spec.source.directory.include, 'manifests.yaml');
      assert.equal(value.spec.syncPolicy.automated, undefined);
    } else {
      assert.equal(value.spec.destinations.length, 1);
      assert.deepEqual(value.spec.clusterResourceWhitelist, []);
      assert(
        !value.spec.namespaceResourceWhitelist.some((r) =>
          ['Secret', 'Role', 'RoleBinding', 'Application'].includes(r.kind),
        ),
      );
    }
  }
  assert.equal(sourceGraphPolicy([]).resources, 0);
});

test('source graph mutations cannot track main, override revisions/renderers or broaden authority', () => {
  for (const mutate of [
    (v) => {
      v.spec.source.targetRevision = 'main';
    },
    (v) => {
      v.spec.source.targetRevision = revision;
    },
    (v) => {
      v.spec.source.targetRevision = 'refs/heads/feature/candidate';
    },
    (v) => {
      v.spec.source.repoURL = 'https://github.com/foreign/repository.git';
    },
    (v) => {
      v.spec.source.path = '../foreign';
    },
    (v) => {
      v.spec.source.directory.recurse = true;
    },
    (v) => {
      v.spec.source.directory.include = '*.yaml';
    },
    (v) => {
      v.spec.source.helm = { parameters: [{ name: 'image', value: 'other' }] };
    },
    (v) => {
      v.spec.source.plugin = { name: 'unreviewed' };
    },
    (v) => {
      v.spec.sources = [v.spec.source];
      delete v.spec.source;
    },
    (v) => {
      v.spec.destination.namespace = 'fleetiq-data';
    },
    (v) => {
      v.spec.destination.server = 'https://foreign-cluster.test';
    },
    (v) => {
      v.spec.project = 'default';
    },
    (v) => {
      v.spec.syncPolicy.automated = { prune: true };
    },
    (v) => {
      v.operation = { sync: { revision: 'main' } };
    },
    (v) => {
      v.metadata.annotations = { 'argocd.argoproj.io/sync-options': 'Replace=true' };
    },
    (v) => {
      v.metadata.finalizers = ['resources-finalizer.argocd.argoproj.io'];
    },
    (v) => {
      v.status = { operationState: {} };
    },
  ]) {
    const values = registeredGraph('local');
    const file = 'gitops/local/runtime-application.yaml';
    mutate(values.get(file));
    assert.throws(() => sourceGraphPolicy([...values].map(([f, v]) => [f, encode(v)])));
  }
  for (const mutate of [
    (v) => {
      v.spec.sourceRepos = ['*'];
    },
    (v) => {
      v.spec.destinations = [{ server: '*', namespace: '*' }];
    },
    (v) => {
      v.spec.sourceNamespaces = ['*'];
    },
    (v) => {
      v.spec.clusterResourceWhitelist = [{ group: '*', kind: '*' }];
    },
    (v) => {
      v.spec.namespaceResourceWhitelist.push({ group: '', kind: 'Secret' });
    },
    (v) => {
      v.spec.roles = [{ name: 'admin', policies: ['allow everything'] }];
    },
  ]) {
    const values = registeredGraph('local');
    mutate(values.get('gitops/local/runtime-project.yaml'));
    assert.throws(() => sourceGraphPolicy([...values].map(([f, v]) => [f, encode(v)])));
  }
});

test('JSON, List, arrays, duplicates, incomplete pairs and unregistered control files fail closed', () => {
  const app = registeredGraph('local').get('gitops/local/runtime-application.yaml');
  for (const value of [
    app,
    { apiVersion: 'v1', kind: 'List', items: [app] },
    [app],
    [[app]],
    { ...app, kind: 'ApplicationSet' },
    { ...app, kind: 'AppProject' },
  ])
    assert.throws(() =>
      releaseBoundary([['unregistered/graph.json', encode(value)]], new Set()),
    );
  for (const value of [{ apiVersion: 'v1', kind: 'List', items: [app] }, [app]])
    assert.throws(() =>
      sourceGraphPolicy([['gitops/local/runtime-application.yaml', encode(value)]]),
    );
  assert.throws(() => sourceGraphPolicy(graphFiles().slice(1)));
  assert.throws(() => sourceGraphPolicy([...graphFiles(), graphFiles()[0]]));
  assert.throws(() =>
    sourceGraphPolicy([
      ...graphFiles(),
      ['gitops/local/kustomization.yaml', 'resources: []'],
    ]),
  );
  assert.throws(() =>
    sourceGraphPolicy([['charts/example/templates/argo.json', encode(app)]]),
  );
  assert.throws(() =>
    sourceGraphPolicy([
      [
        'gitops/local/runtime-application.yaml',
        'kind: Application\nkind: ApplicationSet',
      ],
    ]),
  );
  assert.throws(() => sourceRegistration('foreign'));
  assert.throws(() =>
    releaseBoundary(
      graphFiles(),
      new Set(['releases/active/local/runtime/manifests.yaml']),
    ),
  );
});

test('rejected source fields never echo untrusted values', () => {
  const values = registeredGraph('local');
  values.get('gitops/local/runtime-application.yaml').spec.source.repoURL =
    'sensitive-value-sentinel';
  assert.throws(
    () => sourceGraphPolicy([...values].map(([f, v]) => [f, encode(v)])),
    (error) => !error.message.includes('sensitive-value-sentinel'),
  );
});

function protocolFixture() {
  const registration = sourceRegistration('local');
  const path = `branches/${encodeURIComponent(registration.branch)}`;
  const branch = {
    name: registration.branch,
    protected: true,
    commit: { sha: revision },
  };
  const protection = Object.fromEntries(
    Object.entries({
      enforce_admins: true,
      lock_branch: true,
      allow_force_pushes: false,
      allow_deletions: false,
      allow_fork_syncing: false,
    }).map(([key, enabled]) => [key, { enabled }]),
  );
  const routes = new Map([
    [path, branch],
    [`${path}/protection`, protection],
    [`git/commits/${revision}`, { sha: revision, tree: { sha: treeSha } }],
  ]);
  const entries = [];
  for (const [role, namespace] of Object.entries(registration.destinations)) {
    // Scope-only fixtures. Full workload schema/security acceptance remains separate.
    const value = {
      apiVersion: role === 'runtime' ? 'v1' : 'postgresql.cnpg.io/v1',
      kind: role === 'runtime' ? 'Service' : 'Cluster',
      metadata: { name: `fleetiq-${role}`, namespace },
    };
    const bytes = Buffer.from(encode(value));
    const sha = createHash('sha1')
      .update(`blob ${bytes.length}\0`)
      .update(bytes)
      .digest('hex');
    entries.push({
      path: `releases/active/local/${role}/manifests.yaml`,
      type: 'blob',
      mode: '100644',
      sha,
    });
    routes.set(`git/blobs/${sha}`, {
      sha,
      encoding: 'base64',
      size: bytes.length,
      content: `${bytes.toString('base64')}\n`,
    });
  }
  const tree = { sha: treeSha, truncated: false, tree: entries };
  routes.set(`git/trees/${treeSha}?recursive=1`, tree);
  const calls = [];
  const request = async (repository, suffix, token) => {
    assert.equal(repository, 'stanimirivanov/fleetiq-deploy');
    assert.equal(token, fixtureToken);
    calls.push(suffix);
    assert(routes.has(suffix), 'Unexpected GitHub observation');
    return structuredClone(routes.get(suffix));
  };
  return { path, branch, protection, tree, routes, calls, request };
}

test('read-only verifier resolves commit to tree, hashes blobs and rechecks ref/protection', async () => {
  const fixture = protocolFixture();
  const result = await verifyProtectedSources('local', revision, {
    token: fixtureToken,
    request: fixture.request,
  });
  assert.equal(result.outcome, 'source-verified');
  assert.equal(result.liveAdmission, 'not-performed');
  assert.equal(result.activation, 'not-performed');
  assert.deepEqual(result.resources, { runtime: 1, data: 1 });
  assert.equal(fixture.calls.filter((p) => p === fixture.path).length, 2);
  assert.equal(
    fixture.calls.filter((p) => p === `${fixture.path}/protection`).length,
    2,
  );
  assert(!JSON.stringify(result).includes(fixtureToken));
});

for (const [name, change] of [
  [
    'wrong ref',
    (f) => {
      f.branch.name = 'main';
    },
  ],
  [
    'changed revision',
    (f) => {
      f.branch.commit.sha = treeSha;
    },
  ],
  [
    'unprotected ref',
    (f) => {
      f.branch.protected = false;
    },
  ],
  [
    'disabled admin enforcement',
    (f) => {
      f.protection.enforce_admins.enabled = false;
    },
  ],
  [
    'unlocked ref',
    (f) => {
      f.protection.lock_branch.enabled = false;
    },
  ],
  [
    'force pushes',
    (f) => {
      f.protection.allow_force_pushes.enabled = true;
    },
  ],
  [
    'deletion',
    (f) => {
      f.protection.allow_deletions.enabled = true;
    },
  ],
  [
    'fork syncing',
    (f) => {
      f.protection.allow_fork_syncing.enabled = true;
    },
  ],
  [
    'missing protection fields',
    (f) => {
      delete f.protection.lock_branch;
    },
  ],
  [
    'truncated tree',
    (f) => {
      f.tree.truncated = true;
    },
  ],
  [
    'wrong tree identity',
    (f) => {
      f.tree.sha = revision;
    },
  ],
  [
    'missing phase',
    (f) => {
      f.tree.tree.pop();
    },
  ],
  [
    'symlink',
    (f) => {
      f.tree.tree[0].mode = '120000';
    },
  ],
  [
    'submodule',
    (f) => {
      f.tree.tree[0].type = 'commit';
    },
  ],
  [
    'source override',
    (f) => {
      f.tree.tree.push({ path: '.argocd-source.yaml', type: 'blob' });
    },
  ],
  [
    'per-app source override',
    (f) => {
      f.tree.tree.push({
        path: 'releases/active/local/runtime/.argocd-source-fleetiq-local-runtime.yaml',
        type: 'blob',
      });
    },
  ],
  [
    'remote renderer',
    (f) => {
      f.tree.tree.push({
        path: 'releases/active/local/runtime/kustomization.yaml',
        type: 'blob',
      });
    },
  ],
  [
    'blob corruption',
    (f) => {
      const blob = f.routes.get(`git/blobs/${f.tree.tree[0].sha}`);
      blob.content = Buffer.from('changed').toString('base64');
      blob.size = 7;
    },
  ],
  [
    'oversized blob',
    (f) => {
      f.routes.get(`git/blobs/${f.tree.tree[0].sha}`).size = 1024 * 1024;
    },
  ],
])
  test(`protected-source verification rejects ${name}`, async () => {
    const f = protocolFixture();
    change(f);
    await assert.rejects(
      verifyProtectedSources('local', revision, {
        token: fixtureToken,
        request: f.request,
      }),
    );
  });

test('failed remote observations and mid-verification protection/ref changes cannot pass', async () => {
  for (const change of ['missing', 'branch', 'protection']) {
    const f = protocolFixture();
    let branchReads = 0;
    let protectionReads = 0;
    const request = async (repo, path, token) => {
      if (change === 'missing')
        throw new Error('GitHub prerequisite failed (HTTP 404)');
      const result = await f.request(repo, path, token);
      if (path === f.path && ++branchReads === 2 && change === 'branch')
        result.commit.sha = treeSha;
      if (
        path === `${f.path}/protection` &&
        ++protectionReads === 2 &&
        change === 'protection'
      )
        result.extra = 'changed';
      return result;
    };
    await assert.rejects(
      verifyProtectedSources('local', revision, { token: fixtureToken, request }),
    );
  }
  await assert.rejects(
    verifyProtectedSources('local', 'main', { token: fixtureToken }),
  );
  await assert.rejects(verifyProtectedSources('local', revision, {}));
});

test('phase scope refuses control resources, credentials, hooks, foreign namespaces and duplicate identities', () => {
  const service = {
    apiVersion: 'v1',
    kind: 'Service',
    metadata: { name: 'fleetiq-backend', namespace: 'fleetiq-apps' },
  };
  for (const items of [
    [],
    [service, service],
    [{ ...service, kind: 'Secret' }],
    [{ ...service, metadata: { ...service.metadata, namespace: 'fleetiq-data' } }],
    [{ ...service, apiVersion: 'argoproj.io/v1alpha1', kind: 'Application' }],
    [
      {
        ...service,
        metadata: {
          ...service.metadata,
          annotations: { 'argocd.argoproj.io/hook': 'PreSync' },
        },
      },
    ],
    [{ ...service, apiVersion: 'v2' }],
  ])
    assert.throws(() => phaseManifestPolicy('runtime', items));
});

test('source CLI rejects missing arguments, symbolic revisions and missing credentials without receipts', () => {
  const directory = 'target/source-graph-evidence';
  const snapshot = () =>
    existsSync(directory) ? readdirSync(directory, { recursive: true }).sort() : [];
  const before = snapshot();
  for (const args of [[], ['local', 'main'], ['local', revision]]) {
    const env = { ...process.env };
    delete env.FLEETIQ_SOURCE_READ_TOKEN;
    const result = spawnSync(
      process.execPath,
      ['tools/releases/cli.mjs', 'verify-sources', ...args],
      {
        env,
        encoding: 'utf8',
        timeout: 30000,
      },
    );
    assert.equal(result.error, undefined);
    assert.equal(result.status, 1);
    assert.match(
      result.stderr,
      /Provide registered environment|Expected exact phase commit|Missing source-read credential/u,
    );
    assert.equal(result.stdout, '');
  }
  assert.deepEqual(snapshot(), before);
});
