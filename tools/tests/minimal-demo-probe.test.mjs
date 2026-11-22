import assert from 'node:assert/strict';
import test from 'node:test';
import { checkIngestionRoute } from '../manifests/minimal-demo-probe.mjs';

const ingress = { address: '10.96.1.4', port: 55027 };
const endpoint = { address: '10.244.1.4', port: 55027 };
const sources = { simulator: 'simulator', foreign: 'foreign', other: 'other' };

function exercise({
  answers = [ingress.address],
  denied = 'timeout',
  witness = 'connected',
} = {}) {
  const calls = [];
  const checks = [];
  const connectivity = {
    lookup: () => answers,
    connect: (source, destination) => {
      calls.push([source, destination]);
      return source === 'simulator' && destination === endpoint
        ? witness
        : source === 'simulator'
          ? 'connected'
          : denied;
    },
  };
  const record = (name, operation) => {
    operation();
    checks.push(name);
  };
  return {
    calls,
    checks,
    run: () =>
      checkIngestionRoute(
        sources,
        { service: ingress, endpoints: [endpoint] },
        connectivity,
        record,
      ),
  };
}

test('the installed route checks exact DNS and proves allowed and denied Service and Pod paths', () => {
  const { calls, checks, run } = exercise();
  run();
  assert.deepEqual(checks, ['ingestion-dns', 'ingestion-service', 'ingestion-pod-1']);
  for (const destination of [ingress, endpoint]) {
    assert.deepEqual(
      calls.filter(([, target]) => target === destination).map(([source]) => source),
      ['simulator', 'other', 'foreign', 'simulator'],
    );
  }
});

test('a mixed DNS answer, unavailable witness, or non-timeout denial fails closed', () => {
  for (const options of [
    { answers: [ingress.address, '8.8.8.8'] },
    { answers: ['127.0.0.1'] },
    { answers: [] },
    { witness: 'refused' },
    { denied: 'refused' },
    { denied: 'connected' },
  ])
    assert.throws(exercise(options).run, /network probe/);
});

const testSelection = {
  consumer: 'fleetiq',
  simulatorAttempt: 'demo-launch-0123456789abcdef01234567',
  issuerAddress: '172.18.0.9',
};
const artifact = `sha256:${'a'.repeat(64)}`;
const probeImage = `registry.invalid/probe@${artifact}`;
const identifier = (index) =>
  `00000000-0000-0000-0000-${String(index).padStart(12, '0')}`;
const checkReady = [{ type: 'Ready', status: 'True' }];

