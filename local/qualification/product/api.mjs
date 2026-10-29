import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
export const tenant = '/api/v1/tenants/tenant-a';
export const packagePath = `${tenant}/protocol-packages/vendor.teltonika/versions/qualification-1`;
/** Run native same-origin browser fetch: real cookies, Origin, CSRF and response parsing. */
export async function api(
  page,
  path,
  { method = 'GET', body, status, csrf = true, wasm = false } = {},
) {
  assert(path.startsWith('/api/v1/'));
  const result = await page.evaluate(
    async ({ path, method, body, csrf, wasm }) => {
      const headers = {};
      if (csrf && method !== 'GET') headers['X-FleetIQ-CSRF'] = '1';
      if (body !== undefined)
        headers['Content-Type'] = wasm ? 'application/wasm' : 'application/json';
      const response = await fetch(path, {
        method,
        headers,
        credentials: 'same-origin',
        redirect: 'error',
        signal: AbortSignal.timeout(15000),
        ...(body === undefined
          ? {}
          : { body: wasm ? Uint8Array.from(body) : JSON.stringify(body) }),
      });
      const text = await response.text();
      if (text.length > 1048576) throw new Error('Response budget exceeded');
      return { status: response.status, body: text ? JSON.parse(text) : null };
    },
    { path, method, body, csrf, wasm },
  );
  if (status !== undefined)
    assert.equal(result.status, status, `HTTP contract failed: ${method} ${path}`);
  else
    assert(
      result.status >= 200 && result.status < 300,
      `HTTP contract failed: ${method} ${path} (${result.status})`,
    );
  return result.body;
}
export const currentPath = (asset = 'asset-main') =>
  `${tenant}/assets/${asset}/properties/position.latitude/versions/1/current`;
export async function binding(page, axis, target, revision = 1, start = 0) {
  return api(page, `${tenant}/signal-bindings/location-${axis}/revisions/${revision}`, {
    method: 'POST',
    body: {
      source: {
        device_asset_id: 'gateway-1',
        endpoint_id: 'main',
        signal_id: `gps.${axis}_e7`,
      },
      target: { asset_id: target, property: { id: `position.${axis}`, version: 1 } },
      effective_interval: { start_ms: start, end_ms: null },
    },
  });
}
export async function seed(page) {
  await api(page, '/api/v1/admin/actors', {
    method: 'POST',
    body: {
      provisioning_id: 'actor-b',
      actor_id: 'operator-b',
      external_identity: { authority_id: 'qualification-oidc', subject: 'operator-b' },
    },
  });
  for (const [id, actor] of [
    ['tenant-a', 'operator-a'],
    ['tenant-b', 'operator-b'],
  ])
    await api(page, '/api/v1/admin/tenants', {
      method: 'POST',
      body: {
        provisioning_id: id,
        tenant_id: id,
        initial_administrator_actor_id: actor,
      },
    });
  for (const action of ['telemetry.read', 'protocol.manage'])
    await api(page, `${tenant}/actors/operator-a/access-changes`, {
      method: 'POST',
      body: { change_id: `grant-${action}`, kind: 'grant', action },
    });
  await api(page, '/api/v1/tenants/tenant-b/assets', { status: 403 });
  await api(page, `${tenant}/properties`, {
    method: 'POST',
    csrf: false,
    body: {
      id: 'must-not-exist',
      version: 1,
      name: 'Rejected',
      value_kind: 'integer',
      canonical_unit: null,
    },
    status: 403,
  });
  const properties = ['latitude', 'longitude'].map((axis) => ({
    id: `position.${axis}`,
    version: 1,
  }));
  for (const property of properties)
    await api(page, `${tenant}/properties`, {
      method: 'POST',
      body: {
        ...property,
        name: property.id,
        value_kind: 'integer',
        canonical_unit: null,
      },
    });
  await api(page, `${tenant}/asset-types`, {
    method: 'POST',
    body: {
      id: 'equipment',
      version: 1,
      name: 'Qualification equipment',
      supported_properties: properties,
    },
  });
  for (const id of ['gateway-1', 'asset-main', 'asset-secondary'])
    await api(page, `${tenant}/assets`, {
      method: 'POST',
      body: {
        id,
        name: id,
        asset_type: { id: 'equipment', version: 1 },
        external_identifiers:
          id === 'gateway-1'
            ? [{ kind: 'imei', authority: null, value: '350000000000001' }]
            : [],
      },
    });
  await api(page, `${tenant}/assets/gateway-1/device`, {
    method: 'POST',
    body: {
      endpoints: [{ id: 'main', kind: 'native.avl', name: 'Native GPS telemetry' }],
    },
  });
  const wasm = readFileSync('/artifacts/teltonika.wasm');
  assert(
    wasm.length > 8 && wasm.length <= 8 * 1024 * 1024,
    'Expected bounded compiled Wasm component',
  );
  assert.equal(
    wasm.readUInt32LE(4),
    0x1000d,
    'Upload the componentized guest, not a core Wasm module',
  );
  await api(page, packagePath, { method: 'PUT', wasm: true, body: [...wasm] });
  for (const world of ['runtime-v1', 'identity-v1'])
    await api(page, `${packagePath}/admissions`, { method: 'POST', body: { world } });
  await api(page, `${tenant}/assets/gateway-1/protocol-routes/teltonika-tcp`, {
    method: 'PUT',
    body: {
      expected_revision: 0,
      selection: {
        package_id: 'vendor.teltonika',
        package_version: 'qualification-1',
        world: 'identity-v1',
      },
    },
  });
  for (const axis of ['latitude', 'longitude']) await binding(page, axis, 'asset-main');
}
