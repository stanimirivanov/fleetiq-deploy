import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { api, tenant } from './api.mjs';
import { waitPhase, writePhase } from './channel.mjs';
import { transmit } from './device.mjs';

const rule = 'latitude-spike';
const calculator = 'latitude-mad';
const scope = 'asset-main';
const windowMs = 6000;
const latitude = 515000000;
const output = 'anomaly.latitude';
const alerts = `${tenant}/alerts`;
const detail = `${alerts}/${rule}/revisions/1`;
const recovery = `${tenant}/work-recovery/notification`;
const put = (page, path, body, status) =>
  api(page, path, { method: 'PUT', body, status });

function grant(page, action) {
  return api(page, `${tenant}/actors/operator-a/access-changes`, {
    method: 'POST',
    body: { change_id: `grant-${action}`, kind: 'grant', action },
  });
}

async function activate(page) {
  for (const action of [
    'analytics.manage',
    'alerts.manage',
    'alerts.read',
    'alerts.acknowledge',
    'operations.read',
  ])
    await grant(page, action);
  const rules = `${tenant}/alert-rules/${rule}`;
  await put(page, `${rules}/revisions/1`, {
    kind: 'numeric-threshold-v1',
    calculator,
    version: '1',
    scope,
    target: scope,
    output_property: output,
    output_version: 1,
    output_index: 0,
    comparison: 'gt',
    threshold: '0',
    threshold_unit: null,
    hold_ms: 0,
    resolution: 'resolve_on_false',
    resolve_after_ms: 0,
  });
  await put(page, `${rules}/activation`, { expected_generation: 0, revision: 1 });
  const configuration = `${tenant}/calculator-configurations/${calculator}`;
  const first = Date.now() + windowMs;
  await put(page, `${configuration}/revisions/1`, {
    calculator,
    version: '1',
    scope,
    target: scope,
    first_start: first,
    window_ms: windowMs,
    lateness_ms: windowMs,
    minimum_samples: 4,
  });
  await put(page, `${configuration}/activation`, {
    expected_generation: 0,
    revision: 1,
  });
  return first;
}

/** Four real Codec 8 frames in one window: three flat baseline values and one final value. */
async function sendWindow(anchor, anomalous) {
  const start =
    anchor + windowMs * Math.max(0, Math.ceil((Date.now() + 1000 - anchor) / windowMs));
  await delay(Math.max(0, start - Date.now()));
  const last = anomalous ? latitude + 10000 : latitude;
  for (const [index, value] of [latitude, latitude, latitude, last].entries())
    await transmit(start + index, value, -1200000);
  return { end: String(start + windowMs), lastAt: start + 3, last };
}

async function observe(page, expect, phase, end) {
  // Missing intervening windows can advance last_event without changing the phase.
  await expect
    .poll(
      async () => {
        const list = await api(page, `${alerts}?phase=${phase}&limit=10`);
        const observed = list.alerts.find((entry) => entry.rule_id === rule);
        return observed && BigInt(observed.last_event_at_ms) >= BigInt(end);
      },
      { timeout: 90000 },
    )
    .toBe(true);
  return (await api(page, detail)).alert;
}

