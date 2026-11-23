import assert from 'node:assert/strict';
import { isIPv4 } from 'node:net';
import { isDeepStrictEqual } from 'node:util';

export const consumerLabel = 'k8s-infrastructure.io/consumer';
export const attemptLabel = 'k8s-infrastructure.io/demo-attempt';
export const routineLabel = 'k8s-infrastructure.io/demo-routine';
const ciliumNamespace = 'k8s:io.kubernetes.pod.namespace';
const serviceAccount = 'io.cilium.k8s.policy.serviceaccount';
const nameLabel = 'app.kubernetes.io/name';
export const namespaceLabel = 'kubernetes.io/metadata.name';
export const ingestionService = 'tcp-ingestion';
export const ingestionPort = 55027;
export const issuerPort = 18443;
export const gatewayPort = 8443;
export const supportPorts = {
  issuer: 8080,
  receiver: { service: 443, pod: 8443 },
  objectStore: { service: 443, pod: 9000 },
};
export const application = (role) => ({ [nameLabel]: `fleetiq-${role}` });
export const database = { 'cnpg.io/cluster': 'fleetiq-db' };
export const dns = { 'k8s-app': 'kube-dns' };
export const postgresPort = 5432;
export const cnpgControlPort = 8000;
export const foreignProbePort = 8080;
export const additionalDatabaseRoles = [
  'replay-worker',
  'semantic-worker',
  'project-current',
  'analytics-worker',
];
export const demoProbePhases = ['ingestion', 'services', 'database'];

