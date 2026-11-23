import assert from 'node:assert/strict';
import {
  application,
  attemptLabel,
  cnpgControlPort,
  consumerLabel,
  demoNamespaces,
  demoProbeRoles,
  demoProbeRoutes,
  demoServiceRoutes,
  foreignProbePort,
  minimalDemoResources,
  simulatorAccount,
} from './minimal-demo-network.mjs';

export const fixtureLabel = { 'app.kubernetes.io/part-of': 'fleetiq-network-probe' };
export const foreignNamespace = (consumer) => `${consumer}-network-probe-foreign`;
const portName = 'probe';
const databasePrimary = { 'app.kubernetes.io/component': 'network-probe-primary' };
const listener = `import select, socket, sys
listeners = []
for port in sys.argv[1:]:
    server = socket.socket()
    server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    server.bind(('0.0.0.0', int(port)))
    server.listen(8)
    listeners.append(server)
while True:
    for server in select.select(listeners, [], [])[0]:
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
    ports = [],
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
              ...(ports.length
                ? [listener, ...ports.map(String)]
                : ['import time; time.sleep(600)']),
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
            ...(ports.length
              ? {
                  ports: ports.map((containerPort, index) => ({
                    name: index === 0 ? portName : `${portName}-${index}`,
                    containerPort,
                  })),
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
  function listenerPod(role, route, ports = [route.podPort]) {
    return pod({ role, labels: route.labels, namespace: route.namespace, ports });
  }
  const pods = demoProbeRoles(phase).map((role) => {
    if (['simulator', 'other', 'foreign'].includes(role))
      return pod({
        role,
        labels: { [attemptLabel]: selection.simulatorAttempt },
        namespace: role === 'foreign' ? foreign : spaces.apps,
        serviceAccountName: role === 'other' ? 'default' : account,
      });
    if (role === 'foreign-listener')
      return pod({ role, namespace: foreign, ports: [foreignProbePort] });
    if (role === 'database' || role === 'database-peer') {
      const db = routes.database;
      const labels =
        role === 'database-peer'
          ? { ...db.labels, 'app.kubernetes.io/name': 'fleetiq-network-probe-peer' }
          : { ...db.labels, ...databasePrimary };
      return listenerPod(role, { ...db, labels }, [db.podPort, cnpgControlPort]);
    }
    return pod({
      role,
      labels: application(role),
      ports: assignments.has(role) ? [assignments.get(role).podPort] : [],
    });
  });
  const extraListeners =
    phase === 'services' ? ['database', 'receiver', 'object-store'] : ['ingest-tcp'];
  for (const role of extraListeners) {
    const route = assignments.get(role);
    pods.push(listenerPod(role, route));
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
    ...Object.entries(demoProbeRoutes(phase, spaces))
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
          selector: {
            ...route.labels,
            ...fixtureLabel,
            ...(phase === 'database' && route.name === routes.database.name
              ? databasePrimary
              : {}),
          },
          ports: [
            {
              name: 'tcp',
              protocol: 'TCP',
              port: route.servicePort,
              targetPort: route.podPort,
            },
          ],
        },
      })),
  ];
}
