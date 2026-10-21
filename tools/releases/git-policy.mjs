import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { documents } from '../manifests/render.mjs';
import { root, run } from '../process.mjs';
import { contract } from './contracts.mjs';

/** Candidate PRs cannot activate anything, including through a new Argo source. */
export function releaseBoundary(files, changed) {
  for (const file of changed)
    assert(
      !file.startsWith('releases/active/'),
      'Candidate changes cannot write active environment selections',
    );
  for (const [file, text] of files) {
    if (file.startsWith('releases/candidates/') && file.endsWith('.json'))
      contract('candidate', JSON.parse(text));
    if (!/\.ya?ml$/u.test(file)) continue;
    if (file.startsWith('charts/') && file.includes('/templates/')) {
      assert(
        !/\bapiVersion:\s*['"]?argoproj\.io\//u.test(text),
        'Argo resources are not allowed in workload charts',
      );
      continue;
    }
    for (const resource of documents(text))
      assert(
        !(
          typeof resource === 'object' &&
          resource.apiVersion?.startsWith('argoproj.io/') &&
          ['Application', 'ApplicationSet'].includes(resource.kind)
        ),
        'Argo source graphs require D06 registered protected activation refs; candidate/main tracking is forbidden',
      );
  }
}

/** Resolve a fetched base once; detached publishers need no local main branch. */
export function checkReleaseBoundaries(
  base = process.env.FLEETIQ_BASE_SHA,
  repository = root,
) {
  const options = { cwd: repository };
  const comparison = base || 'refs/remotes/origin/main';
  assert(
    /^(?:[a-f0-9]{40}|main|refs\/remotes\/origin\/main)$/u.test(comparison),
    'Untrusted release comparison revision',
  );
  let revision;
  try {
    revision = run('git', ['rev-parse', '--verify', `${comparison}^{commit}`], options);
    assert.match(revision, /^[a-f0-9]{40}$/u);
    run('git', ['merge-base', '--is-ancestor', revision, 'HEAD'], options);
  } catch {
    throw new Error(
      'Release boundary requires a fetched origin/main or an explicit trusted ancestor commit; fetch origin/main or provide FLEETIQ_BASE_SHA',
    );
  }
  const names = run(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    options,
  )
    .split('\0')
    .filter(Boolean);
  const changed = new Set([
    ...run(
      'git',
      ['diff', '--name-only', '--no-renames', '-z', revision],
      options,
    ).split('\0'),
    ...run('git', ['ls-files', '--others', '--exclude-standard', '-z'], options).split(
      '\0',
    ),
  ]);
  const files = names
    .filter((file) => /\.(?:json|ya?ml)$/u.test(file))
    .map((file) => [file, readFileSync(resolve(repository, file), 'utf8')]);
  releaseBoundary(files, changed);
  return { activation: 'not-performed', candidateMergeActivates: false };
}
