import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { context } from './installation.mjs';
import { lock, ownedPath } from './policy.mjs';
import { root, run } from './process.mjs';

/** Real pinned router and synthetic receiver, no host ports or external recipients. */
export async function qualifyAnalytics() {
  const docker = context(); // Fail before creating anything if Docker is unavailable.
  const owner = randomUUID(),
    project = `analytics-${owner.replaceAll('-', '').slice(0, 16)}`;
  const parent = resolve(root, '.local');
  if (!existsSync(parent)) mkdirSync(parent, { mode: 0o700 });
  ownedPath(root, parent);
  const directory = resolve(parent, project);
  mkdirSync(directory, { mode: 0o700 });
  ownedPath(root, directory);
  const restricted = {
    user: '10001:10001',
    read_only: true,
    cap_drop: ['ALL'],
    security_opt: ['no-new-privileges:true'],
    labels: { 'com.fleetiq.deploy.owner': owner },
    networks: ['synthetic'],
    mem_limit: '128m',
    pids_limit: 128,
  };
  const model = {
    services: {
      alertmanager: {
        ...restricted,
        image: lock.images.alertmanager,
        command: [
          '--config.file=/etc/alertmanager/alertmanager.yml',
          '--storage.path=/alertmanager',
          '--cluster.listen-address=',
        ],
        volumes: [
          `${resolve(root, 'local/analytics/alertmanager.fixture.yml')}:/etc/alertmanager/alertmanager.yml:ro`,
        ],
        tmpfs: ['/alertmanager:size=128m,uid=10001,gid=10001,mode=0700,noexec,nosuid'],
      },
      receiver: {
        ...restricted,
        image: lock.images.node,
        command: ['node', '/receiver.mjs'],
        volumes: [`${resolve(root, 'local/analytics/receiver.mjs')}:/receiver.mjs:ro`],
      },
    },
    networks: {
      synthetic: { internal: true, labels: { 'com.fleetiq.deploy.owner': owner } },
    },
  };
  const file = resolve(directory, 'compose.json');
  writeFileSync(file, JSON.stringify(model), { flag: 'wx', mode: 0o600 });
  const command = (args) => run('docker', ['--context', docker, ...args]);
  const compose = (args) =>
    command(['compose', '--project-name', project, '--file', file, ...args]);
  const ownership = () => {
    for (const kind of ['container', 'network', 'volume']) {
      const ids = command([
        kind === 'container' ? 'ps' : kind,
        ...(kind === 'container' ? ['--all', '--quiet'] : ['ls', '--quiet']),
        '--filter',
        `label=com.docker.compose.project=${project}`,
      ])
        .split(/\s+/u)
        .filter(Boolean);
      for (const id of ids) {
        const [object] = JSON.parse(command([kind, 'inspect', id]));
        assert.equal(
          (kind === 'container' ? object.Config.Labels : object.Labels)[
            'com.fleetiq.deploy.owner'
          ],
          owner,
        );
      }
    }
  };
  const request = (url, body) =>
    compose([
      'exec',
      '-T',
      'receiver',
      'node',
      '-e',
      `fetch(process.argv[1], {signal:AbortSignal.timeout(3000), ...(process.argv[2]?{method:'POST',headers:{'Content-Type':'application/json'},body:process.argv[2]}:{})}).then(async r=>{if(!r.ok)process.exit(1);console.log(await r.text())}).catch(()=>process.exit(1))`,
      url,
      ...(body ? [body] : []),
    ]);
  const eventually = async (action) => {
    const end = Date.now() + 45000;
    while (true) {
      try {
        return action();
      } catch (error) {
        if (Date.now() > end) throw error;
        await delay(500);
      }
    }
  };
  let started = false;
  try {
    compose(['config', '--quiet']);
    started = true;
    compose(['up', '--detach']);
    ownership();
    await eventually(() => request('http://alertmanager:9093/-/ready'));
    const startsAt = new Date(Date.now() - 1000).toISOString();
    const alert = (endsAt) =>
      JSON.stringify([
        {
          labels: {
            alertname: 'FleetIQSynthetic',
            fleetiq_tenant: 'synthetic',
            fleetiq_rule: 'fixture',
            fleetiq_revision: '1',
            fleetiq_episode: '1',
          },
          startsAt,
          endsAt,
        },
      ]);
    request(
      'http://alertmanager:9093/api/v2/alerts',
      alert(new Date(Date.now() + 120000).toISOString()),
    );
    await eventually(() =>
      assert(JSON.parse(request('http://receiver:9094/state')).firing > 0),
    );
    ownership();
    compose(['stop', 'alertmanager']);
    assert.throws(
      () =>
        request(
          'http://alertmanager:9093/api/v2/alerts',
          alert(new Date().toISOString()),
        ),
      'Unreachable router must not count as accepted',
    );
    const beforeRestart = JSON.parse(request('http://receiver:9094/state')).firing;
    compose(['start', 'alertmanager']);
    await eventually(() => request('http://alertmanager:9093/-/ready'));
    request(
      'http://alertmanager:9093/api/v2/alerts',
      alert(new Date(Date.now() + 120000).toISOString()),
    );
    await eventually(() =>
      assert(JSON.parse(request('http://receiver:9094/state')).firing > beforeRestart),
    );
    request('http://alertmanager:9093/api/v2/alerts', alert(new Date().toISOString()));
    await eventually(() =>
      assert(JSON.parse(request('http://receiver:9094/state')).resolved > 0),
    );
    return {
      router: 'pinned-real-image',
      receiver: 'synthetic-only',
      firing: true,
      resolved: true,
      unreachable: true,
      restart: true,
    };
  } finally {
    if (started) {
      ownership();
      compose(['down', '--volumes', '--remove-orphans']);
      for (const kind of ['network', 'volume'])
        assert.equal(
          command([
            kind,
            'ls',
            '--quiet',
            '--filter',
            `label=com.docker.compose.project=${project}`,
          ]),
          '',
        );
      assert.equal(
        command([
          'ps',
          '--all',
          '--quiet',
          '--filter',
          `label=com.docker.compose.project=${project}`,
        ]),
        '',
      );
    }
  }
}
