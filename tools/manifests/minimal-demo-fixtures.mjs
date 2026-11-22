import assert from 'node:assert/strict';
import {
  application,
  attemptLabel,
  consumerLabel,
  demoNamespaces,
  demoProbeRoles,
  demoServiceRoutes,
  minimalDemoResources,
  simulatorAccount,
} from './minimal-demo-network.mjs';

export const fixtureLabel = { 'app.kubernetes.io/part-of': 'fleetiq-network-probe' };
export const foreignNamespace = (consumer) => `${consumer}-network-probe-foreign`;
const portName = 'probe';
const listener = `import socket, sys
with socket.socket() as server:
    server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    server.bind(('0.0.0.0', int(sys.argv[1])))
    server.listen(8)
    while True:
        conn, _ = server.accept()
        conn.close()`;

export function minimalDemoProbeFixtures(selection, phase, image) {
  minimalDemoResources(selection);
  assert(
    typeof image === 'string' && /^[a-zA-Z0-9/_.:-]+@sha256:[a-f0-9]{64}$/u.test(image),
    'Review and stage a Python image by immutable digest',
  );
  const spaces = demoNamespaces(selection.consumer);
  const foreign = foreignNamespace(selection.consumer);
  const account = simulatorAccount(selection.simulatorAttempt);
  function pod({
    role,
    labels,
    namespace = spaces.apps,
    serviceAccountName = 'default',
    port,
  }) {
    return {
      apiVersion: 'v1',
      kind: 'Pod',
      metadata: {
        name: `network-probe-${role}`,
        namespace,
        labels: { ...fixtureLabel, ...labels },
      },
      spec: {
        automountServiceAccountToken: false,
        serviceAccountName,
        dnsPolicy: 'ClusterFirst',
        enableServiceLinks: false,
        restartPolicy: 'Never',
        activeDeadlineSeconds: 600,
        terminationGracePeriodSeconds: 1,
        nodeSelector: {
          [consumerLabel]: selection.consumer,
          'k8s-infrastructure.io/role': 'worker',
        },
        securityContext: {
          runAsNonRoot: true,
          runAsUser: 65532,
          runAsGroup: 65532,
          seccompProfile: { type: 'RuntimeDefault' },
        },
        containers: [
          {
            name: 'probe',
            image,
            imagePullPolicy: 'Never',
            command: [
              'python',
              '-I',
              '-B',
              '-c',
              ...(port ? [listener, String(port)] : ['import time; time.sleep(600)']),
            ],
            securityContext: {
              allowPrivilegeEscalation: false,
              readOnlyRootFilesystem: true,
              capabilities: { drop: ['ALL'] },
            },
            resources: {
              requests: { cpu: '5m', memory: '16Mi' },
              limits: { cpu: '100m', memory: '32Mi' },
            },
            ...(port
              ? {
                  ports: [{ name: portName, containerPort: port }],
                  readinessProbe: {
                    tcpSocket: { port: portName },
                    periodSeconds: 2,
                    timeoutSeconds: 1,
                  },
                }
              : {}),
          },
        ],
      },
    };
  }
  const routes = demoServiceRoutes(spaces);
  const assignments = new Map([
    ['ingest-tcp', routes.ingestion],
    ['backend', routes.backend],
    ['alertmanager', routes.alertmanager],
    ['database', routes.database],
    ['receiver', routes.receiver],
    ['object-store', routes.objectStore],
  ]);
  const pods = demoProbeRoles(phase).map((role) => {
    if (['simulator', 'other', 'foreign'].includes(role))
      return pod({
        role,
        labels: { [attemptLabel]: selection.simulatorAttempt },
        namespace: role === 'foreign' ? foreign : spaces.apps,
        serviceAccountName: role === 'other' ? 'default' : account,
      });
    return pod({
      role,
      labels: application(role),
      port: assignments.get(role)?.podPort,
    });
  });
  const extraListeners =
    phase === 'ingestion' ? ['ingest-tcp'] : ['database', 'receiver', 'object-store'];
  for (const role of extraListeners) {
    const route = assignments.get(role);
    pods.push(
      pod({
        role,
        labels: route.labels,
        namespace: route.namespace,
        port: route.podPort,
      }),
    );
  }
  return [
    {
      apiVersion: 'v1',
      kind: 'Namespace',
      metadata: {
        name: foreign,
        labels: {
          ...fixtureLabel,
          'pod-security.kubernetes.io/enforce': 'restricted',
          'pod-security.kubernetes.io/enforce-version': 'v1.35',
        },
      },
    },
    {
      apiVersion: 'v1',
      kind: 'ServiceAccount',
      metadata: { name: account, namespace: foreign, labels: fixtureLabel },
      automountServiceAccountToken: false,
    },
    ...pods,
    ...(phase === 'ingestion'
      ? []
      : Object.entries(routes)
          .filter(([role]) => role !== 'ingestion')
          .map(([, route]) => ({
            apiVersion: 'v1',
            kind: 'Service',
            metadata: {
              name: route.name,
              namespace: route.namespace,
              labels: fixtureLabel,
            },
            spec: {
              type: 'ClusterIP',
              ipFamilyPolicy: 'SingleStack',
              ipFamilies: ['IPv4'],
              selector: { ...route.labels, ...fixtureLabel },
              ports: [
                {
                  name: 'tcp',
                  protocol: 'TCP',
                  port: route.servicePort,
                  targetPort: route.podPort,
                },
              ],
            },
          }))),
  ];
}
