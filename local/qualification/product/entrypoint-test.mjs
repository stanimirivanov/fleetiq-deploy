import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Linux image build executes the actual entrypoint with only mounted-path/exec
// substitutions. Never substitute the shell logic or claim Windows ran Bash.
const directory = mkdtempSync(join(tmpdir(), 'fleetiq-entrypoint-'));
try {
  const password = join(directory, 'database_password'),
    secret = join(directory, 'oidc_client_secret');
  const token = randomBytes(32).toString('hex');
  writeFileSync(password, randomBytes(32).toString('hex'));
  const script = readFileSync('/fixture/local/backend-entrypoint.sh', 'utf8')
    .replaceAll('/run/secrets/database_password', password)
    .replaceAll('/run/secrets/oidc_client_secret', secret)
    .replace(
      'exec /usr/local/bin/fleetiq-server "$@"',
      'if [[ -v FLEETIQ_OIDC_CLIENT_SECRET ]]; then [[ "$FLEETIQ_OIDC_CLIENT_SECRET" == "$EXPECTED_VALUE" ]] || exit 8; fi; exit 0',
    );
  const path = join(directory, 'entrypoint.sh');
  writeFileSync(path, script);
  const identity = {
    FLEETIQ_BROWSER_ORIGIN: 'https://fleet.test:8443',
    FLEETIQ_OIDC_ISSUER: 'https://issuer.test:9443',
    FLEETIQ_OIDC_CLIENT_ID: 'qualification',
    FLEETIQ_OIDC_IDENTITY_AUTHORITY: 'qualification',
    EXPECTED_VALUE: token,
  };
  for (const [label, environment, bytes, expected] of [
    ['no-identity', {}, token, 0],
    ['complete-lf', identity, `${token}\n`, 0],
    ['complete-crlf', identity, `${token}\r\n`, 0],
    ['partial', { FLEETIQ_OIDC_CLIENT_ID: 'qualification' }, token, 1],
    ['empty', identity, '', 1],
    ['embedded-cr', identity, `${token}\rbroken`, 1],
    ['embedded-lf', identity, `${token}\nbroken`, 1],
  ]) {
    writeFileSync(secret, bytes);
    const result = spawnSync('/bin/bash', [path], {
      env: { PATH: '/usr/bin:/bin', ...environment },
      stdio: 'ignore',
      timeout: 10000,
      shell: false,
    });
    assert.equal(result.status, expected, `Entrypoint fixture failed: ${label}`);
  }
} finally {
  rmSync(directory, { recursive: true });
}
