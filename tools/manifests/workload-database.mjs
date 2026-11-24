import assert from 'node:assert/strict';

export const bootstrap = 'bootstrap-platform-operator --check-schema';
export const runtimeCommands = [
  'serve --check-schema',
  'ingest-tcp',
  'replay-worker',
  'semantic-worker',
  'project-current',
  'analytics-worker',
  'notification-worker',
  'archive-worker',
];

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
