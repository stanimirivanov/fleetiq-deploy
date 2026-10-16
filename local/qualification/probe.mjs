import { createServer } from 'node:http';

// Synthetic protocol test only. No provider credentials or production sessions.
createServer((request, response) => {
  response.writeHead(200, {
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=3600',
    'Set-Cookie': '__Host-fleetiq-probe=probe; Secure; HttpOnly; SameSite=Lax; Path=/',
  });
  response.end(
    JSON.stringify({
      host: request.headers.host,
      origin: request.headers.origin,
      cookie: request.headers.cookie,
      path: request.url,
    }),
  );
}).listen(8080, '0.0.0.0');
