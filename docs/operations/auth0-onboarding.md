# Auth0 onboarding for the D06 installation

## TL;DR

Use an Auth0 **Regular Web Application** and enable the connection containing
its users. FleetIQ's backend performs OIDC authorization-code login and owns the
browser session; Auth0 roles and successful login do not grant FleetIQ access.
Complete the application settings below, save the client secret privately, and
identify the first operator by its exact provider subject. This guide configures
inputs; it does not authorize or perform a Kubernetes installation.

## 1. Configure the confidential application

In Auth0 Dashboard, open **Applications → Applications → your application**.
Confirm its client ID matches the operator's selected client, and set:

| Setting | D06 selection |
| --- | --- |
| Application type | Regular Web Application |
| Authorization flow | Authorization Code; FleetIQ adds PKCE S256 and requests `openid` |
| Token endpoint authentication | Basic / `client_secret_basic`; see the application's Credentials settings or Token Endpoint Authentication Method |
| Allowed Callback URLs | `https://fleet.local.test:18443/api/v1/auth/callback` |
| Allowed Logout URLs | `https://fleet.local.test:18443/` if registering a return URL |
| ID token signing | RS256 with published signing keys |

Save the settings. The public origin is the proposed D06 target, not an already
running service. If the reviewed origin changes, register the new **exact**
callback before login. Do not substitute `localhost`, port 8443, a wildcard or
plain HTTP. Port 8443 is the internal Gateway listener; 18443 is the browser port.

The backend prefers Basic when discovery advertises it, as Auth0 does. Tenant
metadata alone does not prove the application's configured authentication method.
Confirm the setting rather than choosing `none` or an unsupported private-key mode.
No browser Auth0 SDK, SPA token storage, custom API audience or Management API
token is required for this server-session integration.

The logout URL registration does not enable provider single sign-out: FleetIQ's
current logout clears its own session, and an Auth0 SSO session may remain.

## 2. Enable the user's connection

In **User Management → Users**, open the existing user and note its connection.
For a database user this is often `Username-Password-Authentication`, but use the
actual connection recorded for that user.

Open **Authentication → Database → that connection → Applications** and enable
the FleetIQ application. Alternatively enable the same connection from the
application's **Connections** tab. A user belongs to a connection, not directly
to an application; another user does not need to be created merely to connect it.
Confirm the user is not blocked and can meet that connection's verification/MFA
requirements. Enabling the connection is distinct from granting FleetIQ access.

## 3. Identify the initial FleetIQ operator

Copy the user's exact **user_id** from its Details/Raw JSON view. For an Auth0
database user this usually starts with `auth0|`. It is the OIDC subject (`sub`),
not its email, display name, connection name or the application's client ID.
Keep this personal identifier in the private input directory, outside Git/logs.

The proposed installation mapping is:

| Input | Meaning |
| --- | --- |
| Actor ID | `initial-operator`, a stable internal FleetIQ identity |
| Authority | `auth0-fleetiq-local`, bound to the selected exact issuer |
| Subject | The verified user's exact `user_id`, supplied privately |

After explicit database migration, the authorized installer runs the existing
`fleetiq-server bootstrap-platform-operator --check-schema` command with the
bootstrap-only database privileges and its required environment. It is a separate
one-time administrative operation, never normal startup or an HTTP endpoint.
An exact retry is idempotent; a different initial identity is rejected afterward.

