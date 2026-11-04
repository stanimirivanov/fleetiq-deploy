import http from 'node:http';
import { fileURLToPath } from 'node:url';

/** Track one synthetic episode in memory. Bodies and identities never leave this sink. */
export function analyticsReceiver() {
  let incident,
    resolved = false,
    rejected = false;
  return http.createServer({ requestTimeout: 5000 }, async (request, response) => {
    if (request.method === 'GET' && request.url === '/state') {
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ firing: Boolean(incident), resolved, rejected }));
      return;
    }
    if (request.method !== 'POST' || request.url !== '/alerts') {
      response.writeHead(404).end();
      return;
    }
    try {
      const chunks = [];
      let bytes = 0;
      for await (const chunk of request) {
        bytes += chunk.length;
        if (bytes > 65536) {
          rejected = true;
          response.writeHead(413).end();
          request.destroy();
          return;
        }
        chunks.push(chunk);
      }
      const event = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      const alert = event.alerts?.[0];
      const labels = alert?.labels;
      const starts = Date.parse(alert?.startsAt);
      const key = labels?.fleetiq_episode;
      if (
        !Array.isArray(event.alerts) ||
        event.alerts.length !== 1 ||
        !['firing', 'resolved'].includes(event.status) ||
        event.status !== alert?.status ||
        labels?.alertname !== 'FleetIQNumericThreshold' ||
        labels.fleetiq_tenant !== 'tenant-a' ||
        labels.fleetiq_rule !== 'latitude-spike' ||
        labels.fleetiq_revision !== '1' ||
        typeof key !== 'string' ||
        !/^[1-9][0-9]{0,18}$/u.test(key) ||
        !Number.isFinite(starts) ||
        (incident && (incident.key !== key || incident.starts !== starts)) ||
        (!incident && event.status === 'resolved')
      )
        throw new Error('Unexpected synthetic episode');
      incident ??= { key, starts };
      resolved ||= event.status === 'resolved';
      response.writeHead(200).end();
    } catch {
      rejected = true;
      response.writeHead(400).end();
    }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url))
  analyticsReceiver().listen(9094, '0.0.0.0');
