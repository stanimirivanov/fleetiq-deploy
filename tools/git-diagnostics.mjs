/** Map secret-bearing Git stderr to fixed diagnostic categories; never return raw text. */
export function gitFailureCategory(stderr, launchCode) {
  if (launchCode === 'ETIMEDOUT') return 'network-or-timeout';
  if (launchCode) return 'tool-unavailable';
  const text = typeof stderr === 'string' ? stderr : '';
  if (
    /certificate.*(?:problem|failed|verify)|ssl.*certificate|unable to get local issuer/iu.test(
      text,
    )
  )
    return 'tls-trust-failed';
  if (
    /could not resolve|failed to connect|connection timed out|connection reset|network is unreachable|operation timed out/iu.test(
      text,
    )
  )
    return 'network-or-timeout';
  if (
    /authentication failed|could not read username|invalid username|bad credentials|invalid.*token|token.*(?:expired|revoked)|not logged into/iu.test(
      text,
    )
  )
    return 'authentication-failed';
  if (
    /repository not found|repository .* does not exist|does not appear to be a git repository|requested url returned error: (?:403|404)|saml|access denied|permission denied/iu.test(
      text,
    )
  )
    return 'repository-access-unavailable';
  if (
    /couldn't find remote ref|not our ref|unadvertised object|couldn't find remote object/iu.test(
      text,
    )
  )
    return 'revision-unavailable';
  return 'command-failed';
}

export const sourceFailureGuidance = {
  'authentication-failed':
    'Check whether FLEETIQ_SOURCE_READ_TOKEN is valid, unexpired and authorized for the source repository. Do not print the credential.',
  'repository-access-unavailable':
    'Verify the reviewed repository exists and FLEETIQ_SOURCE_READ_TOKEN has Contents:read access to both fleetiq-platform and fleetiq-ux; check organization authorization if required. A private repository can report not found when access is denied.',
  'revision-unavailable':
    'Verify the exact locked commit is available from the reviewed origin; do not replace it with a branch or an unreviewed pin.',
  'tls-trust-failed':
    'Check runner trust and any approved proxy CA; do not disable Git TLS verification.',
  'network-or-timeout':
    'Check runner DNS/connectivity and service availability, then retry the same reviewed selection.',
  'tool-unavailable':
    'Check Git and the GitHub CLI credential helper are installed on the runner.',
  'command-failed':
    'The Git failure was not recognized. Inspect repository access and runner prerequisites privately; raw command output is intentionally not logged.',
};
