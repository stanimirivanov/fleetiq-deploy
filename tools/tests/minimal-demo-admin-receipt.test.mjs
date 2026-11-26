import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { root, run } from '../process.mjs';

const attemptLabel = 'k8s-infrastructure.io/demo-attempt';
const digest = `sha256:${'1'.repeat(64)}`;
const launcher = 'demo-launch-111111111111111111111111';
const namespace = 'qual-fleet-data';
const name = 'expiry-01';
const backend = `ghcr.io/stanimirivanov/fleetiq-platform@sha256:${'2'.repeat(64)}`;
const imageID = `sha256:${'3'.repeat(64)}`;
const uid = 'job-uid';
const podUID = 'pod-uid';
const containerID = 'containerd://container-id';
const labels = { [attemptLabel]: launcher };
const controllerLabels = {
  'batch.kubernetes.io/controller-uid': uid,
  'batch.kubernetes.io/job-name': name,
  'controller-uid': uid,
  'job-name': name,
};
const timestamp = (second) => `2026-11-26T12:00:${second}Z`;
const receipt = resolve(root, 'operations/minimal-demo/administration/job-receipt.jq');

function fixture() {
  const rendered = {
    apiVersion: 'batch/v1',
    kind: 'Job',
    metadata: { name, namespace, labels },
    spec: {
      backoffLimit: 0,
      parallelism: 1,
      completions: 1,
      activeDeadlineSeconds: 300,
      podReplacementPolicy: 'Failed',
      template: {
        metadata: { labels },
        spec: {
          restartPolicy: 'Never',
          automountServiceAccountToken: false,
          serviceAccountName: launcher.replace('launch', 'run'),
          enableServiceLinks: false,
          terminationGracePeriodSeconds: 60,
          nodeSelector: {
            'k8s-infrastructure.io/consumer': 'qual-fleet',
            'k8s-infrastructure.io/role': 'worker',
          },
          containers: [
            {
              name: 'operation',
              image: backend,
              imagePullPolicy: 'Never',
              command: ['/usr/local/bin/fleetiq-server'],
              args: ['expire-history-once'],
              env: [
                {
                  name: 'DATABASE_URL',
                  valueFrom: {
                    secretKeyRef: {
                      name: 'fleetiq-db-expire-history-once-url',
                      key: 'url',
                    },
                  },
                },
                { name: 'FLEETIQ_HISTORY_CLEANUP_TENANT_ID', value: 'test-tenant' },
              ],
              volumeMounts: [
                {
                  name: 'database-ca',
                  mountPath: '/etc/fleetiq/database',
                  readOnly: true,
                },
              ],
            },
          ],
          volumes: [
            { name: 'database-ca', configMap: { name: 'workload-database-ca' } },
          ],
        },
      },
    },
  };
  const job = structuredClone(rendered);
  Object.assign(job.metadata, { uid, creationTimestamp: timestamp('01') });
  Object.assign(job.spec, {
    suspend: false,
    manualSelector: false,
    completionMode: 'NonIndexed',
    selector: { matchLabels: { 'batch.kubernetes.io/controller-uid': uid } },
  });
  Object.assign(job.spec.template.metadata, {
    creationTimestamp: null,
    labels: { ...labels, ...controllerLabels },
  });
  Object.assign(job.spec.template.spec, {
    dnsPolicy: 'ClusterFirst',
    schedulerName: 'default-scheduler',
    serviceAccount: job.spec.template.spec.serviceAccountName,
  });
  job.spec.template.spec.volumes[0].configMap.defaultMode = 420;
  Object.assign(job.spec.template.spec.containers[0], {
    terminationMessagePath: '/dev/termination-log',
    terminationMessagePolicy: 'File',
  });
  job.status = { conditions: [{ type: 'Complete', status: 'True' }], succeeded: 1 };
  const pod = {
    metadata: {
      name: `${name}-abcde`,
      uid: podUID,
      namespace,
      creationTimestamp: timestamp('02'),
      labels: job.spec.template.metadata.labels,
      ownerReferences: [
        { apiVersion: 'batch/v1', kind: 'Job', name, uid, controller: true },
      ],
    },
    spec: {
      ...structuredClone(job.spec.template.spec),
      nodeName: 'qual-fleet-local-worker',
      priority: 0,
      preemptionPolicy: 'PreemptLowerPriority',
      tolerations: ['not-ready', 'unreachable'].map((condition) => ({
        key: `node.kubernetes.io/${condition}`,
        operator: 'Exists',
        effect: 'NoExecute',
        tolerationSeconds: 300,
      })),
    },
    status: {
      phase: 'Succeeded',
      containerStatuses: [
        {
          name: 'operation',
          imageID: `ghcr.io/stanimirivanov/fleetiq-platform@${imageID}`,
          containerID,
          restartCount: 0,
          state: {
            terminated: {
              startedAt: timestamp('03'),
              finishedAt: timestamp('05'),
              exitCode: 0,
              containerID,
            },
          },
        },
      ],
    },
  };
  return {
    rendered,
    job,
    pods: { items: [pod] },
    logPod: structuredClone(pod),
    log: '2026-11-26T12:00:04.012345678Z history cleanup restores=0 exports=0 export_leases=0\n',
    submission: { metadata: { uid } },
    submissionIntent: {
      target: 'qual-fleet-local',
      namespace,
      name,
      incarnation: 'qualification-incarnation',
      launcher,
      mode: 'expire',
      deployment: '4'.repeat(40),
      backend,
      operationDigest: digest,
      imageID,
      intentAt: timestamp('00'),
    },
  };
}

