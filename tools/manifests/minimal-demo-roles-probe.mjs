import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';
import {
  consumerLabel,
  demoNamespaces,
  namespaceLabel,
} from './minimal-demo-network.mjs';
import {
  bootstrap,
  credentialStateSql,
  grantSql,
  ledgerCheck,
  roleFixtureSql,
  roleLoginSql,
  runtimeCommands,
  sha256,
  verifyPrivileges,
} from './minimal-demo-roles.mjs';

import { postgresAmd64Manifest } from './minimal-demo-roles-render.mjs';

const uid = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/u;
const digest = /^sha256:[a-f0-9]{64}$/u;
const rowId = /^[a-zA-Z0-9_.:-]{1,128}$/u;
const format = 'fleetiq-minimal-demo-data-probe.v1';
const ready = (item) =>
  item.status?.conditions?.some(
    ({ type, status }) => type === 'Ready' && status === 'True',
  );

function requireCheck(condition, reason) {
  assert(condition, `Minimal-demo database probe: ${reason}`);
}

export function validateRoleProbeRequest(request) {
  const { consumer, target, candidate, stage, caDigest, port, observation } = request;
  const keysAre = (object, keys) =>
    object && typeof object === 'object' && Object.keys(object).sort().join() === keys;
  requireCheck(
    keysAre(
      request,
      stage?.endsWith?.('-restart')
        ? 'caDigest,candidate,consumer,observation,port,stage,target'
        : 'caDigest,candidate,consumer,port,stage,target',
    ) &&
      keysAre(
        target,
        'claimUid,clusterUid,name,namespaceUids,podUid,volumeUid,workerUid',
      ),
    'unexpected request or target fields',
  );
  const spaces = demoNamespaces(consumer);
  requireCheck(
    consumer.startsWith('qual-') &&
      target.name === `${consumer}-local` &&
      keysAre(target.namespaceUids, 'apps,data,support,system') &&
      [
        ...Object.values(target.namespaceUids),
        target.workerUid,
        target.clusterUid,
        target.podUid,
        target.claimUid,
        target.volumeUid,
      ].every((value) => typeof value === 'string' && uid.test(value)),
    'require a positively identified disposable target, exact primary and retained claim',
  );
  requireCheck(
    ['grant', 'bootstrap', 'runtime', 'before-restart', 'after-restart'].includes(
      stage,
    ) &&
      typeof candidate === 'string' &&
      digest.test(candidate) &&
      typeof caDigest === 'string' &&
      digest.test(caDigest) &&
      Number.isSafeInteger(port) &&
      port >= 1024 &&
      port <= 65535,
    'select the reviewed candidate, database CA and local tunnel port',
  );
  const retains = stage.endsWith('-restart');
  requireCheck(
    retains
      ? keysAre(observation, 'commissioningReceipt,message,tenant') &&
          [observation.tenant, observation.message].every(
            (value) => typeof value === 'string' && rowId.test(value),
          ) &&
          typeof observation.commissioningReceipt === 'string' &&
          digest.test(observation.commissioningReceipt)
      : observation === undefined,
    'select one bounded commissioned observation and the authenticated commissioning receipt',
  );
  return {
    spaces,
    phase:
      stage === 'grant'
        ? 'installation'
        : stage === 'bootstrap'
          ? 'bootstrap'
          : 'runtime',
  };
}

