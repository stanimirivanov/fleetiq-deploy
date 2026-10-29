import { parseApiFailure } from '../../local/qualification/product/api-failure.mjs';
import { parseBrowserFailure } from '../../local/qualification/product/browser-failure.mjs';
import { assertResource } from './policy.mjs';

const services = new Set([
  'init',
  'artifacts',
  'postgres',
  'backend',
  'issuer',
  'edge',
  'ingest',
  'replay',
  'semantic',
  'projection',
  'browser',
]);
const states = new Set([
  'created',
  'running',
  'paused',
  'restarting',
  'removing',
  'exited',
  'dead',
]);
const healthStates = new Set(['starting', 'healthy', 'unhealthy']);
const exitCode = (value) =>
  Number.isInteger(value) && value >= -1 && value <= 255 ? value : null;
/** Never return matching text. Categories are fixed; arbitrary log content stays private. */
export function failureCategory(text) {
  const patterns = [
    ['module-resolution', /ERR_MODULE_NOT_FOUND|Cannot find (?:module|package)/u],
    ['permission-denied', /EACCES|permission denied/iu],
    ['read-only-filesystem', /EROFS|read-only file system/iu],
    ['out-of-memory', /heap out of memory|allocation failed|cannot allocate memory/iu],
    ['oidc-discovery', /OIDC provider is unavailable or misconfigured/u],
    [
      'identity-configuration',
      /Incomplete identity configuration|Invalid OIDC secret file|Empty identity setting/u,
    ],
    [
      'database-unavailable',
      /connection refused|could not connect|database is not yet accepting connections/iu,
    ],
    [
      'tls-trust',
      /CERT_HAS_EXPIRED|CERT_SIGNATURE_FAILURE|UNABLE_TO_VERIFY_LEAF_SIGNATURE|UNABLE_TO_GET_ISSUER_CERT|SELF_SIGNED_CERT|ERR_TLS_CERT_ALTNAME_INVALID/u,
    ],
    [
      'mount-configuration',
      /invalid mount config|failed to mount|invalid subpath|no such file or directory/iu,
    ],
  ];
  return patterns.find(([, pattern]) => pattern.test(text))?.[0] ?? 'unclassified';
}
/** Project only identity-checked state and bounded private logs. No environment,
 * raw State.Error/health output, URLs, process output, or credential bytes escape.
 */
export function serviceDiagnostic(resource, privateLogs, { project, owner }) {
  assertResource(resource, project, owner, 'container');
  const service = resource.Config?.Labels?.['com.docker.compose.service'];
  if (!services.has(service)) throw new Error('Unreviewed diagnostic service');
  const state = resource.State ?? {};
  const health = state.Health ?? {};
  const output = [
    state.Error,
    ...(health.Log ?? []).slice(-3).map((item) => item.Output),
    privateLogs.stdout,
    privateLogs.stderr,
  ]
    .filter((value) => typeof value === 'string')
    .join('\n');
  const apiFailure = service === 'browser' ? parseApiFailure(output) : undefined;
  const browserFailure =
    service === 'browser' ? parseBrowserFailure(output) : undefined;
  return {
    ...(browserFailure ? { browserFailure } : {}),
    ...(apiFailure ? { apiFailure } : {}),
    service,
    state: states.has(state.Status) ? state.Status : 'unknown',
    exitCode: exitCode(state.ExitCode),
    oomKilled: state.OOMKilled === true,
    health: healthStates.has(health.Status) ? health.Status : 'none',
    failingStreak:
      Number.isInteger(health.FailingStreak) && health.FailingStreak >= 0
        ? Math.min(health.FailingStreak, 10000)
        : null,
    healthExitCode: exitCode(health.Log?.at(-1)?.ExitCode),
    category: state.OOMKilled ? 'out-of-memory' : failureCategory(output),
  };
}
/** Diagnostic collection can never replace the original failure or count as acceptance. */
export function collectServiceDiagnostics({ project, owner, command, capture }) {
  const result = { outcome: 'available', services: [] };
  try {
    const ids = command([
      'ps',
      '-aq',
      '--filter',
      `label=com.docker.compose.project=${project}`,
    ])
      .split(/\s+/u)
      .filter(Boolean);
    if (ids.length > 32) throw new Error('Diagnostic container budget exceeded');
    for (const id of ids) {
      try {
        if (!/^[a-f0-9]{12,64}$/u.test(id))
          throw new Error('Invalid container identity');
        const [resource] = JSON.parse(
          command(['inspect', id], { timeout: 10000, maxBuffer: 128 * 1024 }),
        );
        assertResource(resource, project, owner, 'container');
        if (!services.has(resource.Config?.Labels?.['com.docker.compose.service']))
          throw new Error('Unknown service');
        let logs = { stdout: '', stderr: '' };
        try {
          logs = capture(['logs', '--tail', '40', id], {
            timeout: 10000,
            maxBuffer: 64 * 1024,
          });
        } catch {
          result.outcome = 'incomplete';
        }
        result.services.push(serviceDiagnostic(resource, logs, { project, owner }));
      } catch {
        result.outcome = 'incomplete';
      }
    }
  } catch {
    result.outcome = 'incomplete';
  }
  return result;
}
export function diagnosticSummary(value) {
  return (
    value.services
      .map(
        (service) =>
          `${service.service}: ${service.state}, health=${service.health}, exit=${service.exitCode ?? 'unknown'}, category=${service.category}${service.browserFailure ? `, browser-step=${service.browserFailure.step}, browser-cause=${service.browserFailure.cause}` : ''}${service.apiFailure ? `, operation=${service.apiFailure.operation}, status=${service.apiFailure.status}, expected=${service.apiFailure.expected}` : ''}`,
      )
      .join('; ') || 'service diagnostics unavailable'
  );
}
