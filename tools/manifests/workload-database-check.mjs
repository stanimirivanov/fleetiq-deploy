import assert from 'node:assert/strict';
import { manifestPolicy } from './policy.mjs';
import { renderFixture, validateSchemas } from './render.mjs';
import { runtimeCommands } from './workload-database.mjs';

export function checkWorkloadDatabase(tools) {
  const workloads = ['serve --check-schema', 'ingest-tcp', 'replay-worker'];
  const phases = [
    { maintenance: true, migrationLogin: true },
    { maintenance: true, bootstrapLogin: true },
    { maintenance: true },
    { retireLegacy: true },
  ];
  const render = (workloadDatabase, analytics = false) => {
    const context = {
      analytics,
      maintenance: Boolean(workloadDatabase.maintenance),
      nonlocal: false,
      workloadDatabase,
    };
    const resources = renderFixture(tools, {
      ...context,
      runtime: { workloadDatabase: { workloads: workloadDatabase.workloads } },
      data: { workloadDatabase },
      lint: true,
    });
    validateSchemas(tools, resources);
    manifestPolicy(resources, context);
    return { resources, context };
  };
  for (const phase of phases) render({ workloads, ...phase });
  const { resources, context } = render(
    { workloads: runtimeCommands, retireLegacy: true },
    true,
  );
  const replay = resources.find(
    ({ kind, spec }) =>
      kind === 'DatabaseRole' && spec.name === 'fleetiq_replay_worker',
  );
  replay.spec.createdb = true;
  assert.throws(
    () => manifestPolicy(resources, context),
    /DatabaseRole fleetiq_replay_worker/u,
  );
  assert.throws(() => render({ workloads }, true), /helm (?:lint|template)/u);
  assert.throws(
    () =>
      render({
        workloads,
        maintenance: true,
        migrationLogin: true,
        bootstrapLogin: true,
      }),
    /helm (?:lint|template)/u,
  );
  return { selected: workloads.length, phases: phases.length };
}
