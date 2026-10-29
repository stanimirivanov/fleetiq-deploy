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
  'device-to-web',
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
  'unknown',
]);
const causes = new Set([
  'content-security-policy',
  'certificate-trust',
  'timeout',
  'browser-closed',
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
]);
export function browserFailure(step, error, cspBlocked = false, uiCause) {
  const message = typeof error?.message === 'string' ? error.message : '';
  const cause = cspBlocked
    ? 'content-security-policy'
    : /ERR_CERT_[A-Z_]+/u.test(message)
      ? 'certificate-trust'
      : uiCause && causes.has(uiCause)
        ? uiCause
        : error?.name === 'TimeoutError' || /[Tt]imeout|[Tt]imed out/u.test(message)
          ? 'timeout'
          : /Target.*closed|browser.*closed/iu.test(message)
            ? 'browser-closed'
            : error?.name === 'AssertionError' || /expect\(/u.test(message)
              ? 'assertion'
              : 'unclassified';
  return { step: steps.has(step) ? step : 'unknown', cause };
}
export function formatBrowserFailure(value) {
  if (!steps.has(value.step) || !causes.has(value.cause))
    throw new Error('Unreviewed browser diagnostic');
  return `FleetIQ browser failure: step=${value.step}; cause=${value.cause}`;
}
export function parseBrowserFailure(text) {
  const match = /^FleetIQ browser failure: step=([a-z-]+); cause=([a-z-]+)\r?$/mu.exec(
    text,
  );
  return match && steps.has(match[1]) && causes.has(match[2])
    ? { step: match[1], cause: match[2] }
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
      if (text.includes('Choose the required context to review'))
        return 'metadata-context';
      return undefined;
    })
    .catch(() => undefined);
}
