import { analyticsInstallation, analyticsServices } from './analytics.mjs';
import { archiveInstallation, archiveService } from './archive.mjs';
import { demoCommand, parseDemoArguments } from './demo.mjs';
import {
  appliedInstallation,
  assertOwnership,
  context,
  down,
  exportCertificate,
  initialize,
  installation,
  privateJson,
  up,
} from './installation.mjs';
import { pipelineInstallation, pipelineServices } from './pipeline.mjs';
import { buildImages, prepareSources } from './sources.mjs';

try {
  const args = process.argv.slice(2);
  const [command, name = 'development'] = args;
  const demo = command?.startsWith('demo-') ? parseDemoArguments(args) : null;
  if (command === 'sources') prepareSources();
  else {
    const docker = context();
    if (command?.startsWith('demo-')) {
      try {
        await demoCommand(demo.command, demo.name, docker, demo.artifactPath);
      } catch {
        throw new Error(
          'Demo lifecycle failed; check owned state, published image and explicit DNS/CA/browser prerequisites',
        );
      }
      console.log('Demo lifecycle command: complete');
    } else if (command === 'build') buildImages(docker);
    else if (command === 'init') {
      initialize(name, docker);
      console.log(
        `Created private configuration: .local/instances/${name}/config.json`,
      );
    } else if (
      command === 'down' ||
      command === 'trust' ||
      command === 'analytics-stop' ||
      command === 'pipeline-stop' ||
      command === 'archive-stop' ||
      command === 'archive-restart'
    ) {
      const site = appliedInstallation(name, docker);
      if (command === 'down') down(site);
      else if (command === 'archive-stop' || command === 'archive-restart') {
        if (!site.model.services[archiveService])
          throw new Error('Archive overlay is not selected');
        assertOwnership(site);
        site.compose([command === 'archive-stop' ? 'stop' : 'restart', archiveService]);
      } else if (command === 'analytics-stop' || command === 'pipeline-stop') {
        assertOwnership(site);
        site.compose([
          'stop',
          ...(command === 'pipeline-stop' ? pipelineServices : analyticsServices),
        ]);
      } else {
        console.log(`Public CA certificate: ${exportCertificate(site)}`);
        console.log(
          'Trust this public certificate manually. Never export the private key.',
        );
      }
    } else {
      const site = installation(
        name,
        docker,
        false,
        [
          'up',
          'analytics-up',
          'archive-up',
          'pipeline-up',
          'pipeline-analytics-up',
          'restart',
          'bootstrap',
        ].includes(command),
      );
      if (command === 'pipeline-up' || command === 'pipeline-analytics-up') {
        const pipeline = pipelineInstallation(
          site,
          privateJson(site.path, 'pipeline.json'),
        );
        up(
          command === 'pipeline-analytics-up'
            ? analyticsInstallation(pipeline)
            : pipeline,
        );
        console.log(
          'The local device pipeline started for the configured loopback listener.',
        );
      } else if (command === 'archive-up') {
        up(archiveInstallation(site, privateJson(site.path, 'archive.json')));
        console.log('Archive worker started for the configured tenant.');
      } else if (command === 'analytics-up') {
        up(analyticsInstallation(site));
        console.log(
          'Analytics processes started; qualify queue progress and receiver delivery separately.',
        );
      } else if (command === 'up') {
        up(site);
        console.log(`Ready: https://localhost:${site.settings.httpsPort}`);
      } else if (command === 'restart') {
        assertOwnership(site);
        site.compose(['restart'], { timeout: 120000 });
        up(site);
      } else if (command === 'bootstrap') {
        assertOwnership(site);
        const bootstrap = privateJson(site.path, 'bootstrap.json');
        if (Object.keys(bootstrap).sort().join(',') !== 'actorId,authority,subject')
          throw new Error('Bootstrap requires exactly actorId, authority, subject.');
        for (const value of Object.values(bootstrap))
          if (typeof value !== 'string' || !value || /[\r\n\0]/u.test(value))
            throw new Error('Invalid bootstrap identifier');
        if (bootstrap.authority !== site.settings.oidc.authority)
          throw new Error('Bootstrap authority differs from configured OIDC authority');
        // Values go into the child environment, not argv or console.
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
              FLEETIQ_BOOTSTRAP_ACTOR_ID: bootstrap.actorId,
              FLEETIQ_BOOTSTRAP_AUTHORITY_ID: bootstrap.authority,
              FLEETIQ_BOOTSTRAP_EXTERNAL_SUBJECT: bootstrap.subject,
            },
          },
        );
      } else
        throw new Error(
          'Use: pnpm local init|sources|build|up|analytics-up|analytics-stop|archive-up|archive-stop|archive-restart|pipeline-up|pipeline-analytics-up|pipeline-stop|down|restart|trust|bootstrap [instance]',
        );
    }
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