function inspectTarget(kube, request, profile, spaces) {
  const { consumer, target } = request;
  const get = (kind, name, ns) =>
    JSON.parse(
      kube([...(ns ? ['--namespace', ns] : []), 'get', kind, name, '-o', 'json']),
    );
  for (const [role, namespace] of Object.entries({
    ...spaces,
    system: 'kube-system',
  })) {
    const item = get('namespace', namespace);
    requireCheck(
      item.metadata.name === namespace &&
        item.metadata.uid === target.namespaceUids[role] &&
        item.metadata.labels?.[namespaceLabel] === namespace &&
        !item.metadata.deletionTimestamp &&
        item.status?.phase === 'Active' &&
        (role === 'system' || item.metadata.labels?.[consumerLabel] === consumer),
      'namespace incarnation or delegation differs',
    );
  }
  const nodeName = `${target.name}-worker`;
  const worker = get('node', nodeName);
  requireCheck(
    worker.metadata.name === nodeName &&
      worker.metadata.uid === target.workerUid &&
      worker.status?.nodeInfo?.architecture === 'amd64' &&
      worker.status.nodeInfo.operatingSystem === 'linux' &&
      worker.metadata.labels?.[consumerLabel] === consumer &&
      worker.metadata.labels?.['k8s-infrastructure.io/role'] === 'worker' &&
      !worker.metadata.deletionTimestamp &&
      ready(worker),
    'worker incarnation or readiness differs',
  );
  const name = profile.cluster.metadata.name;
  const cluster = get('clusters.postgresql.cnpg.io', name, spaces.data);
  const desired = profile.cluster.spec;
  const reconciled = new Set(cluster.status?.managedRolesStatus?.byStatus?.reconciled);
  const actual = cluster.spec;
  requireCheck(
    cluster.metadata.name === name &&
      cluster.metadata.namespace === spaces.data &&
      cluster.metadata.uid === target.clusterUid &&
      !cluster.metadata.deletionTimestamp &&
      Object.entries(profile.cluster.metadata.annotations).every(
        ([key, value]) => cluster.metadata.annotations?.[key] === value,
      ) &&
      actual.imageName === desired.imageName &&
      actual.instances === 1 &&
      actual.enableSuperuserAccess === false &&
      actual.primaryUpdateStrategy === 'supervised' &&
      actual.storage?.storageClass === 'local-retained' &&
      actual.storage?.size === '4Gi' &&
      isDeepStrictEqual(actual.resources, desired.resources) &&
      ['database', 'owner'].every(
        (key) => actual.bootstrap?.initdb?.[key] === desired.bootstrap.initdb[key],
      ) &&
      actual.bootstrap.initdb.secret?.name === desired.bootstrap.initdb.secret.name &&
      !actual.superuserSecret &&
      actual.postgresql?.parameters?.max_connections === '64' &&
      actual.postgresql.parameters.password_encryption === 'scram-sha-256' &&
      isDeepStrictEqual(actual.postgresql.pg_hba, desired.postgresql.pg_hba) &&
      isDeepStrictEqual(
        actual.managed?.roles?.map((role) => ({
          superuser: false,
          createdb: false,
          createrole: false,
          replication: false,
          bypassrls: false,
          login: false,
          inRoles: [],
          ...role,
        })),
        desired.managed.roles,
      ) &&
      desired.managed.roles.every((role) => reconciled.has(role.name)) &&
      ready(cluster) &&
      cluster.status.readyInstances === 1,
    'installed CNPG configuration or role reconciliation differs',
  );
  const primary = cluster.status.currentPrimary;
  requireCheck(
    /^fleetiq-db-[1-9][0-9]*$/u.test(primary) &&
      (!cluster.status.targetPrimary || cluster.status.targetPrimary === primary),
    'require one stable primary',
  );
  const pod = get('pod', primary, spaces.data);
  const pg = pod.spec?.containers?.find(({ name }) => name === 'postgres');
  const status = pod.status?.containerStatuses?.find(({ name }) => name === 'postgres');
  const imageId = status?.imageID
    ?.split('@')
    .at(-1)
    .replace(/^[a-z-]+:\/\//u, '');
  requireCheck(
    pod.metadata.name === primary &&
      pod.metadata.namespace === spaces.data &&
      pod.metadata.uid === target.podUid &&
      !pod.metadata.deletionTimestamp &&
      pod.metadata.ownerReferences?.some(
        (ref) =>
          ref.kind === 'Cluster' &&
          ref.name === name &&
          ref.uid === target.clusterUid &&
          ref.controller,
      ) &&
      pod.spec?.nodeName === nodeName &&
      !pod.spec.hostNetwork &&
      ready(pod) &&
      pg?.image === desired.imageName &&
      [desired.imageName.split('@')[1], postgresAmd64Manifest].includes(imageId) &&
      isDeepStrictEqual(pg.resources, desired.resources) &&
      status.ready &&
      !pg.ports?.some(({ hostPort }) => hostPort),
    'running primary identity, image, placement or effective resource bounds differ',
  );
  const claimName = pod.spec.volumes?.find(({ name }) => name === 'pgdata')
    ?.persistentVolumeClaim?.claimName;
  requireCheck(claimName === primary, 'primary must use its exact retained claim');
  const claim = get('pvc', claimName, spaces.data);
  const volumeName = claim.spec?.volumeName;
  requireCheck(
    claim.metadata.namespace === spaces.data &&
      claim.metadata.name === claimName &&
      claim.metadata.uid === target.claimUid &&
      !claim.metadata.deletionTimestamp &&
      claim.spec.storageClassName === 'local-retained' &&
      claim.spec.resources?.requests?.storage === '4Gi' &&
      claim.status?.phase === 'Bound' &&
      typeof volumeName === 'string' &&
      /^[a-z0-9][-a-z0-9.]{0,252}$/u.test(volumeName),
    'primary claim ownership, binding or retained storage size differs',
  );
  const volume = get('pv', volumeName);
  const storage = get('storageclass', 'local-retained');
  requireCheck(
    volume.metadata.name === volumeName &&
      volume.metadata.uid === target.volumeUid &&
      !volume.metadata.deletionTimestamp &&
      volume.status?.phase === 'Bound' &&
      volume.spec.storageClassName === 'local-retained' &&
      volume.spec.persistentVolumeReclaimPolicy === 'Retain' &&
      volume.spec.claimRef?.uid === target.claimUid &&
      volume.spec.claimRef.namespace === spaces.data &&
      volume.spec.claimRef.name === claimName &&
      storage.reclaimPolicy === 'Retain',
    'retained volume or storage class differs',
  );
  return { primary, imageId, restartCount: status.restartCount };
}

const databaseIdentitySql = `
SELECT json_build_object('databaseOid', oid::text, 'startedMicros',
    (extract(epoch FROM pg_postmaster_start_time()) * 1000000)::bigint::text,
    'primary', NOT pg_is_in_recovery())
FROM pg_database WHERE datname = current_database();`;

function readDatabaseIdentity(output) {
  const identity = JSON.parse(output);
  requireCheck(
    /^[1-9][0-9]{0,11}$/u.test(identity.databaseOid) &&
      /^[1-9][0-9]{0,19}$/u.test(identity.startedMicros) &&
      identity.primary === true,
    'database primary identity unavailable',
  );
  return identity;
}

function bindLogin(login, command, identity, sql) {
  const output = login(
    command,
    `${databaseIdentitySql}
${sql}`,
  );
  const [raw, ...result] = output.split('\n');
  requireCheck(
    isDeepStrictEqual(readDatabaseIdentity(raw), identity),
    'private TLS connection identifies a different primary',
  );
  return result.join('\n');
}

const runtimeStats = `
SELECT json_build_object('max', current_setting('max_connections')::integer,
  'reserved', current_setting('reserved_connections')::integer +
              current_setting('superuser_reserved_connections')::integer,
  'connections', coalesce((SELECT json_object_agg(usename, total) FROM
    (SELECT usename, count(*)::integer total FROM pg_stat_activity
     WHERE datname = current_database() AND backend_type = 'client backend'
       AND pid <> pg_backend_pid() GROUP BY usename) grouped), '{}'::json));`;

function retentionSql({ tenant, message }) {
  return `
BEGIN READ ONLY;
SET LOCAL statement_timeout = '5s';
SELECT json_agg(evidence ORDER BY evidence::text) FROM (
  SELECT to_jsonb(e) AS evidence FROM history.asset_property_changes e
  WHERE e.tenant_id = '${tenant}' AND e.message_id = '${message}' LIMIT 17
) selected;
ROLLBACK;`;
}

export function qualifyMinimalDemoRoles(
  request,
  { profile, inputs, source, kube, admin, login, rejectCleartext, fixture, previous },
) {
  const { spaces, phase } = validateRoleProbeRequest(request);
  const { stage, candidate, target, caDigest, observation } = request;
  requireCheck(
    profile.candidate === candidate,
    'reviewed role candidate differs from the locally rendered selection',
  );
  const receipt = {
    format,
    stage,
    candidate,
    target,
    source,
    caDigest,
    profile: profile.fingerprint,
    backendSelection: profile.backendSelection,
    outcome: 'failed',
    checks: [],
  };
  function check(name, action) {
    const item = { name, outcome: 'failed' };
    receipt.checks.push(item);
    const value = action();
    item.outcome = 'passed';
    return value;
  }
  try {
    const observed = check('target-primary-and-retained-claim', () =>
      inspectTarget(kube, request, profile, spaces),
    );
    receipt.postgres = {
      imageId: observed.imageId,
      platform: 'linux/amd64',
      primary: observed.primary,
      restartCount: observed.restartCount,
    };
    const privileged = (sql) => admin(observed.primary, sql);
    const identity = check('database-identity-and-credential-state', () => {
      const result = privileged(
        `${credentialStateSql(phase)}\n${ledgerCheck(inputs)}\n${databaseIdentitySql}`,
      );
      return readDatabaseIdentity(result);
    });
    receipt.postgres.started = sha256(identity.startedMicros);
    if (stage === 'grant') {
      check('exact-tls-migration-owner', () => {
        bindLogin(
          login,
          'migrate',
          identity,
          `${ledgerCheck(inputs)}
DO $$ BEGIN
  IF session_user <> 'fleetiq_migrator' OR
     NOT EXISTS (SELECT 1 FROM pg_stat_ssl WHERE pid = pg_backend_pid() AND ssl)
  THEN RAISE EXCEPTION 'Expected exact TLS migration owner'; END IF;
END $$;`,
        );
      });
      check('apply-exact-role-grants', () => {
        // The preflight verifies the loopback endpoint. Repeat the binding inside the
        // same SQL session and transaction that will mutate the object ACLs.
        const sql = grantSql(inputs, identity);
        bindLogin(login, 'migrate', identity, sql);
      });
      check('role-operations-and-queue-handoffs', () => {
        privileged(roleFixtureSql(inputs, fixture.sql, fixture.retention));
      });
    }
    check('exact-role-acls', () => privileged(verifyPrivileges(inputs)));
    const commands =
      phase === 'runtime' ? runtimeCommands : phase === 'bootstrap' ? [bootstrap] : [];
    for (const command of commands)
      check(`restricted-tls-login-${command.split(' ')[0]}`, () =>
        bindLogin(login, command, identity, roleLoginSql(inputs, command)),
      );
    if (phase === 'runtime') {
      check('initial-operator-bootstrap-recorded', () =>
        requireCheck(
          privileged('SELECT count(*) FROM identity.platform_bootstrap;') === '1',
          'checked initial operator bootstrap must be recorded before runtime admission',
        ),
      );
      check('cleartext-connection-denied', () => {
        requireCheck(
          rejectCleartext(),
          'expected an explicit server rejection of a non-TLS connection',
        );
        bindLogin(login, runtimeCommands[0], identity, 'SELECT 1;');
      });
    }
    if (observation) {
      receipt.retained = check('commissioned-observation-and-pool-sample', () => {
        const stats = JSON.parse(privileged(runtimeStats));
        const { pools, remaining } = profile.connections;
        requireCheck(
          stats.max === 64 &&
            Number.isSafeInteger(stats.reserved) &&
            stats.reserved >= 3 &&
            stats.reserved <= remaining,
          'unexpected PostgreSQL connection ceiling or reserved slots',
        );
        const product = Object.fromEntries(
          Object.entries(pools).map(([command, ceiling]) => {
            const role = `fleetiq_${command.replaceAll('-', '_')}`;
            const count = stats.connections[role] ?? 0;
            requireCheck(
              Number.isSafeInteger(count) && count >= 0 && count <= ceiling,
              'a product role exceeded its connection budget',
            );
            return [command, count];
          }),
        );
        const rows = JSON.parse(
          bindLogin(login, runtimeCommands[0], identity, retentionSql(observation)),
        );
        requireCheck(
          rows?.length > 0 && rows.length <= 16,
          'require a bounded commissioned observation',
        );
        receipt.poolSample = { maximum: stats.max, reserved: stats.reserved, product };
        return {
          commissioningReceipt: observation.commissioningReceipt,
          rows: rows.length,
          fingerprint: sha256(JSON.stringify(rows)),
        };
      });
    }
    if (stage === 'after-restart')
      check('retained-across-restart', () => {
        requireCheck(
          previous?.format === format &&
            previous.stage === 'before-restart' &&
            previous.outcome === 'passed' &&
            previous.candidate === candidate &&
            previous.caDigest === caDigest &&
            previous.profile === profile.fingerprint &&
            isDeepStrictEqual(previous.source, source) &&
            [
              'name',
              'namespaceUids',
              'workerUid',
              'clusterUid',
              'claimUid',
              'volumeUid',
            ].every((key) => isDeepStrictEqual(previous.target[key], target[key])) &&
            previous.postgres.imageId === receipt.postgres.imageId &&
            previous.postgres.started !== receipt.postgres.started &&
            isDeepStrictEqual(previous.retained, receipt.retained),
          'prior receipt, retained claim or observation differs, or PostgreSQL restart was not observed',
        );
      });
    check('stable-target-and-server', () => {
      requireCheck(
        isDeepStrictEqual(inspectTarget(kube, request, profile, spaces), observed) &&
          isDeepStrictEqual(
            readDatabaseIdentity(privileged(databaseIdentitySql)),
            identity,
          ),
        'target or server changed during probe',
      );
    });
    receipt.outcome = 'passed';
  } catch (error) {
    const prefix = 'Minimal-demo database probe: ';
    receipt.reason =
      error.code === 'ERR_ASSERTION' && error.message.startsWith(prefix)
        ? error.message.slice(prefix.length)
        : 'installed evidence command or SQL assertion failed';
    if (
      stage === 'grant' &&
      receipt.checks.some(({ name }) => name === 'apply-exact-role-grants')
    )
      receipt.recovery =
        'review grant transaction outcome before enabling the next phase';
  }
  return receipt;
}
