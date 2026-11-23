import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const contractUrl = new URL(
  '../../contracts/postgresql/runtime-grants.v1.json',
  import.meta.url,
);
const contractBytes = readFileSync(contractUrl);
export const contractDigest = createHash('sha256').update(contractBytes).digest('hex');
const { commands } = JSON.parse(contractBytes);

export function databaseIdentities(workloads) {
  assert(
    Array.isArray(workloads) && workloads.length > 0,
    'Select installed workloads',
  );
  assert.equal(new Set(workloads).size, workloads.length, 'Duplicate workload');
  return workloads.map((command) => {
    assert(
      Object.hasOwn(commands, command) && !command.startsWith('bootstrap-'),
      'Unknown runtime workload',
    );
    const suffix = command.split(' ')[0];
    const name = 'fleetiq_' + suffix.replaceAll('-', '_');
    const passwordSecret = 'fleetiq-db-' + suffix;
    return { command, name, passwordSecret, urlSecret: passwordSecret + '-url' };
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const identities = databaseIdentities(process.argv.slice(2));
  const managedRoles = identities.map(({ name, passwordSecret }) => ({
    name,
    ensure: 'present',
    login: true,
    inherit: false,
    superuser: false,
    createdb: false,
    createrole: false,
    replication: false,
    bypassrls: false,
    inRoles: [],
    passwordSecret: { name: passwordSecret },
  }));
  console.log(JSON.stringify({ contractDigest, identities, managedRoles }, null, 2));
}
