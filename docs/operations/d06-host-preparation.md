# D06 host and HTTPS prerequisites

These are operator-run preparation steps. They do not authorize cluster creation.
Use existing certificate files instead of Steps 3-4 when a matching trusted
certificate/key already exists. Do not overwrite an existing CA or private key.

### Step 1: Free disk and reserve an idle window

1. Action:
   - Free 15-20Gi of additional disk headroom on the Docker backing filesystem without removing FleetIQ state, Docker data or another project's caches/resources. Recheck Docker's actual backing disk.
   - Confirm an idle benchmark window before the later live approval.
2. Expected Result:
   - Report current free disk/RAM and the available execution window. No engine restart, prune or retained-target deletion is part of this procedure.

### Step 2: Configure the local hostname

1. Action:
   - Use an administrator editor to open `/etc/hosts`.
   - Add `127.0.0.1 fleet.local.test` once; preserve existing entries and resolve conflicting entries explicitly.
   - Run `getent ahostsv4 fleet.local.test` in a normal terminal.
2. Expected Result:
   - The normal system resolver returns `127.0.0.1`; no unrelated address is returned for that name.

### Step 3: Prepare local certificate paths

1. Action:
   - Install the standard `mkcert` utility using the [upstream Linux instructions](https://github.com/FiloSottile/mkcert#linux), or use an already reviewed installation. Record `mkcert -version`.
   - Create private directories `/var/lib/fleetiq/tls/ca` and `/var/lib/fleetiq/tls/d06`. Use `install -d -m 700` as the owning user; keep them outside Git.
2. Expected Result:
   - The tool is available and the private directories exist. No CA trust or certificate has been created by the agent.

### Step 4: Trust the local CA and issue the leaf certificate

1. Action:
   - Run these standard commands yourself; `-install` changes your local trust store. Review any elevation prompt.

   ```bash
   export CAROOT='/var/lib/fleetiq/tls/ca'
   mkcert -install
   mkcert -cert-file /var/lib/fleetiq/tls/d06/fleet.local.test.crt -key-file /var/lib/fleetiq/tls/d06/fleet.local.test.key fleet.local.test
   ```

2. Expected Result:
   - PEM certificate: `/var/lib/fleetiq/tls/d06/fleet.local.test.crt`.
   - PEM private key: `/var/lib/fleetiq/tls/d06/fleet.local.test.key`.
   - Public CA: `/var/lib/fleetiq/tls/ca/rootCA.pem`.
   - The selected browser trusts the CA; restart the browser if needed. Keep `rootCA-key.pem` private and never send or install it into Kubernetes.

The custom CA location and output flags follow [mkcert's documented options](https://github.com/FiloSottile/mkcert#advanced-topics). This CA is for development, not a production issuer. No certificate/key contents belong in chat or Git.

### Step 5: Provide installation input locations

1. Action:
   - Report the certificate, leaf key and public CA **paths only**, plus completion of Steps 1-4.
   - Confirm the existing Auth0 private input locations from [Auth0 onboarding](auth0-onboarding.md); do not send their contents.
   - Prepare separate private files for read-only Git access and GHCR pull access. The installer needs their paths and the GitHub actor, not token values in chat.
2. Expected Result:
   - The [approval package](d06-installation-approval.md) can name all private input references. TLS key/certificate matching and actual trusted HTTPS remain live acceptance gates.

## Verification gate

After approved installation, open `https://fleet.local.test:18443/` in the chosen
browser. Require trusted TLS for that exact hostname and complete the Auth0
[sign-in gate](auth0-onboarding.md). Do not bypass certificate errors.