See the published backend's [bootstrap contract](https://github.com/stanimirivanov/fleetiq-platform/blob/9260d135a06dfb9f92271a561c306a69533743b0/docs/operations/platform-bootstrap.md)
and [browser identity contract](https://github.com/stanimirivanov/fleetiq-platform/blob/9260d135a06dfb9f92271a561c306a69533743b0/docs/operations/browser-identity.md).
Subsequent tenant provisioning and tenant permission grants are separate. Provider
roles, app metadata, account creation and login do not automatically create an
actor or grant `metadata.read`. An unmapped identity can authenticate at Auth0
and still receive FleetIQ 401; a missing tenant grant can yield 403.

## 4. Store the client secret privately

Find **Client Secret** in the application's Settings/Credentials. Do not send it
in chat, issue/PR text, command arguments, chart values or frontend configuration.
The proposed Kubernetes reference is Secret `fleetiq-oidc`, key `client-secret`,
in namespace `fleetiq-apps`. Its existence is not yet established.

On Windows, the following operator-run script creates a new private input folder
and prompts without echoing the secret. It refuses to reuse an existing folder;
review existing files/ACLs deliberately instead of overwriting them.

```powershell
$private = Join-Path $env:LOCALAPPDATA 'FleetIQ\d06-auth0'
if (Test-Path -LiteralPath $private) { throw 'Input folder already exists; review it before updating.' }
New-Item -ItemType Directory -Path $private -Force | Out-Null
$sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
icacls $private /inheritance:r /grant:r "*${sid}:(OI)(CI)F" /Q
if ($LASTEXITCODE -ne 0) { throw 'Private input ACL setup failed.' }
$secret = Read-Host 'Auth0 client secret' -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
try {
    $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    if ([string]::IsNullOrWhiteSpace($plain)) { throw 'Empty client secret.' }
    [IO.File]::WriteAllText((Join-Path $private 'client-secret'), $plain, [Text.UTF8Encoding]::new($false))
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
    $secret.Dispose()
    Remove-Variable plain -ErrorAction SilentlyContinue
}
```

Save the user subject separately in that same private directory, for example as
`operator-subject`, using a local editor without printing it. Report only the
file paths and completion status. These files are sensitive local inputs, not an
automatic credential-provisioning interface. Their contents must enter the
future authorized bootstrap/Secret operation privately, with no diagnostic echo.
No Secret or cluster is created by this script; the directory is separate from
the provider's ownership journal and must not replace it.

## 5. Validate the public inputs and preserve the boundaries

D06's public-only preparation lives under ignored
`target/d06-preparation/auth0-20261023/`. It records verified issuer discovery,
client ID, proposed Secret references, selected immutable application/database
images, the observed IPv4 answers and a native offline render. It contains no
client secret or user subject and is **not** the private credential directory.
The preparation is a rehearsal using offline namespace/quota objects; the
fixture API-server CIDR still needs a real target observation. Never apply this
render as installation manifests.

The manifest verifier accepts explicit trusted `applicationNamespace` and
`oidcIssuer` inputs. Expectations come from the selected configuration, not
from rendered workloads. It checks the exact issuer, issuer-derived HTTPS port,
database peer namespace, schema/resource inventory and quota headroom, retaining
all other isolation, runtime and retention restrictions. Default fixture checks
continue to expect their original namespace and issuer.

Auth0 uses publicly trusted HTTPS; leave additional OIDC CA trust unset unless a
reviewed additional CA is actually necessary. DNS answers can change or differ
from the target's resolver: observed `/32` CIDRs and TTLs are preparation data,
not permanent Auth0 ranges. Recheck all consumed issuer endpoint destinations
from the authorized target before applying egress rules; never use `0.0.0.0/0`
or suppress TLS checks to make discovery succeed.

Public discovery and native schema/policy validation have passed. Application
settings, enabled connection, private Secret material and subject are still
operator prerequisites. Actual code exchange, session creation, grants and
sign-in have not been tested. Protected Argo source graphs, target capacity,
exact live-target authorization and the [D06 acceptance checklist](d06-qualification.md)
also remain required; this runbook grants no activation authority.

## References

- [Auth0 database connections](https://auth0.com/docs/authenticate/database-connections).
- [Auth0 Regular Web Application setup](https://auth0.com/docs/quickstart/webapp/express/index).
- [Auth0 connection enablement](https://support.auth0.com/center/s/article/SSO-not-working-with-SAML).