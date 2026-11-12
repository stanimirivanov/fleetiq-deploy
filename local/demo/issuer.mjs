import { readFileSync } from 'node:fs';
import { createServer } from 'node:https';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import Provider from 'oidc-provider';
import { demoIdentity, loadDemoIdentity } from '../../tools/demo-identity.mjs';

/** Local synthetic login only; persistent keys, deliberately ephemeral OIDC models. */
export function createDemoIssuer(directory) {
  const state = loadDemoIdentity(directory);
  const provider = new Provider(demoIdentity.issuer, {
    clients: [
      {
        client_id: state.clientId,
        client_secret: state.clientSecret,
        redirect_uris: [demoIdentity.callback],
        response_types: ['code'],
        grant_types: ['authorization_code'],
        token_endpoint_auth_method: 'client_secret_basic',
      },
    ],
    jwks: state.jwks,
    cookies: {
      keys: [state.cookieKey],
      long: { httpOnly: true, secure: true, sameSite: 'lax', signed: true },
      short: { httpOnly: true, secure: true, sameSite: 'lax', signed: true },
    },
    features: { devInteractions: { enabled: false } },
    ttl: {
      Session: 900,
      Interaction: 300,
      Grant: 900,
      AccessToken: 300,
      IdToken: 300,
      AuthorizationCode: 60,
    },
    pkce: { required: () => true },
    claims: { openid: ['sub'] },
    findAccount: async (_ctx, id) =>
      id === state.subject
        ? { accountId: id, claims: async () => ({ sub: id }) }
        : undefined,
    interactions: { url: (_ctx, interaction) => `/interaction/${interaction.uid}` },
  });
  provider.on('server_error', () => console.error('Demo issuer request failed'));
  const callback = provider.callback();
  const server = createServer(
    {
      key: readFileSync(resolve(directory, 'tls.key')),
      cert: readFileSync(resolve(directory, 'tls.crt')),
    },
    async (req, res) => {
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader(
        'Content-Security-Policy',
        `default-src 'none'; form-action 'self' ${demoIdentity.callback}; base-uri 'none'; frame-ancestors 'none'`,
      );
      try {
        if (
          req.headers.host !== new URL(demoIdentity.issuer).host ||
          (req.method === 'POST' &&
            req.url.startsWith('/interaction/') &&
            req.headers.origin !== demoIdentity.issuer)
        ) {
          res.writeHead(403);
          res.end();
          return;
        }
        if (!/^\/interaction\/[a-zA-Z0-9_-]+$/u.test(req.url)) {
          callback(req, res);
          return;
        }
        const details = await provider.interactionDetails(req, res);
        if (req.method === 'GET') {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(
            '<!doctype html><html lang="en"><title>FleetIQ local synthetic demo</title><p>Isolated demo only. Local users and processes are trusted.</p><form method="post"><button>Continue as synthetic demo operator</button></form></html>',
          );
        } else if (req.method === 'POST' && details.prompt.name === 'login') {
          await provider.interactionFinished(
            req,
            res,
            { login: { accountId: state.subject } },
            { mergeWithLastSubmission: false },
          );
        } else if (req.method === 'POST' && details.prompt.name === 'consent') {
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
          await provider.interactionFinished(req, res, {
            consent: { grantId: await grant.save() },
          });
        } else {
          res.writeHead(400);
          res.end();
        }
      } catch {
        if (!res.headersSent) res.writeHead(500);
        res.end();
      }
    },
  );
  server.requestTimeout = 10000;
  server.headersTimeout = 5000;
  server.maxConnections = 16;
  return server;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    if (process.argv.length !== 3) throw new Error('Invalid invocation');
    const server = createDemoIssuer(resolve(process.argv[2]));
    server.on('error', () => {
      console.error('Demo issuer startup failed');
      process.exitCode = 1;
    });
    server.listen(59443, '127.0.0.1');
    for (const signal of ['SIGTERM', 'SIGINT'])
      process.once(signal, () => {
        server.close();
        server.closeAllConnections();
      });
  } catch {
    console.error('Demo issuer startup failed; check private identity state');
    process.exitCode = 1;
  }
}
