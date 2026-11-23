import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stringify } from 'yaml';
import { minimalDemoProbeFixtures } from './minimal-demo-fixtures.mjs';
import {
  assertMinimalDemoResources,
  demoProbePhases,
  minimalDemoResources,
} from './minimal-demo-network.mjs';
import { documents, validateSchemas } from './render.mjs';
import { manifestTools } from './toolchain.mjs';

export function renderMinimalDemo(tools, selection) {
  const desired = minimalDemoResources(selection);
  const directory = mkdtempSync(join(tmpdir(), 'fleetiq-minimal-network-'));
  try {
    // Kustomize composes two local documents. Namespace and policy references remain explicit.
    const namespaceFile = 'namespaces.yaml';
    const networkFile = 'network.yaml';
    for (const [name, resources] of [
      [namespaceFile, desired.filter(({ kind }) => kind === 'Namespace')],
      [networkFile, desired.filter(({ kind }) => kind !== 'Namespace')],
    ])
      writeFileSync(
        join(directory, name),
        resources.map((resource) => stringify(resource)).join('---\n'),
      );
    writeFileSync(
      join(directory, 'kustomization.yaml'),
      stringify({
        apiVersion: 'kustomize.config.k8s.io/v1beta1',
        kind: 'Kustomization',
        resources: [namespaceFile, networkFile],
      }),
    );
    const resources = documents(tools.kustomize(['build', directory]));
    assertMinimalDemoResources(resources, selection);
    validateSchemas(tools, resources);
    return resources;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

export function checkMinimalDemo(tools) {
  const selection = {
    consumer: 'fleetiq',
    simulatorAttempt: 'demo-launch-0123456789abcdef01234567',
    issuerAddress: '10.254.0.4',
  };
  const resources = renderMinimalDemo(tools, selection);
  const fixtureImage = `registry.invalid/probe@sha256:${'0'.repeat(64)}`;
  const fixtureSchemas = Object.fromEntries(
    demoProbePhases.map((phase) => [
      phase,
      validateSchemas(tools, minimalDemoProbeFixtures(selection, phase, fixtureImage)),
    ]),
  );
  return {
    resources: resources.length,
    schemas: resources.length,
    fixtureSchemas,
    execution: 'not-performed',
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [, , selectionPath, phase, image, ...extra] = process.argv;
    assert(
      selectionPath && !extra.length && Boolean(phase) === Boolean(image),
      'Select a private network input and, optionally, the qualification phase and immutable probe image',
    );
    const selection = JSON.parse(readFileSync(selectionPath, 'utf8'));
    const tools = manifestTools();
    const items = phase
      ? minimalDemoProbeFixtures(selection, phase, image)
      : renderMinimalDemo(tools, selection);
    if (phase) validateSchemas(tools, items);
    console.log(JSON.stringify({ apiVersion: 'v1', kind: 'List', items }, null, 2));
  } catch {
    console.error(
      'Minimal-demo network render failed: verify the private selection and pinned manifest tools.',
    );
    process.exitCode = 1;
  }
}
