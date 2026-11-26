import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { checkMinimalDemoWorkers } from '../manifests/minimal-demo-workers.mjs';
import { documents } from '../manifests/render.mjs';
import { manifestTools, toolsLock } from '../manifests/toolchain.mjs';

const tools = manifestTools();
const selection = 'environments/minimal-demo/backend.json';
const image = JSON.parse(readFileSync(selection, 'utf8')).backend.reference;
const render = (operation) =>
  documents(
    tools.helm([
      'template',
      'fleetiq',
      'charts/fleetiq-minimal-demo-operations',
      '--namespace',
      'qual-fleet-apps',
      '--kube-version',
      toolsLock.kubernetes,
      '--set',
      `operation=${operation}`,
      '--set-file',
      `backend=${selection}`,
    ]),
  );

test('demo separately starts and fences the two non-serving database writers', () => {
  for (const [phase, replicas] of [
    ['workers', 1],
    ['workers-maintenance', 0],
  ]) {
    const manifests = render(phase);
    const names = ['fleetiq-ingest-tcp', 'fleetiq-replay-worker'];
    for (const kind of ['Deployment', 'ServiceAccount']) {
      assert.deepEqual(
        manifests
          .filter((item) => item.kind === kind)
          .map((item) => item.metadata.name)
          .sort(),
        names,
      );
    }
    assert.equal(manifests.length, 4);
    for (const deploy of manifests.filter(({ kind }) => kind === 'Deployment')) {
      const {
        metadata: { name, namespace },
        spec,
      } = deploy;
      const command = name.slice('fleetiq-'.length);
      const pod = spec.template.spec;
      assert.equal(namespace, 'qual-fleet-apps');
      assert.deepEqual(spec.strategy, { type: 'Recreate' });
      assert.equal(spec.replicas, replicas);
      assert.deepEqual(spec.selector.matchLabels, { 'app.kubernetes.io/name': name });
      assert.deepEqual(spec.template.metadata.labels, spec.selector.matchLabels);
      assert.equal(pod.serviceAccountName, name);
      assert.equal(pod.automountServiceAccountToken, false);
      assert.equal(pod.terminationGracePeriodSeconds, 60);
      assert.deepEqual(pod.nodeSelector, {
        'k8s-infrastructure.io/consumer': 'qual-fleet',
        'k8s-infrastructure.io/role': 'worker',
      });
      assert.equal(pod.initContainers, undefined);
      assert.equal(pod.containers.length, 1);
      const [container] = pod.containers;
      assert.equal(container.image, image);
      assert.equal(container.imagePullPolicy, 'Never');
      assert.deepEqual(container.command, ['/usr/local/bin/fleetiq-server']);
      assert.deepEqual(container.args, [command]);
      assert.deepEqual(container.resources, {
        requests: { cpu: '100m', memory: '256Mi' },
        limits: { cpu: '1', memory: '512Mi' },
      });
      assert.deepEqual(container.env[0], {
        name: 'DATABASE_URL',
        valueFrom: { secretKeyRef: { name: `fleetiq-db-${command}-url`, key: 'url' } },
      });
      assert.equal(container.startupProbe, undefined);
      assert.equal(container.readinessProbe, undefined);
      assert.equal(container.livenessProbe, undefined);
      assert.equal(pod.volumes[0].configMap.name, 'workload-database-ca');
      assert.deepEqual(container.volumeMounts[0], {
        name: 'database-ca',
        mountPath: '/etc/fleetiq/database',
        readOnly: true,
      });
      if (command === 'ingest-tcp') {
        assert.deepEqual(container.env[1], {
          name: 'FLEETIQ_TCP_BIND_ADDRESS',
          valueFrom: {
            configMapKeyRef: {
              name: 'fleetiq-ingest-tcp-network',
              key: 'FLEETIQ_TCP_BIND_ADDRESS',
            },
          },
        });
        assert.deepEqual(container.env[2], {
          name: 'FLEETIQ_TCP_IDENTITY_POLICY',
          value: 'registered-identifiers',
        });
        assert.deepEqual(
          container.env.slice(3).map(({ name, valueFrom }) => {
            assert.equal(valueFrom.configMapKeyRef.name, 'fleetiq-ingest-tcp-route');
            assert.equal(valueFrom.configMapKeyRef.key, name);
            assert.equal(
              Boolean(valueFrom.configMapKeyRef.optional),
              name === 'FLEETIQ_TCP_IDENTIFIER_AUTHORITY',
            );
            return name;
          }),
          [
            'FLEETIQ_TCP_TENANT_ID',
            'FLEETIQ_TCP_CHANNEL_ID',
            'FLEETIQ_TCP_PACKAGE_ID',
            'FLEETIQ_TCP_PACKAGE_VERSION',
            'FLEETIQ_TCP_IDENTIFIER_AUTHORITY',
          ],
        );
      } else {
        assert.equal(container.ports, undefined);
        assert.equal(container.env.length, 1);
      }
    }
  }
});

test('qualification checks both native manifest states and refuses a writer in maintenance', () => {
  assert.deepEqual(checkMinimalDemoWorkers(tools, 'qual-fleet'), {
    runtimeSchemas: 4,
    maintenanceSchemas: 4,
  });
  const activeWriter = {
    ...tools,
    helm(args) {
      const effectiveArgs = args.map((arg) =>
        arg === 'operation=workers-maintenance' ? 'operation=workers' : arg,
      );
      return tools.helm(effectiveArgs);
    },
  };
  assert.throws(
    () => checkMinimalDemoWorkers(activeWriter, 'qual-fleet'),
    /maintenance/u,
  );
});

test('worker qualification rejects alternate database startup and trust inputs', () => {
  for (const [description, mutate] of [
    [
      'command',
      (pod) => {
        pod.containers[0].command = ['/bin/alternate'];
      },
    ],
    [
      'Secret',
      (pod) => {
        pod.containers[0].env[0].valueFrom.secretKeyRef.name = 'fleetiq-db-serve-url';
      },
    ],
    [
      'extra env',
      (pod) => {
        pod.containers[0].env.push({ name: 'PGSSLMODE', value: 'disable' });
      },
    ],
    [
      'envFrom',
      (pod) => {
        pod.containers[0].envFrom = [{ secretRef: { name: 'alternate-env' } }];
      },
    ],
    [
      'CA key',
      (pod) => {
        pod.volumes[0].configMap.items[0].key = 'wrong.crt';
      },
    ],
    [
      'CA path',
      (pod) => {
        pod.volumes[0].configMap.items[0].path = 'wrong.crt';
      },
    ],
    [
      'CA mount',
      (pod) => {
        pod.containers[0].volumeMounts[0].readOnly = false;
      },
    ],
  ]) {
    const weakened = {
      ...tools,
      helm(args) {
        const rendered = documents(tools.helm(args));
        for (const { spec } of rendered.filter(({ kind }) => kind === 'Deployment'))
          mutate(spec.template.spec);
        return rendered.map((resource) => JSON.stringify(resource)).join('\n---\n');
      },
    };
    assert.throws(
      () => checkMinimalDemoWorkers(weakened, 'qual-fleet'),
      {
        name: 'AssertionError',
      },
      description,
    );
  }
});
