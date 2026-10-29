/** Fixed operation identifiers, never request paths, bodies or credential-bearing URLs. */
const operations = new Set([
  'reject-missing-csrf',
  'provision-actor',
  'provision-tenant',
  'cross-tenant-read',
  'change-tenant-access',
  'register-property',
  'register-type',
  'register-asset',
  'register-device',
  'upload-package',
  'admit-package',
  'select-protocol-route',
  'append-signal-binding',
  'operator-session',
  'operator-logout',
  'other-api',
]);
export function apiOperation(path, method, csrf) {
  if (method !== 'GET' && !csrf) return 'reject-missing-csrf';
  if (path === '/api/v1/admin/actors') return 'provision-actor';
  if (path === '/api/v1/admin/tenants') return 'provision-tenant';
  if (path === '/api/v1/tenants/tenant-b/assets') return 'cross-tenant-read';
  if (path === '/api/v1/auth/session') return 'operator-session';
  if (path === '/api/v1/auth/logout') return 'operator-logout';
  for (const [suffix, operation] of [
    ['/access-changes', 'change-tenant-access'],
    ['/properties', 'register-property'],
    ['/asset-types', 'register-type'],
    ['/assets', 'register-asset'],
    ['/device', 'register-device'],
    ['/admissions', 'admit-package'],
  ])
    if (path.endsWith(suffix)) return operation;
  if (path.includes('/protocol-routes/')) return 'select-protocol-route';
  if (path.includes('/signal-bindings/')) return 'append-signal-binding';
  if (method === 'PUT' && path.includes('/protocol-packages/')) return 'upload-package';
  return 'other-api';
}
export function formatApiFailure(operation, status, expected) {
  if (
    !operations.has(operation) ||
    !Number.isInteger(status) ||
    status < 100 ||
    status > 599 ||
    (expected !== undefined &&
      (!Number.isInteger(expected) || expected < 100 || expected > 599))
  )
    throw new Error('Invalid API diagnostic');
  return `FleetIQ API failure: operation=${operation}; status=${status}; expected=${expected ?? '2xx'}`;
}
export function parseApiFailure(text) {
  const value =
    /^FleetIQ API failure: operation=([a-z-]+); status=([1-5][0-9]{2}); expected=(2xx|[1-5][0-9]{2})\r?$/mu.exec(
      text,
    );
  return value && operations.has(value[1])
    ? { operation: value[1], status: Number(value[2]), expected: value[3] }
    : undefined;
}
