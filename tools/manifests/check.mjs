import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkBootstrap } from './bootstrap.mjs';
import { manifestPolicy } from './policy.mjs';
import { fixtureStates, renderFixture, validateSchemas } from './render.mjs';
import { manifestTools, toolsLock } from './toolchain.mjs';

/** All registered positive states must validate with real tools and local schemas. */
export function checkManifests() {
  const tools = manifestTools();
  const bootstrap = checkBootstrap(tools);
  const measurements = [];
  for (const state of [
    ...fixtureStates,
    { analytics: true, maintenance: false, nonlocal: false },
    { analytics: true, maintenance: true, nonlocal: false },
    { analytics: true, maintenance: false, nonlocal: true },
  ]) {
    const rendered = renderFixture(tools, { ...state, lint: true });
    const schemas = validateSchemas(tools, rendered);
    manifestPolicy(rendered, state);
    measurements.push({ ...state, resources: rendered.length, schemas });
  }
  return {
    kubernetes: toolsLock.kubernetes,
    bootstrap,
    tools: Object.fromEntries(
      Object.entries(toolsLock.tools).map(([name, tool]) => [name, tool.version]),
    ),
    states: measurements,
    activation: 'not-performed',
  };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    console.log(JSON.stringify(checkManifests(), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
