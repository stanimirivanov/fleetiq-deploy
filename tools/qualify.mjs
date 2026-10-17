import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import https from 'node:https';
import net from 'node:net';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import {
  appliedInstallation,
  assertOwnership,
  context,
  down,
  exportCertificate,
  initialize,
  installation,
  up,
} from './installation.mjs';
import { run } from './process.mjs';

async function availablePort() {
  const server = net.createServer();
  await new Promise((ready, fail) =>
    server.once('error', fail).listen(0, '127.0.0.1', ready),
  );
  const { port } = server.address();
  await new Promise((done) => server.close(done));
  return port;
}
export function request(site, path, { ca, hostname = 'localhost', headers = {} } = {}) {
  return new Promise((done, fail) => {
    const req = https.get(
      {
        hostname,
        servername: hostname,
        port: site.settings.httpsPort,
        path,
        ca,
        lookup: (_name, options, callback) =>
          callback(
            null,
            options.all ? [{ address: '127.0.0.1', family: 4 }] : '127.0.0.1',
            4,
          ),
        headers,
        timeout: 5000,
      },
      (response) => {
        const chunks = [];
        let length = 0;
        response.on('data', (chunk) => {
          length += chunk.length;
          if (length > 2 * 1024 * 1024)
            req.destroy(new Error('Response exceeds probe limit'));
          chunks.push(chunk);
        });
        response.on('end', () =>
          done({
            status: response.statusCode,
            headers: response.headers,
            body: Buffer.concat(chunks).toString('utf8'),
          }),
        );
      },
    );
    req.on('error', fail);
    req.on('timeout', () => req.destroy(new Error('HTTPS probe timed out')));
  });
}
async function eventually(action, seconds = 60) {
  const end = Date.now() + seconds * 1000;
  let failure;
  do {
    try {
      return await action();
    } catch (error) {
      failure = error;
    }
    await delay(1000);
  } while (Date.now() < end);
  throw failure;
}
export async function qualify(onProgress = () => {}) {
  const docker = context();
  const name = `qualification-${Date.now().toString(36)}`;
  const port = await availablePort();
  initialize(name, docker, {
    httpsPort: port,
    oidc: {
      issuer: 'https://qualification.example.invalid',
      clientId: 'qualification',
      authority: 'qualification-oidc',
    },
  });
  const site = installation(name, docker, true);
  const results = {
    identity: 'unconfigured-infrastructure-only',
    instance: name,
    checks: [],
    images: site.images,
  };
  const record = (check) => {
    results.checks.push(check);
    console.log(`installation: ${check}`);
    onProgress(results);
  };
  onProgress(results);
  let primaryFailure;
  try {
    up(site);
    assertOwnership(appliedInstallation(name, docker));
    const ca = readFileSync(await eventually(async () => exportCertificate(site)));
    const get = (path, options = {}) => request(site, path, { ca, ...options });
    const ready = await get('/health/ready');
    assert.equal(ready.status, 204);
    record('real-backend-readiness-and-migrations');
    assert.throws(() =>
      site.compose(
        ['run', '--rm', '--no-deps', '-e', 'FLEETIQ_OIDC_ISSUER', 'backend'],
        { env: { FLEETIQ_OIDC_ISSUER: 'https://qualification.example.invalid' } },
      ),
    );
    assert.throws(() =>
      site.compose(
        [
          'run',
          '--rm',
          '--no-deps',
          '-e',
          'FLEETIQ_BROWSER_ORIGIN',
          '-e',
          'FLEETIQ_OIDC_ISSUER',
          '-e',
          'FLEETIQ_OIDC_CLIENT_ID',
          '-e',
          'FLEETIQ_OIDC_IDENTITY_AUTHORITY',
          'backend',
        ],
        {
          env: {
            FLEETIQ_BROWSER_ORIGIN: `https://localhost:${port}`,
            FLEETIQ_OIDC_ISSUER: 'https://qualification.example.invalid',
            FLEETIQ_OIDC_CLIENT_ID: 'qualification',
            FLEETIQ_OIDC_IDENTITY_AUTHORITY: 'qualification-oidc',
          },
        },
      ),
    );
    record('real-entrypoint-partial-identity-and-failed-discovery-rejected');
    const bootstrap = () =>
      site.compose(
        [
          'run',
          '--rm',
          '--no-deps',
          '-e',
          'FLEETIQ_BOOTSTRAP_ACTOR_ID',
          '-e',
          'FLEETIQ_BOOTSTRAP_AUTHORITY_ID',
          '-e',
          'FLEETIQ_BOOTSTRAP_EXTERNAL_SUBJECT',
          'backend',
          'bootstrap-platform-operator',
        ],
        {
          env: {
            FLEETIQ_BOOTSTRAP_ACTOR_ID: 'qualification-operator',
            FLEETIQ_BOOTSTRAP_AUTHORITY_ID: 'qualification-oidc',
            FLEETIQ_BOOTSTRAP_EXTERNAL_SUBJECT: 'synthetic-qualification-subject',
          },
        },
      );
    assert.equal(bootstrap(), 'platform operator bootstrapped');
    assert.equal(bootstrap(), 'platform operator was already bootstrapped');
    record('explicit-real-bootstrap-and-idempotent-repeat');
    for (const path of ['/', '/tenants/tenant-a/assets/asset-1']) {
      const response = await get(path);
      assert.equal(response.status, 200);
      assert.match(response.body, /<html/u);
      assert(!response.body.includes('localhost:5173'));
    }
    const missing = await get('/assets/nonexistent.js');
    assert.equal(missing.status, 404);
    const absent = await get('/api/v1/nonexistent');
    assert.equal(absent.status, 404);
    assert(!absent.body.includes('<html'));
    assert.equal(absent.headers['cache-control'], 'no-store');
    record('production-spa-deep-link-and-api-static-separation');
    await assert.rejects(() => request(site, '/health/ready'));
    await assert.rejects(() =>
      request(site, '/health/ready', { ca, hostname: 'wrong-host.invalid' }),
    );
    record('tls-trusted-ca-untrusted-ca-and-hostname-validation');
    const inspect = JSON.parse(
      run('docker', [
        '--context',
        docker,
        'inspect',
        ...site.compose(['ps', '--all', '--quiet']).split(/\s+/u),
      ]),
    );
    for (const container of inspect) {
      const service = container.Config.Labels['com.docker.compose.service'];
      const bindings = Object.values(container.HostConfig.PortBindings ?? {});
      for (const mount of container.Mounts.filter((mount) => mount.Type === 'volume'))
        assert(
          Object.values(site.model.volumes).some(
            (volume) => volume.name === mount.Name,
          ),
          'Unexpected anonymous or unowned writable volume',
        );
      if (service !== 'postgres') {
        assert.equal(container.Config.User, '10001:10001');
        assert.equal(container.HostConfig.ReadonlyRootfs, true);
        assert(container.HostConfig.CapDrop.includes('ALL'));
        assert(!container.HostConfig.CapAdd?.length);
        assert(container.HostConfig.SecurityOpt.includes('no-new-privileges:true'));
        assert.equal(container.HostConfig.Privileged, false);
      }
      if (service === 'edge')
        assert.deepEqual(bindings, [[{ HostIp: '127.0.0.1', HostPort: String(port) }]]);
      else assert.equal(bindings.length, 0);
    }
    record('runtime-private-backend-and-database');
    const sql = (text) =>
      site.compose([
        'exec',
        '--no-TTY',
        'postgres',
        'psql',
        '-U',
        'fleetiq',
        '-d',
        'fleetiq',
        '-v',
        'ON_ERROR_STOP=1',
        '-Atc',
        text,
      ]);
    assert(Number(sql('SELECT count(*) FROM _sqlx_migrations WHERE success')) > 0);
    sql(
      'CREATE TABLE public.deployment_qualification (id integer PRIMARY KEY); INSERT INTO public.deployment_qualification VALUES (1)',
    );
    site.compose(['restart', 'postgres'], { timeout: 120_000 });
    await eventually(async () =>
      assert.equal((await get('/health/ready')).status, 204),
    );
    assert.equal(sql('SELECT count(*) FROM public.deployment_qualification'), '1');
    const caBefore = readFileSync(resolve(site.path, 'root-ca.crt'), 'utf8');
    site.compose(['restart', 'backend', 'edge'], { timeout: 120_000 });
    await eventually(async () =>
      assert.equal((await get('/health/ready')).status, 204),
    );
    assert.equal(readFileSync(exportCertificate(site), 'utf8'), caBefore);
    record('database-and-ca-persist-across-service-restarts');
    site.compose(['stop', 'backend']);
    await eventually(async () =>
      assert.equal((await get('/health/ready')).status, 502),
    );
    site.compose(['start', 'backend']);
    await eventually(async () =>
      assert.equal((await get('/health/ready')).status, 204),
    );
    record('backend-outage-and-recovery-through-edge');
    // The synthetic upstream exercises the proxy, not authentication.
    assertOwnership(site);
    site.compose(
      ['up', '--detach', '--no-deps', 'proxy-probe', 'edge'],
      { timeout: 120_000 },
      true,
    );
    const probe = await eventually(async () => {
      const value = await get('/api/v1/proxy-contract', {
        headers: { Origin: `https://localhost:${port}`, Cookie: 'probe=synthetic' },
      });
      assert.equal(value.status, 200);
      const parsed = JSON.parse(value.body);
      assert.equal(parsed.origin, `https://localhost:${port}`);
      assert.equal(parsed.host, `localhost:${port}`);
      assert.equal(parsed.cookie, 'probe=synthetic');
      assert.equal(parsed.path, '/api/v1/proxy-contract');
      assert.equal(value.headers['cache-control'], 'no-store');
      assert.match(
        value.headers['set-cookie'][0],
        /Secure; HttpOnly; SameSite=Lax; Path=\//u,
      );
      return true;
    });
    assert(probe);
    site.compose(['up', '--detach', '--no-deps', 'edge'], { timeout: 120_000 });
    await eventually(async () =>
      assert.equal((await get('/api/v1/nonexistent')).status, 404),
    );
    record('synthetic-proxy-origin-host-cookie-no-store-and-restored-real-backend');
  } catch (error) {
    primaryFailure = error;
  } finally {
    try {
      down(appliedInstallation(name, docker), true);
      assert.equal(
        run('docker', [
          '--context',
          docker,
          'ps',
          '--all',
          '--quiet',
          '--filter',
          `label=com.docker.compose.project=${site.project}`,
        ]),
        '',
      );
      for (const type of ['volume', 'network'])
        assert.equal(
          run('docker', [
            '--context',
            docker,
            type,
            'ls',
            '--quiet',
            '--filter',
            `label=com.docker.compose.project=${site.project}`,
          ]),
          '',
        );
      record('owned-containers-networks-and-volumes-removed');
    } catch (cleanup) {
      primaryFailure = new Error(
        primaryFailure
          ? `${primaryFailure.message}; owned cleanup also failed`
          : cleanup.message,
      );
    }
  }
  if (primaryFailure) throw primaryFailure;
  return results;
}
