import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import { analyticsReceiver } from '../../local/qualification/product/analytics-receiver.mjs';

test('real receiver retains one logical incident across refreshes and resolution', async () => {
  const server = analyticsReceiver().listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const send = async (status, episode = '1', startsAt = '2026-11-04T00:00:00Z') =>
    (
      await fetch(`${base}/alerts`, {
        method: 'POST',
        body: JSON.stringify({
          status,
          alerts: [
            {
              status,
              startsAt,
              labels: {
                alertname: 'FleetIQNumericThreshold',
                fleetiq_tenant: 'tenant-a',
                fleetiq_rule: 'latitude-spike',
                fleetiq_revision: '1',
                fleetiq_episode: episode,
              },
            },
          ],
        }),
      })
    ).status;
  try {
    assert.equal(await send('resolved'), 400);
    assert.equal(await send('firing'), 200);
    assert.equal(await send('firing'), 200);
    assert.equal(await send('firing', '2'), 400);
    assert.equal(await send('firing', '1', '2026-11-04T00:00:01Z'), 400);
    assert.equal(await send('resolved'), 200);
    assert.deepEqual(await (await fetch(`${base}/state`)).json(), {
      firing: true,
      resolved: true,
      rejected: true,
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
