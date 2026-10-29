/** Public URLs shared by the test issuer's client registration and CSP. */
export const issuerOrigin = 'https://issuer.test:9443';
export const browserOrigin = 'https://fleet.test:8443';
export const callbackUri = `${browserOrigin}/api/v1/auth/callback`;
// Chromium applies form-action to the redirect chain after consent submission.
// Permit only the issuer and its registered relying-party callback.
export const interactionCsp = `default-src 'none'; form-action 'self' ${callbackUri}; base-uri 'none'`;
