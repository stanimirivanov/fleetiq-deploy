import assert from 'node:assert/strict';
import { digestImage, resources } from './resource-policy.mjs';

const secretReference = (entry) => {
  assert(
    !entry.value &&
      entry.valueFrom?.secretKeyRef?.name &&
      entry.valueFrom.secretKeyRef.key,
    'Existing Secret reference required',
  );
  assert(
    !entry.valueFrom.secretKeyRef.optional,
    'Required credential cannot be optional',
  );
};

/** Check application restrictions and producer interfaces rather than YAML text. */
export function workloadPolicy(resource, { maintenance, nonlocal }) {
  assert.deepEqual(
    resource.spec.strategy,
    { type: 'RollingUpdate', rollingUpdate: { maxUnavailable: 0, maxSurge: 1 } },
    'Rollout must match bounded quota headroom',
  );
  assert.equal(
    resource.spec.replicas,
    maintenance ? 0 : nonlocal ? 2 : 1,
    'Unexpected maintenance/replica state',
  );
  const pod = resource.spec.template.spec;
  assert.equal(pod.automountServiceAccountToken, false);
  assert.equal(pod.serviceAccountName, resource.metadata.name);
  assert.equal(pod.terminationGracePeriodSeconds, 60);
  assert(
    !pod.hostNetwork &&
      !pod.hostPID &&
      !pod.hostIPC &&
      !pod.initContainers &&
      !pod.ephemeralContainers,
  );
  assert.deepEqual(pod.securityContext, {
    runAsNonRoot: true,
    runAsUser: 10001,
    runAsGroup: 10001,
    fsGroup: 10001,
    seccompProfile: { type: 'RuntimeDefault' },
  });
  assert.equal(pod.containers.length, 1, 'Unreviewed sidecar/writer');
  const container = pod.containers[0];
  digestImage(container.image);
  assert(
    !container.command && !container.envFrom && !container.lifecycle,
    'No executable override, envFrom or hidden lifecycle commands',
  );
  assert.deepEqual(container.securityContext, {
    allowPrivilegeEscalation: false,
    readOnlyRootFilesystem: true,
    capabilities: { drop: ['ALL'] },
  });
  assert.deepEqual(container.ports, [
    { name: 'http', containerPort: 8080, protocol: 'TCP' },
  ]);
  resources(container.resources);
  assert(
    pod.volumes.every(
      (volume) =>
        ['tmp', 'database-trust', 'oidc-trust'].includes(volume.name) &&
        !volume.hostPath &&
        !volume.secret,
    ),
  );
  assert.deepEqual(
    pod.volumes.find((volume) => volume.name === 'tmp'),
    { name: 'tmp', emptyDir: { medium: 'Memory', sizeLimit: '64Mi' } },
  );
  const env = Object.fromEntries(container.env.map((entry) => [entry.name, entry]));
  assert.equal(
    Object.keys(env).length,
    container.env.length,
    'Duplicate runtime setting',
  );
  for (const kind of ['startupProbe', 'readinessProbe', 'livenessProbe']) {
    const probe = container[kind];
    assert(
      probe &&
        probe.timeoutSeconds === 3 &&
        probe.periodSeconds > 0 &&
        probe.periodSeconds <= 10,
    );
  }
  if (container.name === 'backend') {
    assert.deepEqual(
      container.args,
      ['serve', '--check-schema'],
      'Runtime must never migrate',
    );
    assert.equal(env.FLEETIQ_BIND_ADDRESS.value, '0.0.0.0:8080');
    assert.equal(env.FLEETIQ_BROWSER_ORIGIN.value, 'https://fleet.local.test');
    secretReference(env.DATABASE_URL);
    secretReference(env.FLEETIQ_OIDC_CLIENT_SECRET);
    const issuer = new URL(env.FLEETIQ_OIDC_ISSUER.value);
    assert(
      issuer.protocol === 'https:' &&
        !issuer.username &&
        !issuer.password &&
        !issuer.search &&
        !issuer.hash &&
        !issuer.port,
      'Trusted HTTPS OIDC required',
    );
    assert(
      env.FLEETIQ_OIDC_CLIENT_ID.value && env.FLEETIQ_OIDC_IDENTITY_AUTHORITY.value,
    );
    const trust = pod.volumes.find((volume) => volume.name === 'database-trust');
    assert(
      trust?.configMap?.name && trust.configMap.items[0].path === 'ca.crt',
      'Database CA reference required',
    );
    assert(
      container.volumeMounts.some(
        (mount) =>
          mount.name === 'database-trust' &&
          mount.mountPath === '/etc/fleetiq/database' &&
          mount.readOnly === true,
      ),
    );
    const oidcTrust = pod.volumes.find((volume) => volume.name === 'oidc-trust');
    if (oidcTrust) {
      assert(oidcTrust.configMap?.name);
      assert.equal(
        env.FLEETIQ_OIDC_ADDITIONAL_CA_BUNDLE?.value,
        '/etc/fleetiq/oidc/ca.crt',
      );
      assert(
        container.volumeMounts.some(
          (mount) =>
            mount.name === 'oidc-trust' &&
            mount.readOnly === true &&
            mount.mountPath === '/etc/fleetiq/oidc',
        ),
      );
    }
    const expected = [
      'DATABASE_URL',
      'FLEETIQ_BIND_ADDRESS',
      'FLEETIQ_BROWSER_ORIGIN',
      'FLEETIQ_OIDC_CLIENT_ID',
      'FLEETIQ_OIDC_CLIENT_SECRET',
      'FLEETIQ_OIDC_IDENTITY_AUTHORITY',
      'FLEETIQ_OIDC_ISSUER',
      ...(oidcTrust ? ['FLEETIQ_OIDC_ADDITIONAL_CA_BUNDLE'] : []),
    ];
    assert.deepEqual(Object.keys(env).sort(), expected.sort());
    for (const kind of ['startupProbe', 'readinessProbe', 'livenessProbe'])
      assert.deepEqual(container[kind].httpGet, {
        path: kind === 'livenessProbe' ? '/health/live' : '/health/ready',
        port: 'http',
      });
  } else {
    assert.equal(container.name, 'edge');
    assert(!container.args);
    assert.equal(pod.volumes.length, 1);
    assert.deepEqual(Object.keys(env).sort(), [
      'FLEETIQ_API_UPSTREAM',
      'FLEETIQ_PUBLIC_AUTHORITY',
    ]);
    assert.equal(env.FLEETIQ_PUBLIC_AUTHORITY.value, 'fleet.local.test');
    assert.equal(env.FLEETIQ_API_UPSTREAM.value, 'fleetiq-backend:8080');
    for (const kind of ['startupProbe', 'readinessProbe', 'livenessProbe'])
      assert.deepEqual(container[kind].exec, {
        command: ['wget', '-q', '--spider', 'http://127.0.0.1:8081/ready'],
      });
  }
}
