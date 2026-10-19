import assert from 'node:assert/strict';
import { isIP } from 'node:net';

/** Reject broad allows; actual CNI enforcement/translated destinations require D06. */
export function networkPolicy(resource) {
  const spec = resource.spec;
  assert.deepEqual(spec.policyTypes, ['Ingress', 'Egress']);
  if (resource.metadata.name.endsWith('-default-deny')) {
    assert.deepEqual(spec.podSelector, {});
    assert(!spec.ingress && !spec.egress, 'Default deny must not allow traffic');
    return;
  }
  assert(Object.keys(spec.podSelector.matchLabels ?? {}).length > 0);
  for (const direction of ['ingress', 'egress']) {
    const rules = spec[direction];
    assert(
      Array.isArray(rules) && rules.length > 0,
      'Explicit network directions required',
    );
    for (const rule of rules) {
      assert(rule.ports?.length > 0, 'All-port allows refused');
      for (const port of rule.ports) {
        assert(['TCP', 'UDP'].includes(port.protocol));
        assert(Number.isInteger(port.port) && port.port > 0 && port.port <= 65535);
        assert(!port.endPort, 'Port ranges refused');
      }
      const peers = rule[direction === 'ingress' ? 'from' : 'to'];
      assert(peers?.length > 0, 'All-peer allows refused');
      for (const peer of peers) {
        if (peer.ipBlock) {
          const [address, prefix] = peer.ipBlock.cidr.split('/');
          assert.equal(direction, 'egress');
          assert.equal(isIP(address), 4, 'Invalid destination CIDR');
          assert(
            Number(prefix) >= 16 && Number(prefix) <= 32,
            'Overbroad destination CIDR',
          );
          assert(!peer.ipBlock.except && !peer.namespaceSelector && !peer.podSelector);
        } else {
          assert(
            Object.keys(peer.podSelector?.matchLabels ?? {}).length > 0,
            'Pod-scoped peer required',
          );
          assert(
            !peer.podSelector.matchExpressions,
            'Expression peer outside reviewed contract',
          );
          if (peer.namespaceSelector)
            assert.deepEqual(Object.keys(peer.namespaceSelector.matchLabels ?? {}), [
              'kubernetes.io/metadata.name',
            ]);
        }
      }
    }
  }
}
