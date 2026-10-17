// Loopback-only smart HTTP Git server for the partial-clone credential regression.
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { resolve } from 'node:path';

const [root, blob] = process.argv.slice(2);
const audit = { authorized: 0, denied: 0, blobRequests: 0, filteredRequests: 0 };
const expected = `Basic ${Buffer.from(`fixture:${process.env.FLEETIQ_TEST_GIT_PASSWORD}`).toString('base64')}`;
const server = createServer((request, response) => {
  if (request.headers.authorization !== expected) {
    audit.denied++;
    writeFileSync(resolve(root, 'audit.json'), JSON.stringify(audit));
    response.writeHead(401, { 'WWW-Authenticate': 'Basic realm="source-fixture"' });
    response.end();
    return;
  }
  audit.authorized++;
  const chunks = [];
  let length = 0;
  request.on('data', (chunk) => {
    length += chunk.length;
    if (length > 1024 * 1024) request.destroy();
    else chunks.push(chunk);
  });
  request.on('end', () => {
    const body = Buffer.concat(chunks);
    const text = body.toString('utf8');
    if (text.includes(`want ${blob}`)) audit.blobRequests++;
    if (text.includes('filter blob:none')) audit.filteredRequests++;
    writeFileSync(resolve(root, 'audit.json'), JSON.stringify(audit));
    const url = new URL(request.url, 'http://127.0.0.1');
    // Git packfiles require binary CGI capture; the normal adapter decodes text.
    const result = spawnSync('git', ['http-backend'], {
      env: {
        ...process.env,
        GIT_PROJECT_ROOT: root,
        GIT_HTTP_EXPORT_ALL: '1',
        PATH_INFO: url.pathname,
        QUERY_STRING: url.search.slice(1),
        REQUEST_METHOD: request.method,
        CONTENT_TYPE: request.headers['content-type'] ?? '',
        CONTENT_LENGTH: String(body.length),
        REMOTE_USER: 'fixture',
        HTTP_GIT_PROTOCOL: request.headers['git-protocol'] ?? '',
      },
      input: body,
      timeout: 15000,
      maxBuffer: 4 * 1024 * 1024,
      shell: false,
      windowsHide: true,
    });
    audit.backendExit = result.status;
    audit.backendError = result.error?.code ?? null;
    writeFileSync(resolve(root, 'audit.json'), JSON.stringify(audit));
    if (result.error || result.status !== 0) {
      response.writeHead(500);
      response.end();
      return;
    }
    const delimiter = result.stdout.indexOf('\r\n\r\n');
    const fallback = result.stdout.indexOf('\n\n');
    const boundary = delimiter >= 0 ? delimiter : fallback;
    if (boundary < 0) {
      response.writeHead(500);
      response.end();
      return;
    }
    const headers = {};
    let status = 200;
    for (const line of result.stdout
      .subarray(0, boundary)
      .toString('utf8')
      .split(/\r?\n/u)) {
      const colon = line.indexOf(':');
      if (colon < 0) continue;
      const name = line.slice(0, colon);
      const value = line.slice(colon + 1).trim();
      if (name.toLowerCase() === 'status') status = Number.parseInt(value, 10);
      else headers[name] = value;
    }
    response.writeHead(status, headers);
    response.end(result.stdout.subarray(boundary + (delimiter >= 0 ? 4 : 2)));
  });
});
server.requestTimeout = 20000;
server.listen(0, '127.0.0.1', () => {
  writeFileSync(resolve(root, 'audit.json'), JSON.stringify(audit));
  process.send({ port: server.address().port });
});
// An exited test runner must not leave a listening fixture behind.
process.on('disconnect', () => server.close());
