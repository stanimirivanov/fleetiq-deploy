import assert from 'node:assert/strict';

export const REPOSITORY = 'stanimirivanov/fleetiq-deploy';
export const SHA = /^[a-f0-9]{40}$/u;
const repositories = new Set([
  REPOSITORY,
  'stanimirivanov/fleetiq-platform',
  'stanimirivanov/fleetiq-ux',
]);

/** Fixed GitHub authority; tokens never cross redirects or appear in diagnostics. */
export async function github(repository, path, token = process.env.GITHUB_TOKEN) {
  assert(
    repositories.has(repository) && token,
    'Missing trusted repository credential',
  );
  assert(!path.includes('..') && !path.includes('#'), 'Unsafe GitHub path');
  const response = await fetch(`https://api.github.com/repos/${repository}/${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    redirect: 'error',
    signal: AbortSignal.timeout(15_000),
  });
  assert(response.ok, `GitHub prerequisite failed (HTTP ${response.status})`);
  const bytes = Buffer.from(await response.arrayBuffer());
  assert(bytes.length <= 8 * 1024 * 1024, 'GitHub response exceeds evidence bound');
  return JSON.parse(bytes);
}

export function maintainer(permission, actor) {
  assert(
    permission.user?.login === actor &&
      (permission.permission === 'admin' || permission.role_name === 'maintain'),
    'Only a current administrator/maintainer may authorize publication',
  );
}

export function publicationRequest(request, current) {
  assert.equal(request.repository, REPOSITORY, 'Wrong publication repository');
  assert.equal(
    request.event,
    'workflow_dispatch',
    'Publication requires manual authorization',
  );
  assert.equal(request.ref, 'refs/heads/main', 'Publication requires main');
  assert(
    SHA.test(request.revision) &&
      request.revision === request.workflowRevision &&
      request.revision === current,
    'Publication requires exact current main revision',
  );
  assert(
    /^[1-9][0-9]*$/u.test(request.run) && /^[1-9][0-9]*$/u.test(request.attempt),
    'Invalid publication execution identity',
  );
}

export function reviewedCi(pulls, runs, revision, repository = REPOSITORY) {
  const pull = pulls.find(
    (pr) =>
      pr.merged_at &&
      pr.merge_commit_sha === revision &&
      pr.base?.ref === 'main' &&
      pr.head?.repo?.full_name === repository,
  );
  assert(pull, 'Publication source must be a merged same-repository PR');
  const latest = runs.workflow_runs
    ?.filter((run) => run.head_sha === pull.head.sha && run.event === 'pull_request')
    .sort((a, b) => b.id - a.id || b.run_attempt - a.run_attempt)[0];
  const prefix = `FleetIQ PR ${pull.number} from ${pull.head.sha} to main at `;
  const tested = latest?.display_title?.startsWith(prefix)
    ? latest.display_title.slice(prefix.length)
    : '';
  assert(
    latest?.status === 'completed' &&
      latest.conclusion === 'success' &&
      latest.path === '.github/workflows/ci.yml' &&
      SHA.test(tested),
    'Latest authoritative PR CI did not qualify this exact checkout',
  );
  return { pull_request: pull.number, ci_run: latest.id, tested_revision: tested };
}

/** Read-only authorization runs before any registry write and again immediately before push. */
export async function authorize() {
  const request = {
    repository: process.env.GITHUB_REPOSITORY,
    event: process.env.GITHUB_EVENT_NAME,
    ref: process.env.GITHUB_REF,
    revision: process.env.FLEETIQ_SOURCE_REVISION,
    workflowRevision: process.env.GITHUB_SHA,
    run: process.env.GITHUB_RUN_ID,
    attempt: process.env.GITHUB_RUN_ATTEMPT,
    actor: process.env.GITHUB_ACTOR,
    triggeringActor: process.env.GITHUB_TRIGGERING_ACTOR ?? process.env.GITHUB_ACTOR,
  };
  publicationRequest(request, request.workflowRevision);
  for (const actor of [request.actor, request.triggeringActor])
    assert(/^[a-zA-Z0-9][a-zA-Z0-9-]{0,38}$/u.test(actor), 'Invalid publication actor');
  const [main, permission, triggerPermission, pulls] = await Promise.all([
    github(REPOSITORY, 'commits/main'),
    github(REPOSITORY, `collaborators/${request.actor}/permission`),
    github(REPOSITORY, `collaborators/${request.triggeringActor}/permission`),
    github(REPOSITORY, `commits/${request.revision}/pulls?per_page=100`),
  ]);
  publicationRequest(request, main.sha);
  maintainer(permission, request.actor);
  maintainer(triggerPermission, request.triggeringActor);
  const pull = pulls.find(
    (pr) => pr.merged_at && pr.merge_commit_sha === request.revision,
  );
  assert(pull && SHA.test(pull.head?.sha), 'No eligible merged source PR');
  const runs = await github(
    REPOSITORY,
    `actions/workflows/ci.yml/runs?event=pull_request&head_sha=${pull.head.sha}&per_page=100`,
  );
  const ci = reviewedCi(pulls, runs, request.revision);
  const tested = await github(REPOSITORY, `git/commits/${ci.tested_revision}`);
  assert.equal(tested.sha, ci.tested_revision, 'Wrong tested commit');
  assert(
    SHA.test(main.commit?.tree?.sha) && main.commit.tree.sha === tested.tree?.sha,
    'Merged source differs from passing PR CI tree',
  );
  const reviewed = await github(REPOSITORY, `pulls/${pull.number}`);
  assert(
    reviewed.merged &&
      reviewed.merge_commit_sha === request.revision &&
      reviewed.base?.ref === 'main',
    'Source review changed',
  );
  const merger = reviewed.merged_by?.login;
  assert(/^[a-zA-Z0-9][a-zA-Z0-9-]{0,38}$/u.test(merger), 'Invalid source merger');
  maintainer(await github(REPOSITORY, `collaborators/${merger}/permission`), merger);
  return {
    format: 'fleetiq-package-authorization.v1',
    ...request,
    ...ci,
    tested_tree: tested.tree.sha,
  };
}
