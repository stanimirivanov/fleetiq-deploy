import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  faultFailureCategory,
  verifyFaultDelta,
  verifyFaultReceipt,
  verifyFleet,
} from '../local/demo/fault-acceptance.mjs';
import { recoveryScenario } from '../local/demo/recovery.mjs';
import { assertOwnership } from './installation.mjs';
import { capture, run } from './process.mjs';

// Each producer waits for the same host-created barrier. Children inherit the normal restricted service and read-only inputs.
const launcher = `import{existsSync}from'node:fs';import{spawn}from'node:child_process';const end=performance.now()+10000;while(!existsSync(process.argv[2])){if(performance.now()>end)process.exit(3);await new Promise(r=>setTimeout(r,20));}const child=spawn('/usr/local/bin/node',['/app/dist/cli.js',...process.argv.slice(3)],{stdio:'inherit',shell:false});child.on('error',()=>process.exit(3));child.on('exit',code=>process.exit(code??3));`;

/** Starts owned producer processes behind a barrier; every exit/output and cleanup is checked before evidence escapes. */
async function batch(site, path, group, tasks) {
  assertOwnership(site);
  const docker = (args) =>
    run('docker', ['--context', site.docker, ...args], { timeout: 10000 });
  const names = tasks.map((_, i) => `${site.project}-fault-${group}-${i}`);
  const inspect = (name) =>
    JSON.parse(docker(['inspect', '--format', '{{json .State}}', name]));
  const owned = (name) => {
    const labels = JSON.parse(
      docker(['inspect', '--format', '{{json .Config.Labels}}', name]),
    );
    assert.equal(labels['com.fleetiq.deploy.owner'], site.owner.id);
    assert.equal(labels['com.docker.compose.project'], site.project);
  };
  try {
    for (const [i, task] of tasks.entries()) {
      site.compose(
        [
          'run',
          '--detach',
          '--no-deps',
          '-T',
          '--name',
          names[i],
          '--volume',
          `${path}:/run/faults:ro`,
          '--entrypoint',
          '/usr/local/bin/node',
          'simulator',
          '/run/faults/launch.mjs',
          `/run/faults/go-${group}`,
          task.command,
          '--config',
          `/run/faults/${task.config}.json`,
        ],
        { timeout: 30000 },
      );
      owned(names[i]);
    }
    for (const name of names) assert.equal(inspect(name).Running, true);
    writeFileSync(resolve(path, `go-${group}`), 'go', { mode: 0o600, flag: 'wx' });
    const deadline = performance.now() + 45000;
    while (names.some((name) => inspect(name).Running)) {
      assert(performance.now() < deadline, 'Fault workload deadline exceeded');
      await new Promise((done) => setTimeout(done, 100));
    }
    return tasks.map((task, i) => {
      const { stdout, stderr } = capture(
        'docker',
        ['--context', site.docker, 'logs', names[i]],
        { timeout: 10000 },
      );
      if (inspect(names[i]).ExitCode !== (task.exit ?? 0))
        console.error(`simulator: fault-producer-${faultFailureCategory(stderr)}`);
      assert.equal(inspect(names[i]).ExitCode, task.exit ?? 0);
      assert.equal(stderr.trim(), task.exit === 4 ? 'fleet-overflow' : '');
      return JSON.parse(stdout.trim());
    });
  } finally {
    for (const name of names)
      if (docker(['ps', '--all', '--quiet', '--filter', `name=^${name}$`])) {
        owned(name);
        docker(['rm', '--force', name]);
      }
  }
}

