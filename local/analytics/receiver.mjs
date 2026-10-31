// Synthetic fixture only: discard bodies after bounded validation; never forward/log alerts.
import http from 'node:http';
import { fileURLToPath } from 'node:url';

export function receiver() {
  let firing = 0,
    resolved = 0;
  return http.createServer(async (request, response) => {
    if (request.method === 'GET' && request.url === '/state') {
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({ firing, resolved }));
      return;
    }
    if (request.method !== 'POST' || request.url !== '/alerts') {
      response.writeHead(404).end();
      return;
    }
    let body = '',
      bytes = 0;
    try {
      for await (const chunk of request) {
        bytes += chunk.length;
        if (bytes > 65536) {
          response.writeHead(413).end();
          request.destroy();
          return;
        }
        body += chunk.toString('utf8');
      }
      const value = JSON.parse(body);
      if (
        !['firing', 'resolved'].includes(value.status) ||
        !Array.isArray(value.alerts) ||
        value.alerts.length > 16
      )
        throw new Error();
      if (value.status === 'firing') firing++;
      else resolved++;
      response.writeHead(200).end();
    } catch {
      response.writeHead(400).end();
    }
  });
}
if (process.argv[1] === fileURLToPath(import.meta.url))
  receiver().listen(9094, '0.0.0.0');
