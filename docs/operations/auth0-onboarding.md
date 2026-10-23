# Auth0 onboarding for D06

## Prerequisites & Environment Inputs

- Auth0 tenant access to edit Applications, Connections and Users; local Windows account with permission to set folder access.
- Tools: browser, local text editor and Windows File Explorer. No credential-handling script or CLI is required.
- Public origin: `https://fleet.local.test:18443`; internal Gateway listener: `8443`.
- Public configuration: `C:\Source\fleet-iq\fleetiq-deploy\target\d06-preparation\auth0-20261023\runtime-overrides.json` (existing ignored JSON rehearsal input).
- Private directory: `C:\Users\sonof\AppData\Local\FleetIQ\d06-auth0` (outside Git).
- Client-secret file: `C:\Users\sonof\AppData\Local\FleetIQ\d06-auth0\client-secret` (UTF-8 plain text, no extension).
- Operator-subject file: `C:\Users\sonof\AppData\Local\FleetIQ\d06-auth0\operator-subject` (UTF-8 plain text, no extension).

## Step-by-Step Execution Guide

### Step 1: Restrict access to the private directory

1. Action:
   - In File Explorer, create or open the private directory listed above.
   - Open Properties → Security → Advanced. Disable inheritance; remove inherited access for other users and broad groups. Retain access for your Windows account and SYSTEM. Check existing explicit permissions and both files' effective access.
2. Expected Result:
   - The directory exists; other ordinary user accounts cannot read its files. Existing files are preserved.

### Step 2: Configure the Auth0 application

1. Action:
   - Open Auth0 Dashboard → Applications → Applications → FleetIQ → Settings. Create the application as a Regular Web Application if it does not exist.
   - Set Application Type to **Regular Web Application**.
   - Set Allowed Callback URLs to `https://fleet.local.test:18443/api/v1/auth/callback`.
   - Set Allowed Logout URLs to `https://fleet.local.test:18443/`.
   - In Credentials / Token Endpoint Authentication Method, select **Basic** (`client_secret_basic`). Confirm Authorization Code is enabled and ID token signing uses **RS256**. Save changes.
2. Expected Result:
   - Saved settings show the exact callback, application type and authentication method; Settings displays Domain, Client ID and Client Secret.

### Step 3: Enable the user's connection

1. Action:
   - Open User Management → Users → the intended operator. Note the Connection; confirm the user is not blocked.
   - Open Applications → Applications → FleetIQ → Connections and enable that exact connection. For a database connection, its Authentication → Database → connection → Applications tab is an alternative.
   - Complete any verification or MFA requirements configured for that user.
2. Expected Result:
   - The user's connection is enabled for FleetIQ and the user can meet its sign-in requirements.

### Step 4: Set the public runtime inputs

1. Action:
   - Target File: `C:\Source\fleet-iq\fleetiq-deploy\target\d06-preparation\auth0-20261023\runtime-overrides.json`.
   - Edit the existing JSON; preserve image, database and network selections. Set these dotted JSON keys:
     - `public.host`: `fleet.local.test`; `public.port`: `18443`; `gateway.listenerPort`: `8443`.
     - `backend.oidc.issuer`: `https://<Domain from Auth0 Application Settings>/` (selected domain: `dev-iqzkuoz81x7gifev.us.auth0.com`).
     - `backend.oidc.clientId`: the exact **Client ID** from the same application's Settings.
     - `backend.oidc.authority`: `auth0-fleetiq-local`.
     - `backend.oidc.clientSecret.name`: `fleetiq-oidc`; `backend.oidc.clientSecret.key`: `client-secret`.
     - `backend.oidc.additionalTrust.name`: `""`.
2. Expected Result:
   - Valid JSON contains the selected public inputs and Secret reference, with no client-secret value or user subject. This file remains an offline rehearsal, not an installation manifest.

### Step 5: Save the client secret

1. Action:
   - Source: Auth0 Dashboard → Applications → Applications → FleetIQ → Settings / Credentials → **Client Secret**.
   - Target File: `C:\Users\sonof\AppData\Local\FleetIQ\d06-auth0\client-secret`.
   - Using a local editor, save only the exact secret as UTF-8 without BOM, quotes, key names, spaces or a trailing newline. Preserve an existing correct file. Do not add `.txt`.
2. Expected Result:
   - The private file contains one raw value. Its eventual Kubernetes target is namespace `fleetiq-apps`, Secret `fleetiq-oidc`, key `client-secret`; creating that Secret is a separate authorized installation step.

### Step 6: Save the operator subject

1. Action:
   - Source: Auth0 Dashboard → User Management → Users → intended operator → Details / Raw JSON → **user_id**.
   - Target File: `C:\Users\sonof\AppData\Local\FleetIQ\d06-auth0\operator-subject`.
   - Save only the exact `user_id` as UTF-8 without BOM, quotes, key names or a trailing newline. Do not substitute an email or client ID; do not add `.txt`.
2. Expected Result:
   - The private file contains the exact subject for bootstrap input `FLEETIQ_BOOTSTRAP_EXTERNAL_SUBJECT`. The separately authorized bootstrap uses `FLEETIQ_BOOTSTRAP_ACTOR_ID=initial-operator` and `FLEETIQ_BOOTSTRAP_AUTHORITY_ID=auth0-fleetiq-local`.

### Step 7: Hand off file locations

1. Action:
   - Provide only the absolute client-secret and operator-subject file paths and confirmation that Steps 1–6 are complete. Do not send either file's contents.
2. Expected Result:
   - The installer has explicit input locations; no Secret creation, bootstrap or live installation is implied.

## Verification Gate

After the separately authorized D06 installation, trusted HTTPS setup and operator bootstrap, open `https://fleet.local.test:18443/` → Sign in → authenticate as the selected Auth0 user → return to FleetIQ. Pass only when the callback succeeds and FleetIQ displays the authenticated operator session. Record this gate as **pending** until that browser flow passes; saved inputs alone are not a sign-in pass.

## Reference & Rationale

- FleetIQ uses backend OIDC authorization-code login with PKCE and server-managed browser sessions. No browser Auth0 SDK, custom API audience or Management API token is required. FleetIQ logout clears its session; Auth0 SSO may remain.
- Auth0 login does not grant FleetIQ permissions. Bootstrap establishes the initial operator; tenant creation and tenant grants are separate. See the published [bootstrap contract](https://github.com/stanimirivanov/fleetiq-platform/blob/9260d135a06dfb9f92271a561c306a69533743b0/docs/operations/platform-bootstrap.md) and [browser identity contract](https://github.com/stanimirivanov/fleetiq-platform/blob/9260d135a06dfb9f92271a561c306a69533743b0/docs/operations/browser-identity.md).
- The public JSON rehearsal contains fixture namespace/quota/API-server inputs. Do not apply it directly. Revalidate issuer endpoint DNS/egress from the actual target; do not disable TLS verification or allow unrestricted egress. See [D06 qualification](d06-qualification.md).
- [Auth0 application setup](https://auth0.com/docs/quickstart/webapp/express/index) and [database connections](https://auth0.com/docs/authenticate/database-connections).
