import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import {
  readPhase,
  waitPhase,
  writePhase,
} from '../../local/qualification/product/channel.mjs';
import { requiredChecks } from '../../local/qualification/product/contract.mjs';
import { avlFrame, imei, transmit } from '../../local/qualification/product/device.mjs';
import { root } from '../process.mjs';
import { productCompose } from '../product/compose.mjs';
import { assertResource, completeProduct, productPolicy } from '../product/policy.mjs';
import { catalogue } from '../verification-catalogue.mjs';

function fixture() {
  return productCompose({
    name: 'product-0123456789abcdef',
    owner: '01234567-89ab-cdef-0123-456789abcdef',
    images: { backend: `sha256:${'a'.repeat(64)}`, edge: `sha256:${'b'.repeat(64)}` },
    helper: `sha256:${'c'.repeat(64)}`,
    control: resolve(root, '.local/test-control'),
  });
}
test('product composition is separate, internal, identity-complete and required for acceptance', () => {
  productPolicy(fixture());
  assert(catalogue.product.includes('installed-product'));
  assert(catalogue.acceptance.includes('installed-product'));
  assert(!catalogue.docker.includes('installed-product'));
  const workflow = readFileSync(resolve(root, '.github/workflows/ci.yml'), 'utf8');
  assert(workflow.includes('run: pnpm qualify\n'));
  assert(workflow.includes('run: pnpm qualify:product\n'));
});
for (const [name, mutate] of [
  [
    'published backend',
    (v) => {
      v.services.backend.ports = ['8080:8080'];
    },
  ],
  [
    'floating image',
    (v) => {
      v.services.browser.image = 'browser:latest';
    },
  ],
  [
    'root browser',
    (v) => {
      v.services.browser.user = '0:0';
    },
  ],
  [
    'unbounded memory',
    (v) => {
      v.services.backend.mem_limit = '0m';
    },
  ],
  [
    'host networking',
    (v) => {
      v.services.browser.network_mode = 'host';
    },
  ],
  [
    'unbounded child',
    (v) => {
      delete v.services.replay.pids_limit;
    },
  ],
  [
    'privileged browser',
    (v) => {
      v.services.browser.privileged = true;
    },
  ],
  [
    'TLS bypass',
    (v) => {
      v.services.backend.environment.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    },
  ],
  [
    'literal secret',
    (v) => {
      v.services.issuer.environment = { CLIENT_SECRET: 'forbidden' };
    },
  ],
  [
    'browser database reachability',
    (v) => {
      v.services.browser.networks.push('database');
    },
  ],
  [
    'browser credential mount',
    (v) => {
      v.services.browser.volumes.push('state:/state:ro');
    },
  ],
  [
    'issuer unrestricted state',
    (v) => {
      v.services.issuer.volumes[0].volume.subpath = '';
    },
  ],
  [
    'external network',
    (v) => {
      v.networks.application.internal = false;
    },
  ],
  [
    'writable runtime',
    (v) => {
      v.services.backend.read_only = false;
    },
  ],
  [
    'Docker socket',
    (v) => {
      v.services.browser.volumes.push('/var/run/docker.sock:/var/run/docker.sock');
    },
  ],
  [
    'extra service',
    (v) => {
      v.services.unreviewed = v.services.backend;
    },
  ],
])
  test(`product policy rejects ${name}`, () => {
    const value = fixture();
    mutate(value);
    assert.throws(() => productPolicy(value));
  });
