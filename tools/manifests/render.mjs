import assert from 'node:assert/strict';
import {
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { parseAllDocuments, stringify } from 'yaml';
import { root } from '../process.mjs';
import { toolsLock } from './toolchain.mjs';

export function documents(bytes) {
  const parsed = parseAllDocuments(bytes, { uniqueKeys: true });
  assert(
    parsed.every((document) => document.errors.length === 0),
    'Invalid or duplicate YAML fields',
  );
  return parsed.map((document) => document.toJS()).filter(Boolean);
}

/** Real Helm and Kustomize run without cluster access, plugins or remote bases. */
export function renderFixture(
  tools,
  { maintenance = false, nonlocal = false, runtime = {}, data = {}, lint = false } = {},
) {
  // Kustomize supports remote bases by default; this preview deliberately does not.
  const [composition] = documents(
    readFileSync(
      resolve(root, 'environments/local-preview/kustomization.yaml'),
      'utf8',
    ),
  );
  assert.deepEqual(
    composition,
    {
      apiVersion: 'kustomize.config.k8s.io/v1beta1',
      kind: 'Kustomization',
      resources: ['namespaces.yaml', 'quotas.yaml'],
    },
    'Only reviewed local composition inputs are allowed',
  );
  const parent = realpathSync(tmpdir());
  const temporary = mkdtempSync(join(parent, 'fleetiq-manifest-render-'));
  try {
    const result = documents(
      tools.kustomize(['build', resolve(root, 'environments/local-preview')]),
    );
    for (const [chart, namespace, override] of [
      ['runtime', 'fleetiq-local', { maintenance, ...runtime }],
      ['data', 'fleetiq-data', data],
    ]) {
      const values = join(temporary, `${chart}.json`);
      writeFileSync(values, JSON.stringify(override));
      const args = [
        resolve(root, `charts/fleetiq-${chart}`),
        '--namespace',
        namespace,
        '--kube-version',
        toolsLock.kubernetes,
        '--values',
        resolve(root, `environments/local-preview/${chart}.yaml`),
        '--values',
        values,
      ];
      if (nonlocal)
        args.push(
          '--set',
          'profile=nonlocal',
          '--set',
          chart === 'runtime' ? 'backend.replicas=2,edge.replicas=2' : 'instances=3',
        );
      if (lint) tools.helm(['lint', '--strict', ...args]);
      result.push(...documents(tools.helm(['template', 'fleetiq', ...args])));
    }
    return result;
  } finally {
    assert.equal(dirname(realpathSync(temporary)), parent, 'Unsafe renderer cleanup');
    rmSync(temporary, { recursive: true, force: true });
  }
}

/** Only pinned local schemas are supplied: missing kinds fail, never skip/download. */
export function validateSchemas(tools, resources) {
  const parent = realpathSync(tmpdir());
  const directory = mkdtempSync(join(parent, 'fleetiq-manifest-schema-'));
  try {
    const file = join(directory, 'rendered.yaml');
    writeFileSync(file, resources.map((resource) => stringify(resource)).join('---\n'));
    const result = JSON.parse(
      tools.kubeconform([
        '-strict',
        '-summary',
        '-output',
        'json',
        '-kubernetes-version',
        toolsLock.kubernetes,
        '-schema-location',
        tools.schemaLocation,
        file,
      ]),
    );
    assert.equal(
      result.summary.valid,
      resources.length,
      'Every rendered resource requires a schema',
    );
    assert.equal(
      result.summary.invalid + result.summary.errors + result.summary.skipped,
      0,
      'Invalid or skipped resource schema',
    );
    return result.summary.valid;
  } finally {
    assert.equal(dirname(realpathSync(directory)), parent, 'Unsafe schema cleanup');
    rmSync(directory, { recursive: true, force: true });
  }
}