/** Authenticated history/Inspect and durable diagnostics distinguish a real denial from a broken receiver. */
export async function qualifyFaults(site, config, seed, browser) {
  assert.equal(seed.devices.length, 2);
  const path = resolve(site.path, 'fault-qualification');
  mkdirSync(path, { mode: 0o700 });
  const write = (name, value) =>
    writeFileSync(resolve(path, `${name}.json`), JSON.stringify(value), {
      mode: 0o600,
      flag: 'wx',
    });
  writeFileSync(resolve(path, 'launch.mjs'), launcher, { mode: 0o600, flag: 'wx' });
  const devices = seed.devices;
  let unknown = devices[1].imei;
  do {
    unknown = String((Number(unknown[0]) % 9) + 1) + unknown.slice(1);
  } while (devices.some((device) => device.imei === unknown));
  write('identities', { good: devices[0].imei, bad: devices[1].imei });
  write('fault-identities', { bad: devices[1].imei, unknown });
  write('storm-identities', { bad: devices[1].imei });
  const start = BigInt(config.record.timestampMs) - 9000000n;
  const fixture = recoveryScenario(config);
  fixture.scenario.startTimeMs = String(start);
  for (const [name, value] of Object.entries({
    route: fixture.route,
    scenario: fixture.scenario,
    profile: fixture.profile,
  }))
    write(name, value);
  const common = {
    schemaVersion: 1,
    identityFile: 'identities.json',
    target: config.target,
    retry: { maxAttempts: 3, ackDeadlineMs: 3000, totalDeadlineMs: 30000 },
  };
  const fleet = {
    ...common,
    fleet: {
      profile: 'product',
      maxConcurrent: 2,
      retryDelayMs: 100,
      maxQueuedBytes: 65536,
      routeFile: 'route.json',
      scenarioFile: 'scenario.json',
      profileFile: 'profile.json',
      intervalMs: 1000,
      dropEvery: 0,
      devices: ['good', 'bad'].map((deviceId) => ({
        deviceId,
        seed: `installed-${deviceId}`,
        clockOffsetMs: 0,
        driftPpm: 0,
      })),
    },
  };
  write('fleet', fleet);
  console.log('simulator: two-session-fleet-started');
  const pair = verifyFleet(
    (await batch(site, path, 'fleet', [{ command: 'fleet', config: 'fleet' }]))[0],
    6,
    2,
  );
  const fleetTimes = [0, 1000, 2000].map((n) => String(start + BigInt(n)));
  const faultStart = start + 1000000n;
  const expected = (index, required, allowed = required) => ({
    tenantId: seed.tenantId,
    actorId: seed.actorId,
    ...devices[index],
    record: config.record,
    recovery: {
      timestamps: required,
      allowed,
      window: { start: String(start), end: String(faultStart + 8001n) },
      inspect: true,
    },
  });
  const fleetBaseline = await browser(expected(1, fleetTimes));
  const records = Array.from({ length: 8 }, (_, i) => ({
    ...config.record,
    timestampMs: String(faultStart + BigInt(i * 1000)),
  }));
  const fault = {
    ...common,
    deviceId: 'bad',
    unregisteredDeviceId: 'unknown',
    identityFile: 'fault-identities.json',
    retry: { ...common.retry, maxAttempts: 1 },
    records,
    faults: {
      schemaVersion: 1,
      authorizedLocalTarget: true,
      actions: [
        { packet: 1, kind: 'split-write', offset: 7 },
        { packet: 2, kind: 'duplicate-record' },
        { packet: 3, kind: 'corrupt-crc' },
        { packet: 4, kind: 'truncate-close', offset: 11 },
        { packet: 5, kind: 'late-event-time', timestampMs: String(faultStart - 1000n) },
        { packet: 6, kind: 'unregistered-identity' },
        { packet: 7, kind: 'disconnect-before-write' },
        { packet: 8, kind: 'disconnect-after-write' },
      ],
    },
  };
  write('fault', fault);
  console.log('simulator: negative-frames-started');
  verifyFaultReceipt(
    (await batch(site, path, 'negative', [{ command: 'fault', config: 'fault' }]))[0],
    false,
  );
  const badRequired = [
    ...fleetTimes,
    ...[-1000, 0, 1000].map((n) => String(faultStart + BigInt(n))),
  ];
  console.log('simulator: fault-history-started');
  const before = await browser(
    expected(1, badRequired, [...badRequired, String(faultStart + 7000n)]),
  );
  // Nine fresh sockets: eight registered handshakes, four valid data turns,
  // and at most one valid after-write acceptance. Invalid bytes are not queued.
  verifyFaultDelta(fleetBaseline, before, {
    handshakes: 8,
    minDecoded: 4,
    maxDecoded: 5,
  });
  const stormStart = start + 500000n;
  const stormRecords = Array.from({ length: 12 }, (_, i) => ({
    ...config.record,
    timestampMs: String(stormStart + BigInt(i * 1000)),
  }));
  write('storm', {
    ...common,
    identityFile: 'storm-identities.json',
    deviceId: 'bad',
    retry: { ...common.retry, maxAttempts: 1 },
    records: stormRecords,
    faults: {
      schemaVersion: 1,
      authorizedLocalTarget: true,
      actions: stormRecords.map((_, i) => ({
        packet: i + 1,
        kind: 'disconnect-before-write',
      })),
    },
  });
  write('healthy-scenario', { ...fixture.scenario, startTimeMs: String(stormStart) });
  write('healthy', {
    ...fleet,
    fleet: {
      ...fleet.fleet,
      maxConcurrent: 1,
      scenarioFile: 'healthy-scenario.json',
      devices: fleet.fleet.devices.slice(0, 1),
    },
  });
  console.log('simulator: reconnect-neighbor-started');
  const [storm, healthy] = await batch(site, path, 'storm', [
    { command: 'fault', config: 'storm' },
    { command: 'fleet', config: 'healthy' },
  ]);
  verifyFaultReceipt(storm, true);
  const neighbor = verifyFleet(healthy, 3, 1);
  const after = await browser(
    expected(1, badRequired, [...badRequired, String(faultStart + 7000n)]),
  );
  verifyFaultDelta(before, after, { handshakes: 12, minDecoded: 0, maxDecoded: 0 });
  const goodRequired = [
    ...fleetTimes,
    ...[0, 1000, 2000].map((n) => String(stormStart + BigInt(n))),
  ];
  const good = await browser(expected(0, goodRequired));
  console.log('simulator: overflow-started');
  write('overflow', { ...fleet, fleet: { ...fleet.fleet, maxQueuedBytes: 53 } });
  assert.deepEqual(
    (
      await batch(site, path, 'overflow', [
        { command: 'fleet', config: 'overflow', exit: 4 },
      ])
    )[0],
    { status: 'fleet-rejected', overflows: 1 },
  );
  const unchanged = await browser(
    expected(1, badRequired, [...badRequired, String(faultStart + 7000n)]),
  );
  verifyFaultDelta(after, unchanged, { handshakes: 0, minDecoded: 0, maxDecoded: 0 });
  const unchangedGood = await browser(expected(0, goodRequired));
  verifyFaultDelta(good, unchangedGood, {
    handshakes: 0,
    minDecoded: 0,
    maxDecoded: 0,
  });
  for (const result of [before, after, good, unchanged])
    assert(result.checks.includes('matching-inspect'));
  return {
    fleet: true,
    faults: true,
    storm: true,
    neighbor: true,
    diagnostics: true,
    history: true,
    resources: { pair, neighbor },
  };
}