async function installed({ phase = 'ingestion', mutate }) {
  const { minimalDemoProbeFixtures, foreignNamespace } = await import(
    '../manifests/minimal-demo-fixtures.mjs'
  );
  const { demoProbeRoles, demoServiceRoutes, demoNamespaces, minimalDemoResources } =
    await import('../manifests/minimal-demo-network.mjs');
  const { qualifyMinimalNetwork } = await import('../manifests/minimal-demo-probe.mjs');
  const spaces = demoNamespaces(testSelection.consumer);
  const namespaceNames = {
    ...spaces,
    system: 'kube-system',
    foreign: foreignNamespace(testSelection.consumer),
  };
  const desired = minimalDemoResources(testSelection);
  const fixtures = minimalDemoProbeFixtures(testSelection, phase, probeImage);
  const namespaces = new Map(
    Object.entries(namespaceNames).map(([role, name], index) => {
      const metadata = structuredClone(
        [...desired, ...fixtures].find(
          (item) => item.kind === 'Namespace' && item.metadata.name === name,
        )?.metadata ?? { name },
      );
      metadata.uid = identifier(index + 1);
      metadata.labels = { ...metadata.labels, 'kubernetes.io/metadata.name': name };
      return [role, { metadata, status: { phase: 'Active' } }];
    }),
  );
  const pods = fixtures
    .filter(({ kind }) => kind === 'Pod')
    .map((pod, index) => ({
      ...pod,
      metadata: { ...pod.metadata, uid: identifier(index + 10) },
      spec: { ...pod.spec, nodeName: 'fleetiq-local-worker' },
      status: {
        podIP: `10.244.1.${index + 10}`,
        conditions: checkReady,
        containerStatuses: [{ ready: true, imageID: `containerd://${artifact}` }],
      },
    }));
  const routes = {};
  for (const [index, [role, route]] of Object.entries(
    demoServiceRoutes(spaces),
  ).entries()) {
    const service = structuredClone(
      [...desired, ...fixtures].find(
        ({ kind, metadata }) => kind === 'Service' && metadata.name === route.name,
      ),
    );
    if (!service) continue;
    const address = `10.96.1.${index + 10}`;
    service.metadata.uid = identifier(index + 30);
    Object.assign(service.spec, { clusterIP: address, clusterIPs: [address] });
    const endpoint = pods.find(
      ({ metadata }) =>
        metadata.namespace === route.namespace &&
        Object.entries(service.spec.selector).every(
          ([key, value]) => metadata.labels[key] === value,
        ),
    );
    const slice = {
      metadata: {
        namespace: route.namespace,
        ownerReferences: [
          { kind: 'Service', uid: service.metadata.uid, name: route.name },
        ],
      },
      addressType: 'IPv4',
      ports: [{ port: route.podPort, protocol: 'TCP' }],
      endpoints: [
        {
          addresses: [endpoint.status.podIP],
          conditions: { ready: true },
          targetRef: {
            kind: 'Pod',
            uid: endpoint.metadata.uid,
            name: endpoint.metadata.name,
            namespace: route.namespace,
          },
        },
      ],
    };
    routes[role] = { service, endpoint, slice };
  }
  const worker = {
    metadata: {
      name: 'fleetiq-local-worker',
      uid: identifier(8),
      labels: {
        'k8s-infrastructure.io/role': 'worker',
        'k8s-infrastructure.io/consumer': 'fleetiq',
      },
    },
    status: {
      addresses: [{ type: 'InternalIP', address: '172.18.0.8' }],
      conditions: checkReady,
    },
  };
  const probeRoles = demoProbeRoles(phase);
  const request = {
    selection: testSelection,
    phase,
    ...(phase === 'services' ? { issuerHostname: 'issuer.local.test' } : {}),
    candidate: artifact,
    target: {
      name: 'fleetiq-local',
      workerUid: worker.metadata.uid,
      namespaceUids: Object.fromEntries(
        [...namespaces].map(([role, { metadata }]) => [role, metadata.uid]),
      ),
    },
    probes: Object.fromEntries(
      probeRoles.map((role) => {
        const pod = pods.find((item) => item.metadata.name === `network-probe-${role}`);
        return [
          role,
          {
            name: pod.metadata.name,
            podUid: pod.metadata.uid,
            probeImage,
            imageId: artifact,
          },
        ];
      }),
    ),
  };
  const calls = [];
  const code = (args, value) =>
    JSON.stringify(mutate ? mutate(args, value, calls) : value);
  const kube = (args) => {
    calls.push(args);
    const namespace = args[0] === '--namespace' ? args[1] : undefined;
    const [verb, kind, name] = namespace ? args.slice(2) : args;
    if (verb === 'auth') return 'yes';
    if (verb === 'get') {
      if (kind === 'namespace')
        return code(
          args,
          [...namespaces.values()].find(({ metadata }) => metadata.name === name),
        );
      if (kind === 'node') return code(args, worker);
      if (kind === 'pod')
        return code(
          args,
          pods.find(
            ({ metadata }) =>
              metadata.namespace === namespace && metadata.name === name,
          ),
        );
      if (kind === 'configmap')
        return code(
          args,
          desired.find((item) => item.kind === 'ConfigMap'),
        );
      if (kind === 'service')
        return code(
          args,
          Object.values(routes).find(({ service }) => service.metadata.name === name)
            .service,
        );
      if (kind === 'services')
        return code(args, {
          items: Object.values(routes)
            .map(({ service }) => service)
            .filter(({ metadata }) => metadata.namespace === namespace),
        });
      if (kind === 'endpointslices.discovery.k8s.io')
        return code(args, {
          items: [
            Object.values(routes).find(({ service }) =>
              args.includes(`kubernetes.io/service-name=${service.metadata.name}`),
            ).slice,
          ],
        });
      const policy = kind.startsWith('cilium')
        ? 'CiliumNetworkPolicy'
        : 'NetworkPolicy';
      return code(args, {
        items: desired.filter(
          (item) => item.kind === policy && item.metadata.namespace === namespace,
        ),
      });
    }
    assert.equal(verb, 'exec');
    const role = kind.replace('network-probe-', '');
    const [operation, address, port] = args.slice(12);
    if (operation === 'lookup')
      return JSON.stringify([
        address === 'tcp-ingestion'
          ? routes.ingestion.service.spec.clusterIP
          : testSelection.issuerAddress,
      ]);
    assert.equal(operation, 'connect');
    const target = Object.entries(routes).find(([, { service, endpoint }]) =>
      [service.spec.clusterIP, endpoint.status.podIP].includes(address),
    );
    const roleByTarget = {
      ingestion: ['simulator'],
      backend: ['edge'],
      database: ['ingest-tcp', 'backend', 'archive-worker', 'notification-worker'],
      alertmanager: ['notification-worker'],
      receiver: ['alertmanager'],
      objectStore: ['backend', 'archive-worker'],
    };
    if (target) {
      const [name, { service, slice }] = target;
      assert.equal(
        Number(port),
        address === service.spec.clusterIP
          ? service.spec.ports[0].port
          : slice.ports[0].port,
      );
      return roleByTarget[name].includes(role) ? 'connected' : 'timeout';
    }
    assert.deepEqual(
      [address, port],
      address === testSelection.issuerAddress
        ? ['172.18.0.9', '18443']
        : ['172.18.0.8', '8443'],
    );
    return role === 'backend' ? 'connected' : 'timeout';
  };
  const result = qualifyMinimalNetwork(request, {
    kube,
    source: { commit: 'b'.repeat(40), fingerprint: artifact },
  });
  return { result, calls };
}

