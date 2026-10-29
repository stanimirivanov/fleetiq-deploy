import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { checkManifests } from './manifests/check.mjs';
import { digest, lock } from './policy.mjs';
import { pnpm, root, run } from './process.mjs';
import { qualifyProduct } from './product/qualify.mjs';
import { qualify } from './qualify.mjs';
import { checkContracts } from './releases/contracts.mjs';
import { checkReleaseBoundaries } from './releases/git-policy.mjs';
import { qualifyPackages } from './releases/qualify.mjs';
import { checkSecrets } from './secrets.mjs';
import { structure } from './structure.mjs';
import { catalogue } from './verification-catalogue.mjs';

const group = process.argv[2] ?? 'structural';
const base = process.env.FLEETIQ_BASE_SHA || undefined;

const evidence = {
  schemaVersion: 1,
  group,
  started: new Date().toISOString(),
  outcome: 'not-run',
  checks: [],
};
function fingerprint() {
  const paths = run('git', [
    'ls-files',
    '--cached',
    '--others',
    '--exclude-standard',
    '-z',
  ])
    .split('\0')
    .filter(Boolean)
    .sort();
  return digest(
    run('git', ['rev-parse', 'HEAD']) +
      run('git', ['ls-files', '--stage', '-z']) +
      paths
        .map((path) => `${path}\0${digest(readFileSync(resolve(root, path)))}`)
        .join('\n'),
  );
}
try {
  if (!(group in catalogue)) throw new Error('Unknown verification group');
  evidence.head = run('git', ['rev-parse', 'HEAD']);
  evidence.sourceBefore = fingerprint();
  for (const check of catalogue[group]) {
    const item = { name: check, outcome: 'not-run' };
    evidence.checks.push(item);
    try {
      if (check === 'toolchain') {
        if (
          process.version !== `v${lock.tools.node}` ||
          pnpm(['--version']) !== lock.tools.pnpm
        )
          throw new Error('Pinned Node/pnpm required');
      } else if (check === 'harness-tests')
        pnpm(['test'], { stdio: 'inherit', timeout: 600000 });
      else if (check === 'style') pnpm(['style'], { stdio: 'inherit' });
      else if (check === 'policy') structure();
      else if (check === 'manifests') item.measurements = checkManifests();
      else if (check === 'release-contracts')
        item.measurements = { ...checkContracts(), ...checkReleaseBoundaries(base) };
      else if (check === 'oci-packages') item.measurements = await qualifyPackages();
      else if (check === 'secrets') checkSecrets(base);
      else if (check === 'dependencies')
        pnpm(['audit', '--audit-level', 'moderate'], { stdio: 'inherit' });
      else if (check === 'installed-product')
        item.measurements = await qualifyProduct((progress) => {
          item.measurements = progress;
        });
      else if (check === 'installation')
        item.measurements = await qualify((progress) => {
          item.measurements = progress;
        });
      else throw new Error('Unknown inventoried check; verification cannot pass');
      item.outcome = 'passed';
      console.log(`${check}: passed`);
    } catch (error) {
      item.outcome = 'failed';
      throw error;
    }
  }
  evidence.sourceAfter = fingerprint();
  if (evidence.sourceBefore !== evidence.sourceAfter)
    throw new Error('Source changed during verification');
  evidence.outcome = 'passed';
} catch (error) {
  evidence.outcome = 'incomplete';
  console.error(error.message);
  console.error('Verification incomplete; no acceptance pass.');
  process.exitCode = 1;
} finally {
  evidence.finished = new Date().toISOString();
  mkdirSync(resolve(root, '.verification'), { recursive: true });
  const file = `.verification/${group}-${randomUUID()}.json`;
  writeFileSync(resolve(root, file), `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(`Verification evidence: ${file}`);
}
