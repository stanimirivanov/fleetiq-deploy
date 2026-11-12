import { demoSeedFailurePhases } from '../../../tools/demo-seed.mjs';

/** Closed diagnostics: provider URLs, authorization codes and assertion bodies never escape. */
const steps = new Set([
  'trust-store',
  'browser-launch',
  'application',
  'begin-login',
  'login-prompt',
  'consent-prompt',
  'callback',
  'hostname-check',
  'session-check',
  'commissioning',
  'demo-metadata-reconciliation',
  'device-to-web',
  'device-connect',
  'device-identification',
  'device-record',
  'device-close',
  'current-property',
  'original-provenance',
  'inspector-open',
  'inspector-navigation',
  'inspector-selection',
  'inspector-readings',
  'inspector-provenance',
  'inspector-history',
  'live-start',
  'live-update',
  'live-recovery-send',
  'live-recovery-reading',
  'live-recovery-provenance',
  'live-recovery-generation',
  'map-navigation',
  'map-readiness',
  'map-leave',
  'map-disposal',
  'analytics-configure',
  'analytics-anomaly',
  'analytics-alert-browser',
  'analytics-exhaustion',
  'analytics-recovery',
  'analytics-duplicate',
  'analytics-resolution',
  'logical-storage-usage',
  'logical-storage-bounds',
  'normal-compose-history-controls',
  'normal-compose-inspector',
  'bounded-browser-export',
  'browser-export-request',
  'browser-export-status',
  'browser-export-response',
  'browser-export-metadata',
  'browser-export-file',
  'browser-export-ready',
  'browser-export-download',
  'archive-lifecycle',
  'restored-export',
  'mixed-history-window',
  'mixed-history-membership',
  'mixed-history-hot-inspect',
  'mixed-history-restored-inspect',
  'restored-inspect-revoked',
  'unknown',
]);
const causes = new Set([
  'content-security-policy',
  'certificate-trust',
  'timeout',
  'navigation-timeout',
  'response-timeout',
  'locator-timeout',
  'action-timeout',
  'browser-closed',
  'browser-page-crashed',
  'locator-ambiguous',
  'navigation-interrupted',
  'assertion',
  'metadata-invalid-response',
  'metadata-unavailable',
  'metadata-context',
  'session-ended',
  'sign-in-unavailable',
  'sign-in-required',
  'tenant-discovery',
  'tenant-discovery-invalid-response',
  'tenant-discovery-unavailable',
  'tenant-discovery-loading',
  'application-error',
  'unclassified',
  ...demoSeedFailurePhases.map((phase) => `demo-seed-${phase}`),
  'tcp-connection',
  'tcp-closed',
  'tcp-deadline',
  'tcp-reply-budget',
  'tcp-identification-rejected',
  'tcp-record-rejected',
]);
export function browserFailure(step, error, cspBlocked = false, uiCause) {
  const message = typeof error?.message === 'string' ? error.message : '';
  const deviceCause = step.startsWith('device-')
    ? [
        ['Device connection failed', 'tcp-connection'],
        ['Device connection closed', 'tcp-closed'],
        ['Device deadline exceeded', 'tcp-deadline'],
        ['Device reply budget exceeded', 'tcp-reply-budget'],
        [
          'Registered device identification must be accepted',
          'tcp-identification-rejected',
        ],
        ['Only durable acceptance releases the record ACK', 'tcp-record-rejected'],
      ].find(([fixed]) => message.includes(fixed))?.[1]
    : undefined;
  // Project only known Playwright operation prefixes; never retain the error body.
  const timeoutCause = /[Tt]imeout|[Tt]imed out/u.test(message)
    ? [
        ['page.goto:', 'navigation-timeout'],
        ['page.waitForResponse:', 'response-timeout'],
        ['locator.textContent:', 'locator-timeout'],
        ['locator.click:', 'action-timeout'],
      ].find(([prefix]) => message.startsWith(prefix))?.[1]
    : undefined;
  const seedCause =
    step === 'demo-metadata-reconciliation' && causes.has(`demo-seed-${error?.phase}`)
      ? `demo-seed-${error.phase}`
      : undefined;
  const browserCause = [
    ['Page crashed', 'browser-page-crashed'],
    ['strict mode violation:', 'locator-ambiguous'],
    ['is interrupted by another navigation', 'navigation-interrupted'],
  ].find(([fixed]) => message.includes(fixed))?.[1];
  const cause =
    deviceCause ??
    seedCause ??
    (cspBlocked
      ? 'content-security-policy'
      : /ERR_CERT_[A-Z_]+/u.test(message)
        ? 'certificate-trust'
        : error?.name === 'AssertionError' || /expect\(/u.test(message)
          ? 'assertion'
          : browserCause
            ? browserCause
            : uiCause && uiCause !== 'metadata-context' && causes.has(uiCause)
              ? uiCause
              : timeoutCause
                ? timeoutCause
                : error?.name === 'TimeoutError' ||
                    /[Tt]imeout|[Tt]imed out/u.test(message)
                  ? 'timeout'
                  : /Target.*closed|browser.*closed/iu.test(message)
                    ? 'browser-closed'
                    : 'unclassified');
  const frame =
    typeof error?.stack === 'string'
      ? error.stack
          .split('\n')
          .slice(1)
          .map((line) =>
            /^\s+at .*\/local\/qualification\/product\/(lifecycle|scenario|page|normal-edge|analytics-alerts)\.mjs:([1-9][0-9]{0,3}):[0-9]+\)?$/u.exec(
              line,
            ),
          )
          .find(Boolean)
      : undefined;
  return {
    step: steps.has(step) ? step : 'unknown',
    cause,
    ...(frame ? { source: { module: frame[1], line: Number(frame[2]) } } : {}),
  };
}
export function formatBrowserFailure(value) {
  if (!steps.has(value.step) || !causes.has(value.cause))
    throw new Error('Unreviewed browser diagnostic');
  if (
    value.source &&
    (!['lifecycle', 'scenario', 'page', 'normal-edge', 'analytics-alerts'].includes(
      value.source.module,
    ) ||
      !Number.isInteger(value.source.line) ||
      value.source.line < 1 ||
      value.source.line > 9999)
  )
    throw new Error('Unreviewed browser source');
  return `FleetIQ browser failure: step=${value.step}; cause=${value.cause}${value.source ? `; source=${value.source.module}:${value.source.line}` : ''}`;
}
export function parseBrowserFailure(text) {
  const match =
    /^FleetIQ browser failure: step=([a-z-]+); cause=([a-z-]+)(?:; source=(lifecycle|scenario|page|normal-edge|analytics-alerts):([1-9][0-9]{0,3}))?\r?$/mu.exec(
      text,
    );
  return match && steps.has(match[1]) && causes.has(match[2])
    ? {
        step: match[1],
        cause: match[2],
        ...(match[3] ? { source: { module: match[3], line: Number(match[4]) } } : {}),
      }
    : undefined;
}

/** Compare against fixed product fallback copy; never return or log DOM text. */
export async function browserUiCause(page) {
  if (!page || page.isClosed()) return undefined;
  return page
    .evaluate(() => {
      const text = document.body?.textContent ?? '';
      if (text.includes('Sign-in unavailable')) return 'sign-in-unavailable';
      if (text.includes('Sign in to FleetIQ')) return 'sign-in-required';
      if (text.includes('Invalid tenant discovery response.'))
        return 'tenant-discovery-invalid-response';
      if (text.includes('Tenant discovery is unavailable.'))
        return 'tenant-discovery-unavailable';
      if (text.includes('Loading permitted tenants')) return 'tenant-discovery-loading';
      if (
        text.includes('Tenant access could not be checked.') ||
        text.includes('Checking current tenant access')
      )
        return 'tenant-discovery';
      if (text.includes('The service returned an invalid response.'))
        return 'metadata-invalid-response';
      if (text.includes('Your session has ended.')) return 'session-ended';
      if (text.includes('The metadata service is unavailable.'))
        return 'metadata-unavailable';
      return undefined;
    })
    .catch(() => undefined);
}