test('the installed services phase requires verified policies, exact identities and translated destinations without leaking addresses', async () => {
  const { result, calls } = await installed({ phase: 'services' });
  assert.equal(result.outcome, 'passed', JSON.stringify(result.checks));
  assert(result.checks.some(({ name }) => name === 'issuer-gateway-worker-1'));
  assert(result.checks.some(({ name }) => name === 'receiver-pod-1'));
  assert.equal(result.routes.receiver.podImages[0].images[0], artifact);
  assert(!JSON.stringify(result).includes('172.18.0.'));
  assert(
    calls.some(
      (args) => args.includes('auth') && args.includes('pods/network-probe-simulator'),
    ),
  );
});

test('an unbound target, changed probe UID, or replaced Service endpoint cannot yield a passing receipt', async () => {
  for (const resource of ['namespace', 'pod', 'endpointslices.discovery.k8s.io']) {
    const { result, calls } = await installed({
      mutate: (args, value, prior) => {
        if (!args.includes(resource)) return value;
        if (resource === 'namespace')
          return { ...value, metadata: { ...value.metadata, uid: identifier(100) } };
        if (
          resource === 'pod' &&
          args.includes('network-probe-simulator') &&
          prior.filter(
            (item) => item.includes('pod') && item.includes('network-probe-simulator'),
          ).length === 2
        )
          return { ...value, metadata: { ...value.metadata, uid: identifier(100) } };
        if (resource === 'endpointslices.discovery.k8s.io') {
          const copy = structuredClone(value);
          copy.items[0].endpoints[0].targetRef.namespace = 'foreign';
          return copy;
        }
        return value;
      },
    });
    assert.equal(result.outcome, 'failed');
    if (resource !== 'pod')
      assert(!calls.some((args) => args.includes('exec') && !args.includes('auth')));
  }
});
