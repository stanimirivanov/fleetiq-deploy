import assert from 'node:assert/strict';
import { isIP } from 'node:net';
import { lock } from '../policy.mjs';
import { budgetPolicy } from './budget-policy.mjs';
import { resources as resourceLimits } from './resource-policy.mjs';

const components = ['analytics-worker', 'notification-worker', 'alertmanager'];
const peer = (name) => ({
  podSelector: { matchLabels: { 'app.kubernetes.io/name': `fleetiq-${name}` } },
});
const ports = (port) => [{ protocol: 'TCP', port }];

/** Validate optional package output before the unchanged base composition policy. */
export function analyticsPolicy(items, context) {
  const namespace = context.applicationNamespace ?? 'fleetiq-local';
  const receiverCidrs = context.receiverCidrs ?? ['192.0.2.10/32'];
  assert(receiverCidrs.length > 0 && receiverCidrs.length <= 16);
  for (const cidr of receiverCidrs) {
    const [address, prefix, extra] = cidr.split('/');
    assert(
      isIP(address) === 4 && !extra && /^(1[6-9]|2[0-9]|3[0-2])$/u.test(prefix),
      'Receiver egress must be a bounded IPv4 CIDR',
    );
  }
  const owned = items.filter(
    (item) =>
      components.some((name) => item.metadata.name === `fleetiq-${name}`) ||
      item.metadata.name === 'fleetiq-db-analytics',
  );
  assert.equal(owned.length, 11, 'Missing/duplicate analytics resource');
  const backend = items.find(
    (item) => item.kind === 'Deployment' && item.metadata.name === 'fleetiq-backend',
  ).spec.template.spec;
  const baseNetwork = items.find(
    (item) => item.kind === 'NetworkPolicy' && item.metadata.name === 'fleetiq-backend',
  ).spec;
  const dns = baseNetwork.egress[1];
  const database = baseNetwork.egress[0];
  const expected = [];
  for (const name of components) {
    for (const kind of ['ServiceAccount', 'Deployment', 'NetworkPolicy'])
      expected.push(`${kind}|${namespace}|fleetiq-${name}`);
    const deployment = owned.find(
      (item) => item.kind === 'Deployment' && item.metadata.name === `fleetiq-${name}`,
    );
    assert(!deployment.metadata.annotations?.['helm.sh/hook']);
    assert.equal(deployment.spec.replicas, context.maintenance ? 0 : 1);
    assert.deepEqual(deployment.spec.strategy, {
      type: 'RollingUpdate',
      rollingUpdate: { maxUnavailable: 0, maxSurge: 1 },
    });
    const pod = deployment.spec.template.spec;
    assert.equal(pod.automountServiceAccountToken, false);
    assert.equal(pod.serviceAccountName, `fleetiq-${name}`);
    assert.equal(pod.terminationGracePeriodSeconds, 60);
    assert(
      !pod.hostNetwork &&
        !pod.hostPID &&
        !pod.hostIPC &&
        !pod.initContainers &&
        !pod.ephemeralContainers,
    );
    assert.deepEqual(pod.securityContext, backend.securityContext);
    assert.deepEqual(pod.imagePullSecrets, backend.imagePullSecrets);
    assert.equal(pod.containers.length, 1);
    const container = pod.containers[0];
    assert.equal(container.name, name);
    assert(!container.command && !container.envFrom && !container.lifecycle);
    assert.deepEqual(container.securityContext, backend.containers[0].securityContext);
    resourceLimits(container.resources);
    if (name === 'alertmanager') {
      assert.equal(container.image, lock.images.alertmanager);
      assert(!container.env);
      assert.deepEqual(container.args, [
        '--config.file=/etc/alertmanager/alertmanager.yml',
        '--storage.path=/alertmanager',
        '--cluster.listen-address=',
        '--web.listen-address=0.0.0.0:9093',
      ]);
      assert.deepEqual(container.ports, [
        { name: 'router', containerPort: 9093, protocol: 'TCP' },
      ]);
      for (const kind of ['startupProbe', 'readinessProbe', 'livenessProbe']) {
        assert.deepEqual(container[kind].httpGet, {
          path: kind === 'livenessProbe' ? '/-/healthy' : '/-/ready',
          port: 'router',
        });
        assert.equal(container[kind].timeoutSeconds, 3);
      }
      assert.deepEqual(pod.volumes, [
        {
          name: 'configuration',
          secret: {
            secretName: context.routerSecret ?? 'fleet-alertmanager',
            defaultMode: 288,
          },
        },
        { name: 'router-data', emptyDir: { sizeLimit: '128Mi' } },
      ]);
      assert.deepEqual(container.volumeMounts, [
        { name: 'configuration', mountPath: '/etc/alertmanager', readOnly: true },
        { name: 'router-data', mountPath: '/alertmanager' },
      ]);
    } else {
      assert.equal(container.image, backend.containers[0].image);
      assert.deepEqual(container.args, [name]);
      assert(
        !container.ports &&
          !container.startupProbe &&
          !container.readinessProbe &&
          !container.livenessProbe,
        'No invented worker HTTP health',
      );
      assert.deepEqual(container.env, [
        backend.containers[0].env.find((entry) => entry.name === 'DATABASE_URL'),
        ...(name === 'notification-worker'
          ? [
              {
                name: 'FLEETIQ_ALERTMANAGER_URL',
                value: 'http://fleetiq-alertmanager:9093/api/v2/alerts',
              },
            ]
          : []),
      ]);
      assert.deepEqual(pod.volumes, [
        backend.volumes.find((volume) => volume.name === 'database-trust'),
        backend.volumes.find((volume) => volume.name === 'tmp'),
      ]);
      assert.deepEqual(container.volumeMounts, [
        { name: 'database-trust', mountPath: '/etc/fleetiq/database', readOnly: true },
        { name: 'tmp', mountPath: '/tmp' },
      ]);
    }
    const account = owned.find(
      (item) =>
        item.kind === 'ServiceAccount' && item.metadata.name === `fleetiq-${name}`,
    );
    assert.equal(account.automountServiceAccountToken, false);
    const network = owned.find(
      (item) =>
        item.kind === 'NetworkPolicy' && item.metadata.name === `fleetiq-${name}`,
    ).spec;
    assert.deepEqual(network, {
      podSelector: peer(name).podSelector,
      policyTypes: ['Ingress', 'Egress'],
      ingress:
        name === 'alertmanager'
          ? [{ from: [peer('notification-worker')], ports: ports(9093) }]
          : [],
      egress: [
        dns,
        ...(name === 'alertmanager'
          ? [
              {
                to: receiverCidrs.map((cidr) => ({
                  ipBlock: { cidr },
                })),
                ports: ports(443),
              },
            ]
          : [database]),
        ...(name === 'notification-worker'
          ? [{ to: [peer('alertmanager')], ports: ports(9093) }]
          : []),
      ],
    });
  }
  expected.push(
    `Service|${namespace}|fleetiq-alertmanager`,
    'NetworkPolicy|fleetiq-data|fleetiq-db-analytics',
  );
  assert.deepEqual(
    owned
      .map((item) => `${item.kind}|${item.metadata.namespace}|${item.metadata.name}`)
      .sort(),
    expected.sort(),
  );
  const service = owned.find((item) => item.kind === 'Service');
  assert.deepEqual(service.spec, {
    type: 'ClusterIP',
    selector: peer('alertmanager').podSelector.matchLabels,
    ports: [{ name: 'router', port: 9093, targetPort: 'router', protocol: 'TCP' }],
  });
  assert.deepEqual(
    owned.find((item) => item.metadata.name === 'fleetiq-db-analytics').spec,
    {
      podSelector: database.to[0].podSelector,
      policyTypes: ['Ingress', 'Egress'],
      egress: [],
      ingress: [
        {
          from: components.slice(0, 2).map((name) => ({
            namespaceSelector: {
              matchLabels: { 'kubernetes.io/metadata.name': namespace },
            },
            ...peer(name),
          })),
          ports: ports(5432),
        },
      ],
    },
  );
  budgetPolicy(items, namespace);
  return items.filter((item) => !owned.includes(item));
}
