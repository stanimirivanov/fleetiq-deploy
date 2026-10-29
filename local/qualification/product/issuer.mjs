import { readFileSync } from 'node:fs';
import { createServer } from 'node:https';
import Provider from 'oidc-provider';

// This issuer is reachable only on the disposable internal test network. It is
// intentionally not a production identity deployment or password authenticator.
const provider = new Provider('https://issuer.test:9443', {
  clients: [
    {
      client_id: 'fleetiq-qualification',
      client_secret: readFileSync('/run/issuer/oidc_client_secret', 'utf8').trim(),
      redirect_uris: ['https://fleet.test:8443/api/v1/auth/callback'],
      response_types: ['code'],
      grant_types: ['authorization_code'],
      token_endpoint_auth_method: 'client_secret_basic',
    },
  ],
  cookies: { keys: [readFileSync('/run/issuer/cookie-key', 'utf8').trim()] },
  features: { devInteractions: { enabled: false } },
  claims: { openid: ['sub'] },
  findAccount: async (_ctx, id) =>
    id === 'operator-a'
      ? { accountId: id, claims: async () => ({ sub: id }) }
      : undefined,
  interactions: { url: (_ctx, interaction) => `/interaction/${interaction.uid}` },
});
provider.on('server_error', () => {
  console.error('OIDC fixture request failed');
});
const callback = provider.callback();
createServer(
  {
    key: readFileSync('/run/issuer/tls.key'),
    cert: readFileSync('/run/issuer/tls.crt'),
  },
  async (req, res) => {
    try {
      if (!/^\/interaction\/[a-zA-Z0-9_-]+$/u.test(req.url)) {
        callback(req, res);
        return;
      }
      const details = await provider.interactionDetails(req, res);
      if (req.method === 'GET') {
        res.writeHead(200, {
          'Content-Type': 'text/html',
          'Cache-Control': 'no-store',
          'Content-Security-Policy':
            "default-src 'none'; form-action 'self'; base-uri 'none'",
        });
        res.end(
          '<!doctype html><html lang="en"><title>Disposable qualification issuer</title><form method="post"><button>Continue as test operator</button></form></html>',
        );
      } else if (
        req.method === 'POST' &&
        req.headers.origin === 'https://issuer.test:9443'
      ) {
        if (details.prompt.name === 'login') {
          await provider.interactionFinished(
            req,
            res,
            { login: { accountId: 'operator-a' } },
            { mergeWithLastSubmission: false },
          );
        } else if (details.prompt.name === 'consent') {
          const grant = details.grantId
            ? await provider.Grant.find(details.grantId)
            : new provider.Grant({
                accountId: details.session.accountId,
                clientId: details.params.client_id,
              });
          if (details.prompt.details.missingOIDCScope)
            grant.addOIDCScope(details.prompt.details.missingOIDCScope.join(' '));
          if (details.prompt.details.missingOIDCClaims)
            grant.addOIDCClaims(details.prompt.details.missingOIDCClaims);
          const grantId = await grant.save();
          await provider.interactionFinished(req, res, { consent: { grantId } });
        } else {
          res.writeHead(400);
          res.end();
        }
      } else {
        res.writeHead(403);
        res.end();
      }
    } catch {
      if (!res.headersSent) res.writeHead(500);
      res.end();
    }
  },
).listen(9443, '0.0.0.0');
