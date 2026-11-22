import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import {
  fixtureLabel,
  foreignNamespace,
  minimalDemoProbeFixtures,
} from './minimal-demo-fixtures.mjs';
import {
  admittedIPv4,
  application,
  attemptLabel,
  consumerLabel,
  demoNamespaces,
  demoProbeRoles,
  demoServiceRoutes,
  gatewayPort,
  ingestionService,
  issuerPort,
  minimalDemoResources,
  namespaceLabel,
  routineLabel,
  simulatorAccount,
} from './minimal-demo-network.mjs';

const uid = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/u;
const digest = /^sha256:[a-f0-9]{64}$/u;
const hostname =
  /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u;
const objectName = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u;
const imageDigest = (imageID) =>
  imageID
    ?.split('@')
    .at(-1)
    .replace(/^[a-z-]+:\/\//u, '');
const image = /^[a-zA-Z0-9/_.:-]+@sha256:[a-f0-9]{64}$/u;
const isPrivate = (address) => admittedIPv4(address) && !address.startsWith('127.');
const hash = (value) =>
  `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;

function requireCheck(condition, reason) {
  assert(condition, `Minimal-demo network probe: ${reason}`);
}

const includesLabels = (metadata, labels) =>
  Object.entries(labels).every(([key, value]) => metadata.labels?.[key] === value);
const ready = (item) =>
  item.status?.conditions?.some(
    ({ type, status }) => type === 'Ready' && status === 'True',
  );
const same = (a, b, reason) => requireCheck(isDeepStrictEqual(a, b), reason);

/** Only treat a timeout from a functioning source as denial, with a listening witness on both sides. */
function checkRoute(
  name,
  allowed,
  blocked,
  { service, endpoints, serviceKind = 'service', endpointKind = 'pod' },
  { connect },
  record,
) {
  for (const [index, destination] of [service, ...endpoints].entries()) {
    record(
      index === 0 ? `${name}-${serviceKind}` : `${name}-${endpointKind}-${index}`,
      () => {
        for (const source of allowed)
          requireCheck(
            connect(source, destination) === 'connected',
            'required connection failed',
          );
        for (const source of blocked)
          requireCheck(
            connect(source, destination) === 'timeout',
            'forbidden connection was not observed to time out',
          );
        if (blocked.length)
          requireCheck(
            connect(allowed[0], destination) === 'connected',
            'positive connection witness was lost',
          );
      },
    );
  }
}

export function checkIngestionRoute(sources, route, connectivity, record) {
  record('ingestion-dns', () => {
    const answers = connectivity.lookup(sources.simulator, ingestionService);
    requireCheck(
      answers.length > 0 &&
        answers.every(
          (address) => admittedIPv4(address) && address === route.service.address,
        ),
      'DNS must return only the admitted, observed ingestion ClusterIP',
    );
  });
  checkRoute(
    'ingestion',
    [sources.simulator],
    [sources.other, sources.foreign],
    route,
    connectivity,
    record,
  );
}

const socketProgram = `import errno, json, socket, sys
operation, address = sys.argv[1:3]
if operation == 'lookup':
    answers = socket.getaddrinfo(address, None, socket.AF_INET, socket.SOCK_STREAM)
    print(json.dumps(sorted(set(item[4][0] for item in answers))))
else:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as conn:
        conn.settimeout(2)
        try:
            conn.connect((address, int(sys.argv[3])))
            print('connected')
        except TimeoutError:
            print('timeout')
        except OSError as error:
            print('timeout' if error.errno == errno.ETIMEDOUT else 'unavailable')`;

function probeConnectivity(kube) {
  function execute({ namespace, name }, operation, address, ...args) {
    return kube([
      '--namespace',
      namespace,
      'exec',
      name,
      '--container',
      'probe',
      '--',
      'python',
      '-I',
      '-B',
      '-c',
      socketProgram,
      operation,
      address,
      ...args,
    ]);
  }
  return {
    lookup: (source, name) => JSON.parse(execute(source, 'lookup', name)),
    connect: (source, { address, port }) =>
      execute(source, 'connect', address, String(port)),
  };
}

function get(kube, resource, name, namespace) {
  return JSON.parse(
    kube([
      ...(namespace ? ['--namespace', namespace] : []),
      'get',
      resource,
      ...(name ? [name] : []),
      '-o',
      'json',
    ]),
  );
}

function validateRequest(request) {
  const { selection, target, phase, candidate, issuerHostname, probes } = request;
  const entries = (value, keys) => value && Object.keys(value).sort().join() === keys;
  requireCheck(
    entries(
      request,
      phase === 'ingestion'
        ? 'candidate,phase,probes,selection,target'
        : 'candidate,issuerHostname,phase,probes,selection,target',
    ) &&
      entries(target, 'name,namespaceUids,workerUid') &&
      entries(target.namespaceUids, 'apps,data,foreign,support,system'),
    'unexpected request or target fields',
  );
  const desired = minimalDemoResources(selection);
  const spaces = demoNamespaces(selection.consumer);
  requireCheck(
    target?.name === `${selection.consumer}-local` &&
      uid.test(target.workerUid) &&
      ['apps', 'data', 'support', 'system', 'foreign'].every((name) =>
        uid.test(target.namespaceUids?.[name]),
      ),
    'select the exact target incarnation and all five namespace UIDs',
  );
  requireCheck(
    ['ingestion', 'services'].includes(phase) && digest.test(candidate),
    'select a reviewed candidate and supported probe phase',
  );
  requireCheck(
    phase === 'ingestion' ||
      (typeof issuerHostname === 'string' &&
        issuerHostname.length <= 253 &&
        hostname.test(issuerHostname)),
    'select the canonical issuer DNS hostname',
  );
  const required = demoProbeRoles(phase);
  same(
    Object.keys(probes ?? {}).sort(),
    required.toSorted(),
    'probe source inventory differs from the selected phase',
  );
  for (const probe of Object.values(probes)) {
    requireCheck(
      entries(probe, 'imageId,name,podUid,probeImage'),
      'unexpected probe fields',
    );
    const { name, podUid, probeImage, imageId } = probe;
    requireCheck(
      objectName.test(name) &&
        uid.test(podUid) &&
        image.test(probeImage) &&
        digest.test(imageId),
      'each probe needs an exact name, Pod UID, immutable image reference and observed image digest',
    );
  }
  same(
    new Set(Object.values(probes).map(({ podUid }) => podUid)).size,
    required.length,
    'probe Pod UIDs must be distinct',
  );
  return { desired, spaces, foreign: foreignNamespace(selection.consumer) };
}

function inspectTarget(kube, request, spaces, foreign) {
  const { target, selection } = request;
  const namespaces = { ...spaces, foreign, system: 'kube-system' };
  for (const [key, name] of Object.entries(namespaces)) {
    const observed = get(kube, 'namespace', name);
    requireCheck(
      observed.metadata.name === name &&
        observed.metadata.uid === target.namespaceUids[key] &&
        !observed.metadata.deletionTimestamp &&
        observed.status?.phase === 'Active' &&
        includesLabels(observed.metadata, { [namespaceLabel]: name }),
      'namespace incarnation or ownership differs',
    );
    if (key in spaces)
      requireCheck(
        includesLabels(observed.metadata, {
          [consumerLabel]: selection.consumer,
          'pod-security.kubernetes.io/enforce': 'baseline',
          'pod-security.kubernetes.io/enforce-version': 'v1.35',
        }),
        'workload namespace is outside the reviewed delegation',
      );
    if (key === 'foreign')
      requireCheck(
        !observed.metadata.labels?.[consumerLabel] &&
          includesLabels(observed.metadata, fixtureLabel),
        'foreign witness namespace is not the isolated, owned fixture',
      );
  }
  const worker = get(kube, 'node', `${target.name}-worker`);
  const addresses = worker.status?.addresses
    ?.filter(({ type }) => type === 'InternalIP')
    .map(({ address }) => address);
  requireCheck(
    worker.metadata.name === `${target.name}-worker` &&
      worker.metadata.uid === target.workerUid &&
      !worker.metadata.deletionTimestamp &&
      ready(worker) &&
      includesLabels(worker.metadata, {
        [consumerLabel]: selection.consumer,
        'k8s-infrastructure.io/role': 'worker',
      }) &&
      addresses?.length === 1 &&
      isPrivate(addresses[0]),
    'worker incarnation, placement or IPv4 identity differs',
  );
  return addresses[0];
}

const normalizedPolicy = (spec) =>
  Object.fromEntries(
    Object.entries(spec ?? {}).filter(
      ([key, value]) =>
        !(
          ['ingress', 'egress'].includes(key) &&
          Array.isArray(value) &&
          value.length === 0
        ),
    ),
  );

function inspectPolicy(kube, desired, spaces) {
  const policyKinds = {
    NetworkPolicy: 'networkpolicies.networking.k8s.io',
    CiliumNetworkPolicy: 'ciliumnetworkpolicies.cilium.io',
  };
  for (const space of Object.values(spaces)) {
    for (const [kind, name] of Object.entries(policyKinds)) {
      const expected = desired.filter(
        (item) => item.kind === kind && item.metadata.namespace === space,
      );
      const { items } = get(kube, name, null, space);
      same(items.length, expected.length, 'installed policy inventory differs');
      for (const item of expected) {
        const observed = items.find(
          (other) => other.metadata.name === item.metadata.name,
        );
        requireCheck(
          observed?.metadata.namespace === space &&
            !observed.metadata.deletionTimestamp &&
            !observed.specs,
          'required policy is missing or deleting',
        );
        same(
          normalizedPolicy(observed.spec),
          normalizedPolicy(item.spec),
          'installed policy rules differ',
        );
      }
    }
  }
  const config = get(kube, 'configmap', 'fleetiq-ingest-tcp-network', spaces.apps);
  const expected = desired.find(({ kind }) => kind === 'ConfigMap');
  same(config.data, expected.data, 'installed ingestion Pod bind contract differs');
  requireCheck(
    config.metadata.namespace === spaces.apps &&
      config.metadata.name === expected.metadata.name &&
      !Object.hasOwn(config.metadata.labels ?? {}, routineLabel) &&
      !config.metadata.deletionTimestamp,
    'ingestion bind ConfigMap is not owned',
  );
}

function inspectSources(kube, request, spaces, foreign) {
  const result = {};
  for (const [role, expected] of Object.entries(request.probes)) {
    const namespace = role === 'foreign' ? foreign : spaces.apps;
    const fixture = minimalDemoProbeFixtures(
      request.selection,
      request.phase,
      expected.probeImage,
    ).find(
      (item) => item.kind === 'Pod' && item.metadata.name === `network-probe-${role}`,
    );
    requireCheck(
      expected.name === fixture.metadata.name,
      'probe name differs from the reviewed manifest',
    );
    const pod = get(kube, 'pod', expected.name, namespace);
    const attempt = ['simulator', 'foreign', 'other'].includes(role);
    const labels = attempt
      ? { [attemptLabel]: request.selection.simulatorAttempt }
      : application(role);
    const account = ['simulator', 'foreign'].includes(role)
      ? simulatorAccount(request.selection.simulatorAttempt)
      : 'default';
    const container = pod.spec?.containers?.[0];
    const status = pod.status?.containerStatuses?.[0];
    requireCheck(
      pod.metadata.name === expected.name &&
        pod.metadata.namespace === namespace &&
        pod.metadata.uid === expected.podUid &&
        !pod.metadata.deletionTimestamp &&
        includesLabels(pod.metadata, labels) &&
        includesLabels(pod.metadata, fixtureLabel) &&
        !Object.hasOwn(pod.metadata.labels ?? {}, routineLabel) &&
        !pod.spec.hostNetwork &&
        !pod.spec.hostPID &&
        !pod.spec.hostIPC &&
        pod.spec.automountServiceAccountToken === false &&
        pod.spec.serviceAccountName === account &&
        pod.spec.dnsPolicy === 'ClusterFirst' &&
        !pod.spec.dnsConfig &&
        !pod.spec.hostAliases?.length &&
        pod.spec.restartPolicy === 'Never' &&
        pod.spec.activeDeadlineSeconds === fixture.spec.activeDeadlineSeconds &&
        pod.spec.nodeName === `${request.target.name}-worker` &&
        pod.spec.containers.length === 1 &&
        !pod.spec.initContainers?.length &&
        !pod.spec.ephemeralContainers?.length &&
        !pod.spec.volumes?.length &&
        container?.name === 'probe' &&
        container.image === expected.probeImage &&
        !container.env?.length &&
        !container.envFrom?.length &&
        !container.volumeMounts?.length &&
        isDeepStrictEqual(container.command, fixture.spec.containers[0].command) &&
        isDeepStrictEqual(container.resources, fixture.spec.containers[0].resources) &&
        isDeepStrictEqual(
          container.securityContext,
          fixture.spec.containers[0].securityContext,
        ) &&
        isDeepStrictEqual(pod.spec.securityContext, fixture.spec.securityContext) &&
        !container.ports?.some(({ hostPort }) => hostPort) &&
        ready(pod) &&
        status?.ready &&
        imageDigest(status.imageID) === expected.imageId,
      'probe Pod identity, isolation, readiness or running image differs',
    );
    requireCheck(
      kube([
        '--namespace',
        namespace,
        'auth',
        'can-i',
        'create',
        `pods/${expected.name}`,
        '--subresource=exec',
      ]) === 'yes',
      'selected operator lacks exec authority on an exact probe Pod',
    );
    result[role] = { namespace, name: expected.name };
  }
  return result;
}

function inspectService(
  kube,
  { namespace, name, labels, servicePort, podPort, exact },
) {
  const service = get(kube, 'service', name, namespace);
  const spec = service.spec;
  requireCheck(
    service.metadata.name === name &&
      service.metadata.namespace === namespace &&
      !service.metadata.deletionTimestamp &&
      spec.type === 'ClusterIP' &&
      !spec.externalIPs?.length &&
      !spec.externalName &&
      !spec.loadBalancerIP &&
      !service.status?.loadBalancer?.ingress?.length &&
      spec.ipFamilyPolicy === 'SingleStack' &&
      isPrivate(spec.clusterIP) &&
      isDeepStrictEqual(spec.clusterIPs, [spec.clusterIP]) &&
      isDeepStrictEqual(spec.ipFamilies, ['IPv4']) &&
      !spec.publishNotReadyAddresses &&
      spec.ports.length === 1 &&
      spec.ports[0].port === servicePort &&
      spec.ports[0].protocol === 'TCP' &&
      !spec.ports[0].nodePort &&
      spec.ports[0].targetPort === podPort &&
      includesLabels({ labels: spec.selector }, labels),
    'private Service, selector or translated port differs',
  );
  if (exact) {
    same(
      spec.selector,
      exact.spec.selector,
      'exact ingestion Service selector differs',
    );
    same(spec.ports, exact.spec.ports, 'exact ingestion Service port differs');
    requireCheck(
      includesLabels(service.metadata, exact.metadata.labels),
      'ingestion Service is outside routine delegation',
    );
  }
  const { items } = JSON.parse(
    kube([
      '--namespace',
      namespace,
      'get',
      'endpointslices.discovery.k8s.io',
      '-l',
      `kubernetes.io/service-name=${name}`,
      '-o',
      'json',
    ]),
  );
  requireCheck(
    items.length > 0 && items.length <= 4,
    'expected bounded Service EndpointSlices',
  );
  const endpoints = [];
  for (const slice of items) {
    requireCheck(
      slice.metadata.namespace === namespace &&
        slice.addressType === 'IPv4' &&
        slice.metadata.ownerReferences?.some(
          (owner) =>
            owner.kind === 'Service' &&
            owner.uid === service.metadata.uid &&
            owner.name === name,
        ) &&
        slice.ports.length === 1 &&
        slice.ports[0].port === podPort &&
        slice.ports[0].protocol === 'TCP',
      'Service EndpointSlice owner, family or translated port differs',
    );
    for (const endpoint of slice.endpoints) {
      const ref = endpoint.targetRef;
      requireCheck(
        endpoint.conditions?.ready === true &&
          endpoint.conditions?.terminating !== true &&
          endpoint.addresses.length === 1 &&
          isPrivate(endpoint.addresses[0]) &&
          ref?.kind === 'Pod' &&
          ref.namespace === namespace &&
          objectName.test(ref.name) &&
          uid.test(ref.uid),
        'endpoint is foreign, unready or unbound',
      );
      requireCheck(endpoints.length < 4, 'too many Service endpoints');
      const pod = get(kube, 'pod', ref.name, namespace);
      requireCheck(
        pod.metadata.name === ref.name &&
          pod.metadata.uid === ref.uid &&
          pod.metadata.namespace === namespace &&
          !pod.metadata.deletionTimestamp &&
          includesLabels(pod.metadata, labels) &&
          includesLabels(pod.metadata, spec.selector) &&
          (!exact || !Object.hasOwn(pod.metadata.labels ?? {}, routineLabel)) &&
          pod.status?.podIP === endpoint.addresses[0] &&
          ready(pod) &&
          !pod.spec.hostNetwork &&
          ![
            ...pod.spec.containers,
            ...(pod.spec.initContainers ?? []),
            ...(pod.spec.ephemeralContainers ?? []),
          ].some((container) => container.ports?.some(({ hostPort }) => hostPort)),
        'endpoint Pod or host exposure differs',
      );
      const images = pod.status?.containerStatuses?.map(({ imageID }) =>
        imageDigest(imageID),
      );
      requireCheck(
        images?.length > 0 && images.every((id) => digest.test(id)),
        'endpoint image digest unavailable',
      );
      if (exact) {
        const { items: services } = get(kube, 'services', null, namespace);
        requireCheck(
          services
            .filter(
              (item) =>
                item.spec?.selector && includesLabels(pod.metadata, item.spec.selector),
            )
            .every((item) => item.metadata.uid === service.metadata.uid),
          'unexpected Service also selects the ingestion endpoint',
        );
      }
      endpoints.push({
        address: endpoint.addresses[0],
        port: podPort,
        uid: ref.uid,
        images,
      });
    }
  }
  requireCheck(
    endpoints.length > 0 &&
      new Set(endpoints.map(({ address }) => address)).size === endpoints.length,
    'expected distinct listening endpoint addresses',
  );
  return {
    service: { address: spec.clusterIP, port: servicePort, uid: service.metadata.uid },
    endpoints,
  };
}

function inspectRoutes(kube, spaces, desired, phase) {
  const routes = demoServiceRoutes(spaces);
  const required = phase === 'ingestion' ? ['ingestion'] : Object.keys(routes);
  return Object.fromEntries(
    required.map((role) => [
      role,
      inspectService(kube, {
        ...routes[role],
        ...(role === 'ingestion'
          ? { exact: desired.find(({ kind }) => kind === 'Service') }
          : {}),
      }),
    ]),
  );
}

function checkServices(
  sources,
  routes,
  { workerAddress, selection, issuerHostname },
  connectivity,
  record,
) {
  const { backend, edge, simulator, alertmanager, foreign, other } = sources;
  for (const [name, allowed, blocked, route] of [
    ['backend', [edge], [simulator, foreign], routes.backend],
    [
      'postgres',
      [
        sources['ingest-tcp'],
        backend,
        sources['archive-worker'],
        sources['notification-worker'],
      ],
      [simulator, edge, foreign],
      routes.database,
    ],
    [
      'router',
      [sources['notification-worker']],
      [simulator, foreign],
      routes.alertmanager,
    ],
    [
      'receiver',
      [alertmanager],
      [sources['notification-worker'], simulator, foreign],
      routes.receiver,
    ],
    [
      'object-store',
      [backend, sources['archive-worker']],
      [alertmanager, simulator, foreign],
      routes.objectStore,
    ],
  ])
    checkRoute(name, allowed, blocked, route, connectivity, record);
  record('issuer-canonical-dns', () => {
    const answers = connectivity.lookup(backend, issuerHostname);
    requireCheck(
      answers.length > 0 &&
        answers.every((address) => address === selection.issuerAddress),
      'issuer DNS differs from the reviewed private destination',
    );
  });
  checkRoute(
    'issuer-gateway',
    [backend],
    [sources['ingest-tcp'], simulator, other],
    {
      service: { address: selection.issuerAddress, port: issuerPort },
      endpoints: [{ address: workerAddress, port: gatewayPort }],
      serviceKind: 'canonical',
      endpointKind: 'worker',
    },
    connectivity,
    record,
  );
}

/** The caller supplies a time-limited, explicitly configured kubectl adapter. */
export function qualifyMinimalNetwork(request, { kube, source }) {
  const { desired, spaces, foreign } = validateRequest(request);
  requireCheck(
    source && /^[a-f0-9]{40}$/u.test(source.commit) && digest.test(source.fingerprint),
    'source identity unavailable',
  );
  const evidence = {
    format: 'fleetiq-minimal-demo-network.v1',
    source: { commit: source.commit, fingerprint: source.fingerprint },
    candidate: request.candidate,
    target: {
      name: request.target.name,
      namespaceUids: request.target.namespaceUids,
      workerUid: request.target.workerUid,
    },
    phase: request.phase,
    networkArtifact: hash(desired),
    fixtures: Object.fromEntries(
      Object.entries(request.probes).map(([role, { podUid, probeImage, imageId }]) => [
        role,
        { podUid, probeImage, imageId },
      ]),
    ),
    checks: [],
    outcome: 'failed',
  };
  function record(name, check) {
    const entry = { name, outcome: 'failed' };
    evidence.checks.push(entry);
    const result = check();
    entry.outcome = 'passed';
    return result;
  }
  try {
    const workerAddress = record('target', () =>
      inspectTarget(kube, request, spaces, foreign),
    );
    record('policy-and-bind', () => inspectPolicy(kube, desired, spaces));
    const sources = record('probe-identities', () =>
      inspectSources(kube, request, spaces, foreign),
    );
    const routes = record('service-endpoints-and-privacy', () =>
      inspectRoutes(kube, spaces, desired, request.phase),
    );
    evidence.routes = Object.fromEntries(
      Object.entries(routes).map(([key, { service, endpoints }]) => [
        key,
        {
          serviceUid: service.uid,
          podImages: endpoints.map(({ uid: podUid, images }) => ({ podUid, images })),
        },
      ]),
    );
    const connectivity = probeConnectivity(kube);
    checkIngestionRoute(sources, routes.ingestion, connectivity, record);
    if (request.phase === 'services')
      checkServices(
        sources,
        routes,
        { workerAddress, ...request },
        connectivity,
        record,
      );
    record('stable-target-policy-and-endpoints', () => {
      same(
        inspectTarget(kube, request, spaces, foreign),
        workerAddress,
        'target changed during probe',
      );
      inspectPolicy(kube, desired, spaces);
      inspectSources(kube, request, spaces, foreign);
      same(
        inspectRoutes(kube, spaces, desired, request.phase),
        routes,
        'endpoints changed during probe',
      );
    });
    evidence.outcome = 'passed';
  } catch (error) {
    // Static reasons from local assertions are safe. API/exec/parser diagnostics may be private.
    const prefix = 'Minimal-demo network probe: ';
    evidence.reason =
      error.code === 'ERR_ASSERTION' && error.message.startsWith(prefix)
        ? error.message.slice(prefix.length)
        : 'target inspection or probe command unavailable';
  }
  return evidence;
}