export function admittedIPv4(address) {
  if (!isIPv4(address)) return false;
  const [a, b] = address.split('.').map(Number);
  return (
    a === 127 ||
    a === 10 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

export function demoNamespaces(consumer) {
  assert(
    typeof consumer === 'string' &&
      consumer.length <= 32 &&
      /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u.test(consumer) &&
      !['perfeng', 'perfeng-local'].includes(consumer),
    'Invalid minimal-demo consumer',
  );
  return {
    apps: `${consumer}-apps`,
    data: `${consumer}-data`,
    support: `${consumer}-demo-support`,
  };
}

function validateSelection(selection) {
  assert(
    selection &&
      Object.keys(selection).sort().join() ===
        'consumer,issuerAddress,simulatorAttempt',
    'Use exactly the reviewed minimal-demo network selection fields',
  );
  assert(
    typeof selection.simulatorAttempt === 'string' &&
      /^demo-launch-[a-f0-9]{24}$/.test(selection.simulatorAttempt),
    'Select the exact approved simulator launcher attempt',
  );
  assert(
    admittedIPv4(selection.issuerAddress) &&
      !selection.issuerAddress.startsWith('127.'),
    'Select one reviewed private non-loopback IPv4 address for in-cluster issuer DNS',
  );
  return demoNamespaces(selection.consumer);
}

export const simulatorAccount = (attempt) =>
  attempt.replace(/^demo-launch-/u, 'demo-run-');

function podSelector(labels) {
  const role = labels[nameLabel];
  return {
    matchLabels: labels,
    ...((role && role !== 'fleetiq-edge') || labels[attemptLabel]
      ? {
          matchExpressions: [{ key: routineLabel, operator: 'DoesNotExist' }],
        }
      : {}),
  };
}

function ciliumPeer(labels, namespace) {
  const selector = podSelector(labels);
  selector.matchLabels = { [ciliumNamespace]: namespace, ...labels };
  return selector;
}

function peer(labels, namespace) {
  return {
    ...(namespace
      ? { namespaceSelector: { matchLabels: { [namespaceLabel]: namespace } } }
      : {}),
    podSelector: podSelector(labels),
  };
}

const tcp = (...ports) => ports.map((port) => ({ protocol: 'TCP', port }));
const ingress = (from, ...ports) => ({ from, ports: tcp(...ports) });
const egress = (to, ...ports) => ({ to, ports: tcp(...ports) });
const dnsEgress = {
  to: [peer(dns, 'kube-system')],
  ports: [
    { protocol: 'UDP', port: 53 },
    { protocol: 'TCP', port: 53 },
  ],
};

function resource(apiVersion, kind, name, namespace, body = {}) {
  return {
    apiVersion,
    kind,
    metadata: { name, ...(namespace ? { namespace } : {}) },
    ...body,
  };
}

function network(namespace, name, labels, rules) {
  return resource(
    'networking.k8s.io/v1',
    'NetworkPolicy',
    `fleetiq-${name}`,
    namespace,
    {
      spec: {
        podSelector: labels ? podSelector(labels) : {},
        policyTypes: ['Ingress', 'Egress'],
        ...rules,
      },
    },
  );
}

function cilium(namespace, name, labels, rules) {
  return resource('cilium.io/v2', 'CiliumNetworkPolicy', `fleetiq-${name}`, namespace, {
    spec: { endpointSelector: podSelector(labels), ...rules },
  });
}

function ciliumPorts(...ports) {
  return [{ ports: ports.map((port) => ({ protocol: 'TCP', port: String(port) })) }];
}

/** Desired state for separate namespace/network installation and the routine TCP Service. */
export function minimalDemoResources(selection) {
  const { apps, data, support } = validateSelection(selection);
  const namespaces = [apps, data, support];
  const simulator = {
    [attemptLabel]: selection.simulatorAttempt,
    [serviceAccount]: simulatorAccount(selection.simulatorAttempt),
  };
  const databaseRoles = [
    'backend',
    'ingest-tcp',
    ...additionalDatabaseRoles,
    'notification-worker',
    'archive-worker',
  ];
  const browserRoles = ['edge', 'issuer'];
  const databaseEgress = egress([peer(database, data)], postgresPort);
  const objectStoreEgress = egress(
    [peer(application('object-store'), support)],
    supportPorts.objectStore.pod,
  );
  const role = (name, ingressRules, egressRules) => ({
    ingress: ingressRules,
    egress: egressRules,
    name,
  });
  const applicationRoles = [
    role('edge', [], [dnsEgress, egress([peer(application('backend'))], 8080)]),
    ...databaseRoles.map((name) =>
      role(
        name,
        name === 'backend' ? [ingress([peer(application('edge'))], 8080)] : [],
        [
          dnsEgress,
          databaseEgress,
          ...(['backend', 'archive-worker'].includes(name) ? [objectStoreEgress] : []),
          ...(name === 'backend'
            ? [
                egress(
                  [{ ipBlock: { cidr: `${selection.issuerAddress}/32` } }],
                  issuerPort,
                ),
              ]
            : []),
          ...(name === 'notification-worker'
            ? [egress([peer(application('alertmanager'))], 9093)]
            : []),
        ],
      ),
    ),
    role(
      'alertmanager',
      [ingress([peer(application('notification-worker'))], 9093)],
      [
        dnsEgress,
        egress([peer(application('receiver'), support)], supportPorts.receiver.pod),
      ],
    ),
  ];
  const tcpService = resource('v1', 'Service', ingestionService, apps, {
    spec: {
      type: 'ClusterIP',
      ipFamilyPolicy: 'SingleStack',
      ipFamilies: ['IPv4'],
      selector: application('ingest-tcp'),
      ports: [
        {
          name: 'ingest',
          protocol: 'TCP',
          port: ingestionPort,
          targetPort: ingestionPort,
        },
      ],
    },
  });
  const tcpSettings = resource('v1', 'ConfigMap', 'fleetiq-ingest-tcp-network', apps, {
    data: { FLEETIQ_TCP_BIND_ADDRESS: `0.0.0.0:${ingestionPort}` },
  });
  tcpService.metadata.labels = { [routineLabel]: 'true' };
  return [
    ...namespaces.map((space) => {
      const desired = resource('v1', 'Namespace', space);
      desired.metadata.labels = {
        'app.kubernetes.io/part-of': 'fleetiq',
        [consumerLabel]: selection.consumer,
        'pod-security.kubernetes.io/enforce': 'baseline',
        'pod-security.kubernetes.io/enforce-version': 'v1.35',
      };
      desired.metadata.annotations = {
        'argocd.argoproj.io/sync-options': 'Prune=false,Delete=false',
      };
      return desired;
    }),
    ...namespaces.map((space) => network(space, 'default-deny', null, {})),
    tcpService,
    tcpSettings,
    cilium(apps, 'simulator', simulator, {
      egress: [
        {
          toEndpoints: [ciliumPeer(dns, 'kube-system')],
          toPorts: [
            {
              ports: dnsEgress.ports.map((port) => ({
                ...port,
                port: String(port.port),
              })),
            },
          ],
        },
        {
          toEndpoints: [ciliumPeer(application('ingest-tcp'), apps)],
          toPorts: ciliumPorts(ingestionPort),
        },
      ],
    }),
    cilium(apps, 'ingest-tcp-simulator', application('ingest-tcp'), {
      ingress: [
        {
          fromEndpoints: [ciliumPeer(simulator, apps)],
          toPorts: ciliumPorts(ingestionPort),
        },
      ],
    }),
    ...applicationRoles.map(({ name, ...rules }) =>
      network(apps, name, application(name), rules),
    ),
    network(data, 'db', database, {
      ingress: [
        ingress(
          databaseRoles.map((name) => peer(application(name), apps)),
          postgresPort,
        ),
        ingress([peer(database)], postgresPort, cnpgControlPort),
        ingress(
          [peer({ [nameLabel]: 'cloudnative-pg' }, 'cnpg-system')],
          cnpgControlPort,
        ),
      ],
      egress: [dnsEgress, egress([peer(database)], postgresPort, cnpgControlPort)],
    }),
    network(support, 'receiver', application('receiver'), {
      ingress: [
        ingress([peer(application('alertmanager'), apps)], supportPorts.receiver.pod),
      ],
      egress: [],
    }),
    network(support, 'object-store', application('object-store'), {
      ingress: [
        ingress(
          ['backend', 'archive-worker'].map((name) => peer(application(name), apps)),
          supportPorts.objectStore.pod,
        ),
      ],
      egress: [],
    }),
    ...browserRoles.map((name) =>
      cilium(name === 'edge' ? apps : support, `${name}-gateway`, application(name), {
        ingress: [
          {
            fromEntities: ['ingress'],
            toPorts: ciliumPorts(name === 'edge' ? 8080 : supportPorts.issuer),
          },
        ],
      }),
    ),
    // These host destinations carry Cilium identities, not ordinary CIDR or Pod identities.
    cilium(apps, 'backend-gateway', application('backend'), {
      egress: [{ toEntities: ['host'], toPorts: ciliumPorts(gatewayPort) }],
    }),
    cilium(data, 'db-apiserver', database, {
      egress: [{ toEntities: ['kube-apiserver'], toPorts: ciliumPorts(6443) }],
    }),
  ];
}

const identity = ({ apiVersion, kind, metadata }) =>
  [apiVersion, kind, metadata?.namespace ?? '', metadata?.name].join('/');

export function assertMinimalDemoResources(resources, selection) {
  const desired = new Map(
    minimalDemoResources(selection).map((item) => [identity(item), item]),
  );
  assert(
    Array.isArray(resources) && resources.length === desired.size,
    'Minimal demo inventory or policy differs',
  );
  for (const resource of resources) {
    const key = identity(resource);
    assert(
      isDeepStrictEqual(resource, desired.get(key)),
      'Minimal demo inventory or policy differs',
    );
    desired.delete(key);
  }
  return resources.length;
}

/** Private Service and its translated endpoint port are separate contract fields. */
export function demoServiceRoutes(spaces) {
  return {
    ingestion: {
      namespace: spaces.apps,
      name: ingestionService,
      labels: application('ingest-tcp'),
      servicePort: ingestionPort,
      podPort: ingestionPort,
    },
    backend: {
      namespace: spaces.apps,
      name: 'fleetiq-backend',
      labels: application('backend'),
      servicePort: 8080,
      podPort: 8080,
    },
    database: {
      namespace: spaces.data,
      name: 'fleetiq-db-rw',
      labels: database,
      servicePort: postgresPort,
      podPort: postgresPort,
    },
    alertmanager: {
      namespace: spaces.apps,
      name: 'fleetiq-alertmanager',
      labels: application('alertmanager'),
      servicePort: 9093,
      podPort: 9093,
    },
    receiver: {
      namespace: spaces.support,
      name: 'fleetiq-receiver',
      labels: application('receiver'),
      servicePort: supportPorts.receiver.service,
      podPort: supportPorts.receiver.pod,
    },
    objectStore: {
      namespace: spaces.support,
      name: 'fleetiq-object-store',
      labels: application('object-store'),
      servicePort: supportPorts.objectStore.service,
      podPort: supportPorts.objectStore.pod,
    },
  };
}

export function demoProbeRoles(phase) {
  const ingestion = ['simulator', 'other', 'foreign', 'foreign-listener'];
  assert(demoProbePhases.includes(phase), 'Select an installed network probe phase');
  switch (phase) {
    case 'ingestion':
      return ingestion;
    case 'database':
      return [...ingestion, ...additionalDatabaseRoles, 'database', 'database-peer'];
    default:
      return [
        ...ingestion,
        'ingest-tcp',
        'backend',
        'edge',
        'notification-worker',
        'alertmanager',
        'archive-worker',
      ];
  }
}

export function demoProbeRoutes(phase, spaces) {
  const routes = demoServiceRoutes(spaces);
  if (phase === 'ingestion') return { ingestion: routes.ingestion };
  if (phase === 'database')
    return { ingestion: routes.ingestion, database: routes.database };
  return routes;
}
