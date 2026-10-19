import assert from 'node:assert/strict';

export const digestImage = (value) => {
  assert.match(
    value ?? '',
    /^[a-z0-9.-]+(?::[0-9]+)?\/[a-z0-9._/-]+(?::[a-zA-Z0-9][a-zA-Z0-9._-]*)?@sha256:[a-f0-9]{64}$/u,
    'Digest-only image required',
  );
};
export const cpu = (v) =>
  Number(String(v).endsWith('m') ? String(v).slice(0, -1) / 1000 : v);
export const memory = (v) =>
  /^\d+(Mi|Gi)$/u.test(v ?? '')
    ? Number(v.slice(0, -2)) * (v.endsWith('Gi') ? 1024 : 1)
    : NaN;

export function resources(value) {
  for (const [key, parse, bound] of [
    ['cpu', cpu, 4],
    ['memory', memory, 8192],
  ]) {
    const requested = parse(value?.requests?.[key]);
    const limit = parse(value?.limits?.[key]);
    assert(
      Number.isFinite(requested) &&
        requested > 0 &&
        requested <= limit &&
        limit <= bound,
      'Invalid or unbounded resources',
    );
  }
}
