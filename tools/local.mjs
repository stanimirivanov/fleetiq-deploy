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
import { buildImages, prepareSources } from './sources.mjs';

try {
  const [command, name = 'development'] = process.argv.slice(2);
  if (command === 'sources') prepareSources();
  else {
    const docker = context();
    if (command === 'build') buildImages(docker);
    else if (command === 'init') {
      initialize(name, docker);
      console.log(
        `Created private configuration: .local/instances/${name}/config.json`,
      );
    } else if (command === 'down' || command === 'trust') {
      const site = appliedInstallation(name, docker);
      if (command === 'down') down(site);
      else {
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
        ['up', 'restart', 'bootstrap'].includes(command),
      );
      if (command === 'up') {
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
          'Use: pnpm local init|sources|build|up|down|restart|trust|bootstrap [instance]',
        );
    }
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
