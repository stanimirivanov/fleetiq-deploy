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
export const { commands } = JSON.parse(contractBytes);
export const bootstrap = 'bootstrap-platform-operator --check-schema';
export const runtimeCommands = Object.keys(commands).filter(
  (command) => command !== bootstrap,
);

export function databaseRole(command) {
  return `fleetiq_${command.split(' ')[0].replaceAll('-', '_')}`;
}

export function databaseIdentities(workloads) {
  assert(
    Array.isArray(workloads) && workloads.length > 0,
    'Select installed workloads',
  );
  assert.equal(new Set(workloads).size, workloads.length, 'Duplicate workload');
  return workloads.map((command) => {
    assert(runtimeCommands.includes(command), 'Unknown runtime workload');
    const suffix = command.split(' ')[0];
    const name = databaseRole(command);
    const passwordSecret = `fleetiq-db-${suffix}`;
    return { command, name, passwordSecret, urlSecret: `${passwordSecret}-url` };
  });
}

export function workloadDatabaseEnv(workloads, command) {
  const identity = databaseIdentities(workloads).find(
    (item) => item.command === command,
  );
  assert(identity, 'Packaged workload requires a selected database identity');
  return {
    name: 'DATABASE_URL',
    valueFrom: { secretKeyRef: { name: identity.urlSecret, key: 'url' } },
  };
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
  console.log(
    JSON.stringify(
      {
        contractDigest,
        workloadDatabase: { workloads: identities.map(({ command }) => command) },
        identities,
        managedRoles,
      },
      null,
      2,
    ),
  );
}