function observe(mutate = () => {}) {
  const attempt = fixture();
  mutate(attempt);
  const directory = mkdtempSync(join(tmpdir(), 'fleetiq-admin-receipt-test-'));
  try {
    const inputs = [
      'rendered',
      'job',
      'pods',
      'logPod',
      'log',
      'submission',
      'submissionIntent',
    ].flatMap((key) => {
      const file = join(directory, key);
      const raw = key === 'log';
      writeFileSync(file, raw ? attempt[key] : JSON.stringify(attempt[key]), {
        mode: 0o600,
      });
      return [raw ? '--rawfile' : '--slurpfile', key, file];
    });
    return JSON.parse(run('jq', ['-n', ...inputs, '-f', receipt]));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test('an exact terminal job with a correlated zero marker reports execution only', () => {
  const observed = observe();
  assert.equal(observed.execution, 'exited-zero');
  assert.deepEqual(observed.application, {
    outcome: 'cleanup-reported',
    restores: 0,
    exports: 0,
    exportLeases: 0,
  });
});

test('an observed Job retains its original UID when the submission response is lost', () => {
  const observed = observe((attempt) => {
    attempt.submission = null;
  });
  assert.equal(observed.execution, 'exited-zero');
  assert.equal(observed.jobUID, uid);
  assert.equal(observed.podUID, podUID);
});

for (const [finding, change] of [
  [
    'unrelated provider digest',
    ({ submissionIntent }) => {
      submissionIntent.operationDigest = `sha256:${'a'.repeat(64)}`;
    },
  ],
  [
    'old same-name Job after uncertain submission',
    (attempt) => {
      attempt.submission = null;
      const { job } = attempt;
      job.metadata.creationTimestamp = '2026-11-26T11:59:59Z';
    },
  ],
  [
    'foreign container image',
    ({ submissionIntent }) => {
      submissionIntent.imageID = `sha256:${'a'.repeat(64)}`;
    },
  ],
  [
    'modified Job command',
    ({ job }) => {
      job.spec.template.spec.containers[0].command = ['/bin/true'];
    },
  ],
  [
    'modified Pod args',
    ({ pods }) => {
      pods.items[0].spec.containers[0].args = ['serve'];
    },
  ],
  [
    'different Secret key',
    ({ pods }) => {
      pods.items[0].spec.containers[0].env[0].valueFrom.secretKeyRef.key = 'other';
    },
  ],
  [
    'different input ConfigMap',
    ({ pods }) => {
      pods.items[0].spec.volumes[0].configMap.name = 'another-ca';
    },
  ],
  [
    'mislabeled routine Pod',
    ({ pods }) => {
      pods.items[0].metadata.labels['k8s-infrastructure.io/demo-routine'] = 'true';
    },
  ],
  [
    'zero marker outside the container lifetime',
    (attempt) => {
      attempt.log = attempt.log.replace('12:00:04.', '11:59:59.');
    },
  ],
  [
    'zero marker from a different Pod UID',
    ({ logPod }) => {
      logPod.metadata.uid = 'foreign-pod';
    },
  ],
  [
    'zero marker from a different process',
    ({ logPod }) => {
      logPod.status.containerStatuses[0].containerID = 'containerd://different';
    },
  ],
  [
    'untimestamped zero marker',
    (attempt) => {
      attempt.log = attempt.log.slice(31);
    },
  ],
  [
    'another operation receipt mixed with the expected marker',
    (attempt) => {
      attempt.log += '2026-11-26T12:00:04Z current-state rebuild committed\n';
    },
  ],
  [
    'conflicting producer receipts',
    (attempt) => {
      attempt.log += attempt.log.replace('restores=0', 'restores=1');
    },
  ],
]) {
  test(`a receipt leaves ${finding} uncertain`, () => {
    const observed = observe(change);
    assert.equal(observed.execution, 'uncertain');
    assert.equal(observed.application, undefined);
  });
}
