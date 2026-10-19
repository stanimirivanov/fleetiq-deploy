import assert from 'node:assert/strict';
import { cpu, memory } from './resource-policy.mjs';

/** Preview quotas must admit the selected Pods plus one replacement per workload. */
export function budgetPolicy(resources) {
  for (const namespace of ['fleetiq-local', 'fleetiq-data']) {
    const quota = resources.find(
      (item) => item.kind === 'ResourceQuota' && item.metadata.namespace === namespace,
    ).spec.hard;
    const workloads = resources.filter(
      (item) =>
        ['Deployment', 'Cluster'].includes(item.kind) &&
        item.metadata.namespace === namespace,
    );
    const podCount = (item) =>
      item.kind === 'Cluster'
        ? item.spec.instances + 1
        : item.spec.replicas > 0
          ? item.spec.replicas + 1
          : 0;
    const requests = (item) =>
      item.kind === 'Cluster'
        ? item.spec.resources
        : item.spec.template.spec.containers[0].resources;
    for (const [type, parse] of [
      ['cpu', cpu],
      ['memory', memory],
    ]) {
      for (const kind of ['requests', 'limits']) {
        const allowance = parse(quota[`${kind}.${type}`]);
        const required = workloads.reduce(
          (sum, item) => sum + podCount(item) * parse(requests(item)[kind][type]),
          0,
        );
        assert(
          Number.isFinite(allowance) && allowance > 0 && required <= allowance,
          'Quota cannot accommodate selected workload/replacement',
        );
      }
    }
    assert(
      workloads.reduce((sum, item) => sum + podCount(item), 0) <= Number(quota.pods),
    );
    if (namespace === 'fleetiq-data') {
      const [cluster] = workloads;
      assert(podCount(cluster) <= Number(quota.persistentvolumeclaims));
      assert(
        podCount(cluster) * memory(cluster.spec.storage.size) <=
          memory(quota['requests.storage']),
        'Storage quota lacks replacement headroom',
      );
    }
  }
}