async function browserEvidence(page, expect, evaluation) {
  await page.goto(
    `https://fleet.test:8443/alerts?tenant=tenant-a&rule=${rule}&revision=1`,
  );
  await expect(
    page.getByRole('heading', { name: `${rule} · revision 1 · firing` }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Inspect latest transition evidence' }).click();
  await expect(
    page.getByText(`Evaluation ${evaluation} · outcome complete`),
  ).toBeVisible();
  await expect(
    page.getByText('4 retained input references', { exact: false }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Acknowledge displayed version' }).click();
  await expect(
    page.getByText(/Acknowledged version .* by operator-a/u).first(),
  ).toBeVisible();
}

async function recover(page, expect, candidate) {
  await page.goto(
    'https://fleet.test:8443/operations?tenant=tenant-a&kind=notification',
  );
  await page.getByRole('button', { name: /Review retry for latitude-spike/u }).click();
  await expect(
    page.getByText(`Expected generation ${candidate.expected_generation}`, {
      exact: true,
    }),
  ).toBeVisible();
  const [response] = await Promise.all([
    page.waitForResponse(
      (r) =>
        r.request().method() === 'PUT' &&
        new URL(r.url()).pathname.startsWith(`${recovery}/commands/`),
    ),
    page.getByRole('button', { name: 'Confirm retry' }).click(),
  ]);
  assert.equal(response.status(), 200);
  const receipt = await response.json();
  const body = { operation: 'retry', ...candidate };
  assert.deepEqual(response.request().postDataJSON(), body);
  const generation = String(BigInt(candidate.expected_generation) + 1n);
  await expect(
    page.getByText(new RegExp(`Recorded generation ${generation} by operator-a`, 'u')),
  ).toBeVisible();
  assert.deepEqual(
    await put(
      page,
      `${recovery}/commands/${encodeURIComponent(receipt.request_id)}`,
      body,
    ),
    receipt,
  );
}

export async function qualifyAnalyticsAlerts({
  page,
  expect,
  directory,
  checks,
  setStep,
}) {
  setStep('analytics-configure');
  const anchor = await activate(page);
  setStep('analytics-anomaly');
  const spike = await sendWindow(anchor, true);
  const firing = await observe(page, expect, 'firing', spike.end);
  assert.equal(firing.latest_transition.event_at_ms, spike.end);
  const id = firing.latest_transition.evidence.evaluation_id;
  const path = `${tenant}/assets/${scope}/calculator-evaluations/${encodeURIComponent(id)}`;
  const evidence = await api(page, path);
  assert.equal(evidence.evaluation.calculator.implementation, 'window-mad-v1');
  assert.equal(evidence.evaluation.input_count, 4);
  assert.equal(evidence.evaluation.window.end_at_ms, spike.end);
  const { outputs } = await api(page, `${path}/outputs?limit=10`);
  assert.equal(outputs.length, 1);
  assert.equal(outputs[0].property_id, output);
  assert.equal(outputs[0].value, '1');
  checks.push('tcp-anomaly-evidence');
  setStep('analytics-alert-browser');
  await browserEvidence(page, expect, id);
  const history = await api(page, `${detail}/transitions?limit=20`);
  assert.equal(
    history.transitions.filter((transition) => transition.phase === 'firing').length,
    1,
  );
  checks.push('installed-alert-browser');

  setStep('analytics-exhaustion');
  await expect
    .poll(
      async () => {
        const diagnostics = await api(page, `${tenant}/work-diagnostics`);
        const queue = diagnostics.queues.find(({ kind }) => kind === 'notification');
        return queue?.failed === 1 && queue.max_attempts === 5;
      },
      { timeout: 90000 },
    )
    .toBe(true);
  await api(page, recovery, { status: 403 });
  await put(
    page,
    `${recovery}/commands/denied`,
    { operation: 'pause', expected_generation: '0', target: {} },
    403,
  );
  await grant(page, 'operations.manage');
  const before = await api(page, recovery);
  assert.deepEqual(before.control, { generation: '0', paused: false });
  assert.equal(before.targets.length, 1);
  assert.equal(before.targets[0].target.firing_version, firing.version);
  writePhase(directory, 'delivery-exhausted', checks);
  await waitPhase(directory, 'retry-ready');
  assert.deepEqual(await api(page, recovery), before);
  setStep('analytics-recovery');
  await recover(page, expect, before.targets[0]);
  checks.push('audited-notification-recovery');
  writePhase(directory, 'recovery-submitted', checks);
  await waitPhase(directory, 'firing-delivered');
  checks.push('receiver-outage-and-worker-restart');

  setStep('analytics-duplicate');
  await transmit(spike.lastAt, spike.last, -1200000);
  const repeated = await sendWindow(anchor, true);
  assert.equal(
    (await observe(page, expect, 'firing', repeated.end)).version,
    firing.version,
  );
  assert.deepEqual(await api(page, `${detail}/transitions?limit=20`), history);
  assert.deepEqual(await api(page, path), evidence);
  checks.push('duplicate-keeps-logical-alert');

  setStep('analytics-resolution');
  const normal = await sendWindow(anchor, false);
  const resolved = await observe(page, expect, 'resolved', normal.end);
  assert.equal(resolved.latest_transition.event_at_ms, normal.end);
  const finalHistory = await api(page, `${detail}/transitions?limit=20`);
  assert.deepEqual(
    finalHistory.transitions
      .filter(({ phase }) => ['firing', 'resolved'].includes(phase))
      .map(({ phase }) => phase)
      .sort(),
    ['firing', 'resolved'],
  );
  writePhase(directory, 'analytics-resolved', checks);
  await waitPhase(directory, 'resolution-delivered');
  checks.push('resolved-receiver-delivery');
}