test('every product check is required exactly once; infrastructure receipt cannot pass', () => {
  assert.deepEqual(
    completeProduct({ phase: 'complete', checks: requiredChecks }),
    requiredChecks,
  );
  for (const checks of [
    [],
    requiredChecks.slice(1),
    [...requiredChecks, requiredChecks[0]],
    [...requiredChecks, 'fabricated'],
  ])
    assert.throws(() => completeProduct({ phase: 'complete', checks }));
  assert.throws(() =>
    completeProduct({ phase: 'initial-visible', checks: requiredChecks }),
  );
});
test('ownership refuses foreign or missing project and owner on all resource types', () => {
  for (const kind of ['container', 'network', 'volume']) {
    const valid = {
      'com.docker.compose.project': 'product-test',
      'com.fleetiq.deploy.owner': 'owner',
    };
    const value =
      kind === 'container' ? { Config: { Labels: valid } } : { Labels: valid };
    assertResource(value, 'product-test', 'owner', kind);
    assert.throws(() => assertResource(value, 'other', 'owner', kind));
    assert.throws(() => assertResource(value, 'product-test', 'other', kind));
    assert.throws(() => assertResource({}, 'product-test', 'owner', kind));
  }
});
test('phase channel refuses secret-like evidence, overwrite, malformed files and failed/absent acceptance', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'fleetiq-product-'));
  try {
    assert.equal(readPhase(directory, 'complete'), null);
    assert.throws(() => writePhase(directory, 'unknown'));
    assert.throws(() => writePhase(directory, 'complete', ['cookie=value']));
    writePhase(directory, 'setup-ready', ['real-wasm-admission']);
    assert.throws(() => writePhase(directory, 'setup-ready'));
    assert.equal((await waitPhase(directory, 'setup-ready', 0)).phase, 'setup-ready');
    await assert.rejects(waitPhase(directory, 'complete', 0), /timed out/u);
    writeFileSync(
      join(directory, 'complete.json'),
      JSON.stringify({
        schemaVersion: 1,
        phase: 'complete',
        checks: [],
        password: 'forbidden',
      }),
    );
    assert.throws(() => readPhase(directory, 'complete'));
    writePhase(directory, 'failed', []);
    await assert.rejects(waitPhase(directory, 'workers-started', 0), /failed/u);
  } finally {
    rmSync(directory, { recursive: true });
  }
});
test('Codec 8 frame preserves timestamp, signed coordinates, length and independent CRC', () => {
  const packet = avlFrame(1790000000123, 515000000, -1200000);
  assert.equal(packet.length, 45);
  assert.equal(packet.readUInt32BE(4), 33);
  assert.equal(packet.readBigUInt64BE(10), 1790000000123n);
  assert.equal(packet.readInt32BE(19), -1200000);
  assert.equal(packet.readInt32BE(23), 515000000);
  // Independent polynomial division over each input bit, not the producer loop.
  let crc = 0;
  for (const byte of packet.subarray(8, -4))
    for (let bit = 0; bit < 8; bit++) {
      const low = (crc & 1) ^ ((byte >>> bit) & 1);
      crc >>>= 1;
      if (low) crc ^= 0xa001;
    }
  assert.equal(packet.readUInt32BE(41), crc);
});
test('real TCP fixture tolerates split ACKs and refuses a non-durable record ACK', async () => {
  for (const accepted of [true, false]) {
    const sockets = new Set();
    let handshake, frame;
    const server = net.createServer((socket) => {
      sockets.add(socket);
      socket.on('close', () => sockets.delete(socket));
      let bytes = Buffer.alloc(0),
        identified = false;
      socket.on('data', (chunk) => {
        bytes = Buffer.concat([bytes, chunk]);
        if (!identified && bytes.length >= 17) {
          handshake = bytes.subarray(0, 17);
          bytes = bytes.subarray(17);
          identified = true;
          socket.write(Buffer.from([1]));
        }
        if (identified && bytes.length >= 45) {
          frame = bytes.subarray(0, 45);
          const reply = Buffer.from([0, 0, 0, accepted ? 1 : 0]);
          socket.write(reply.subarray(0, 2));
          setTimeout(() => {
            if (!socket.destroyed) socket.write(reply.subarray(2));
          }, 10);
          bytes = bytes.subarray(45);
        }
      });
    });
    await new Promise((ready) => server.listen(0, '127.0.0.1', ready));
    try {
      const operation = transmit(1790000000123, 515000000, -1200000, {
        host: '127.0.0.1',
        port: server.address().port,
        timeout: 5000,
      });
      if (accepted) await operation;
      else await assert.rejects(operation, /durable acceptance/u);
      assert.equal(handshake.readUInt16BE(0), 15);
      assert.equal(handshake.subarray(2).toString('ascii'), imei);
      assert.deepEqual(frame, avlFrame(1790000000123, 515000000, -1200000));
    } finally {
      for (const socket of sockets) socket.destroy();
      await new Promise((done) => server.close(done));
    }
  }
});
test('malformed entrypoint cannot regress; Linux fixture build must execute actual Bash behavior', () => {
  const script = readFileSync(resolve(root, 'local/backend-entrypoint.sh'), 'utf8');
  assert.equal(
    (script.match(/exec \/usr\/local\/bin\/fleetiq-server/gu) ?? []).length,
    1,
  );
  assert.match(
    script,
    /FLEETIQ_OIDC_CLIENT_SECRET="\$\{FLEETIQ_OIDC_CLIENT_SECRET%\$'\\r'\}"/u,
  );
  const image = readFileSync(
    resolve(root, 'local/qualification/product/Dockerfile'),
    'utf8',
  );
  assert(image.includes('bash -n local/backend-entrypoint.sh'));
  assert(image.includes('node local/qualification/product/entrypoint-test.mjs'));
  const scenario = readFileSync(
    resolve(root, 'local/qualification/product/scenario.mjs'),
    'utf8',
  );
  assert(
    !/ignoreHTTPSErrors|ignore-certificate-errors|page\.route\(|route\.fulfill\(/u.test(
      scenario,
    ),
  );
  assert(scenario.includes('certutil'));
});

test('silent or oversized TCP replies fail within the device lifetime', async () => {
  for (const oversized of [false, true]) {
    const sockets = new Set();
    const server = net.createServer((socket) => {
      sockets.add(socket);
      socket.on('error', () => {});
      socket.on('close', () => sockets.delete(socket));
      if (oversized) socket.write(Buffer.alloc(32, 1));
    });
    await new Promise((ready) => server.listen(0, '127.0.0.1', ready));
    try {
      await assert.rejects(
        transmit(1, 0, 0, {
          host: '127.0.0.1',
          port: server.address().port,
          timeout: 100,
        }),
        oversized ? /budget/u : /deadline/u,
      );
    } finally {
      for (const socket of sockets) socket.destroy();
      await new Promise((done) => server.close(done));
    }
  }
});

test('Teltonika build uses the upstream import-free core-to-component path and fixed sibling executors', () => {
  const dockerfile = readFileSync(
    resolve(root, 'local/images/backend.Dockerfile'),
    'utf8',
  );
  assert(dockerfile.includes('--target wasm32-unknown-unknown -p fleetiq-teltonika'));
  assert(dockerfile.includes('--example componentize --'));
  assert(!dockerfile.includes('wasm32-wasip2'));
  for (const command of ['admission', 'decode', 'live'])
    assert(dockerfile.includes(`target/release/fleetiq-protocol-${command}`));
});

test('normal and product PostgreSQL readiness exclude the socket-only temporary server', async () => {
  const { sourceCompose } = await import('../policy.mjs');
  const expected = [
    'CMD',
    'pg_isready',
    '-h',
    '127.0.0.1',
    '-U',
    'fleetiq',
    '-d',
    'fleetiq',
  ];
  assert.deepEqual(sourceCompose().services.postgres.healthcheck.test, expected);
  assert.deepEqual(fixture().services.postgres.healthcheck.test, expected);
  const socketProbe = fixture();
  socketProbe.services.postgres.healthcheck.test = [
    'CMD-SHELL',
    'pg_isready -U fleetiq -d fleetiq',
  ];
  assert.throws(() => productPolicy(socketProbe));
  const noDelay = fixture();
  noDelay.services.postgres.volumes = noDelay.services.postgres.volumes.filter(
    (mount) => mount.type !== 'bind',
  );
  assert.throws(() => productPolicy(noDelay));
  const bypass = fixture();
  bypass.services.backend.depends_on.postgres.condition = 'service_started';
  assert.throws(() => productPolicy(bypass));
  const initializer = readFileSync(
    resolve(root, 'local/qualification/product/postgres-initialization.sh'),
    'utf8',
  );
  assert(initializer.includes('pg_isready -U fleetiq -d fleetiq'));
  assert(initializer.includes('pg_isready -h 127.0.0.1'));
  assert(initializer.includes('sleep 5'));
  const qualifier = readFileSync(resolve(root, 'tools/product/qualify.mjs'), 'utf8');
  assert(qualifier.includes('socket-only-readiness-rejected'));
});

test('NGINX TLS edge preserves a read-only root and private bounded scratch', () => {
  const spec = fixture(),
    edge = spec.services.edge;
  productPolicy(spec);
  assert.deepEqual(edge.environment, {
    FLEETIQ_PUBLIC_AUTHORITY: 'fleet.test:8443',
    FLEETIQ_API_UPSTREAM: 'backend:8080',
  });
  assert.equal(
    edge.volumes.find((mount) => mount.target === '/run/tls').read_only,
    true,
  );
  for (const change of [
    (v) => {
      v.tmpfs = [];
    },
    (v) => {
      v.tmpfs = v.tmpfs.map((x) => x.replace('uid=10001', 'uid=0'));
    },
    (v) => {
      v.tmpfs = v.tmpfs.map((x) => x.replace('size=32m', 'size=1g'));
    },
    (v) => {
      v.tmpfs = v.tmpfs.map((x) => x.replace('mode=0700', 'mode=0777'));
    },
    (v) => {
      v.tmpfs = v.tmpfs.map((x) => x.replace(',noexec', ''));
    },
    (v) => {
      v.environment.FLEETIQ_PUBLIC_AUTHORITY = 'wrong.test';
    },
    (v) => {
      v.environment.XDG_DATA_HOME = '/data';
    },
    (v) => {
      v.volumes.push({
        type: 'bind',
        source: '/foreign',
        target: '/etc/fleetiq/proxy.conf.template',
        read_only: true,
      });
    },
    (v) => {
      v.volumes.find((x) => x.target === '/fixture/maps').read_only = false;
    },

    (v) => {
      v.volumes.push({ type: 'bind', source: '/private', target: '/data' });
    },
    (v) => {
      v.volumes.find((x) => x.target === '/run/tls').read_only = false;
    },
    (v) => {
      v.volumes.find((x) => x.target === '/etc/fleetiq/nginx.conf.template').read_only =
        false;
    },
    (v) => {
      v.volumes.find((x) => x.target === '/etc/fleetiq/nginx.conf.template').source =
        '/foreign';
    },
  ]) {
    const altered = fixture();
    change(altered.services.edge);
    assert.throws(() => productPolicy(altered));
  }
});
