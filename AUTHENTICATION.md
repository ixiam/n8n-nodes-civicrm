# Authentication

This connector talks to CiviCRM's APIv4 REST endpoint (`{Base URL}/civicrm/ajax/api4/{Entity}/{action}`) and authenticates through CiviCRM's **AuthX** extension. This page covers the credential options, what must be enabled in CiviCRM for each one, and how to read the errors.

## Credential fields

| Field | Values | Notes |
|---|---|---|
| **Base URL** | Site root, e.g. `https://crm.example.org` | Without `/civicrm`; the connector adds the API path. |
| **Authentication Type** | API Key (default) · Username and Password | |
| **API Key** | | The API key of a CiviCRM contact. |
| **Username / Password** | | A CMS login (Drupal, WordPress, Backdrop, Joomla or Standalone) linked to a contact. Sent as HTTP Basic. |
| **Send Credentials Via** | X-Civi-Auth header (default) · Authorization header · `_authx` request parameter | The *route* AuthX reads the credential from. |
| **Site Key** | Optional | Sent as `X-Civi-Key`, for sites that rely on AuthX's site-key guard. |
| **Use Short-Lived JWT** | Off (default) · On | Exchanges the credential for a JWT and sends that instead (see below). |
| **JWT Expiry (Seconds)** | 60 to 86400, default 3600 | Lifetime of each JWT. |

Every request also carries `X-Requested-With: XMLHttpRequest`, which CiviCRM's CSRF check requires on the Authorization route and the CiviCRM docs recommend everywhere.

**Test credential** signs in exactly as the node will (type, route and site key) and asks CiviCRM which contact the credential belongs to.

### Which route to choose

- **X-Civi-Auth header**: recommended. Custom headers survive proxies that strip `Authorization` (common with nginx + PHP-FPM).
- **Authorization header**: the standard HTTP header. CiviCRM 6.x accepts **no** credential type on this route by default.
- **`_authx` parameter**: the credential travels in the POST body. Use it when a proxy drops custom headers. It is never put in the URL.

## What CiviCRM needs

Settings live under **Administer → System Settings → Authentication** (setting names in brackets).

### 1. The route must accept the credential type

Each route has its own list of accepted credential types:

| Route | Setting | CiviCRM 6.4 default |
|---|---|---|
| X-Civi-Auth header | `authx_xheader_cred` | `jwt`, `api_key` |
| Authorization header | `authx_header_cred` | none |
| `_authx` parameter | `authx_param_cred` | `jwt`, `api_key` |

Add `api_key` or `pass` for the credential type you use, and `jwt` if you turn on **Use Short-Lived JWT** or send a **Runtime Bearer Token**. Username and password (`pass`) is not accepted on any route by default.

### 2. The contact must pass a guard

`authx_guards` lists the guards; a request needs to pass **one** of them (default: both enabled).

- **perm**: the contact's CMS role has **"AuthX: Authenticate to services with API key"** (`authenticate with api key`) or **"… with password"** (`authenticate with password`).
- **site_key**: the request carries the site key (`CIVICRM_SITE_KEY`) as `X-Civi-Key`. Fill in the credential's **Site Key** for this.

### 3. User linking

`authx_{route}_user` decides whether the contact must have a CMS user: `optional` (default for the three routes), `require` or `ignore`. Username and password always needs a CMS user.

### 4. Permissions for what the workflow does

The contact needs the usual CiviCRM permissions for the data it touches, for example `access CiviCRM` and `view all contacts`. What a contact can see also changes what **Any Entity** discovers: a contact without "delete contacts" will not be offered Contact → Delete.

## JWT sessions (Use Short-Lived JWT)

When enabled, the connector:

1. asks CiviCRM who the credential belongs to (`Contact.get` with `id = user_contact_id`; the secret is never put in the request parameters),
2. requests a JWT for that contact with `AuthxCredential.create`, authenticated with the stored credential,
3. sends the JWT (on the same route) for every call until it is about to expire, then requests a new one.

**Requirements**

- The contact needs **"Authx: Generate new JWT credentials for other users via the API"** (`generate any authx credential`), even to issue a JWT for itself. Without it CiviCRM answers 403.
- The route must accept `jwt` (step 1 above).

**When it fails** the node never stops a workflow because of the JWT itself:

- If the JWT cannot be issued, or CiviCRM refuses it at sign-in, the call is repeated once with the stored credential and a **warning** appears in the node's output panel. JWT sessions then pause for 15 minutes for that credential, so a misconfiguration costs one failed call, not one per request.
- Any other error (permissions, validation, server errors) is reported as is. A write is never sent twice.
- An empty result is a real result: it is returned as is, not retried.

With username and password, a JWT session also avoids a password check on every request.

## Runtime Bearer Token

The node parameter **Runtime Bearer Token** takes a JWT that already belongs to a specific user (for example one issued by Drupal for the logged-in contact), usually via an expression such as `={{ $json.user_jwt }}`. The token is sent exactly as given, on the credential's route, instead of the credential. Empty or denied answers are returned as is and **never** retried with the credential: they are that user's correct permission outcome. The route must accept `jwt`.

Available for the built-in entities and Custom API Call. Any Entity always runs as the credential (see below).

## Base URL Override

The node parameter **Base URL Override** sends one item's requests to another CiviCRM site with the same credential, usually from an expression such as `={{ $json.instance_url }}`. JWTs are cached per site, so a token issued by one site is never sent to another.

> The credential is sent to whatever URL the override resolves to. Only feed it URLs your workflow controls.

**Any Entity** does not offer Base URL Override or Runtime Bearer Token: it discovers entities, actions and fields with the credential's site and identity, and always runs with them, so what the editor shows is what runs.

## HTTP Request node

The credential can be used in n8n's **HTTP Request** node: *Authentication → Predefined Credential Type → CiviCRM API*. The request is signed exactly like the CiviCRM node's (type, route, site key, `X-Requested-With`). For the `_authx` route use a form-urlencoded body (`params` as one field); without a form body the credential goes in the query string. JWT sessions are a feature of the CiviCRM node only.

## Troubleshooting

| Message | Meaning and fix |
|---|---|
| CiviCRM does not accept *X* sent via the *route* | The route does not accept that credential type. Add it to `authx_{route}_cred`, or choose another **Send Credentials Via**. |
| CiviCRM needs a valid Site Key or an "authenticate with …" permission | The credential is valid but passes no guard (`Must satisfy guard (site_key, perm)`): fill in the Site Key exactly as `CIVICRM_SITE_KEY`, or grant the permission. |
| CiviCRM rejected the credential | Wrong key or password. |
| CiviCRM treated the request as unauthenticated | The credential did not reach CiviCRM (`SECURITY ALERT`). A proxy probably strips the header; try another route. |
| CiviCRM API endpoint not found | Check the Base URL is the site root, without `/civicrm`. |
| Could not start a JWT session (… "generate any authx credential" …) | Grant that permission, or turn JWT off. The node keeps working with the stored credential. |
| The request asks for more rows than the site allows | The site caps rows per call (apirestlog guard). Use a Limit of 100 or less; Return All adapts automatically. |
| CiviCRM REST quota reached | The site limits calls per minute (apirestlog guard). The node waits and retries once when CiviCRM says how long to wait. |

## Upgrading from 3.x

Credentials saved with 3.x keep working without changes: they read as **API Key** via **X-Civi-Auth header**. Differences:

- The contact behind a JWT is found with `user_contact_id` instead of searching for the API key, so the key no longer appears in request logs.
- JWT calls are no longer retried with the API key when they return no data, or when they fail for reasons other than authentication.
- The old **JWT Header Mode** is hidden. A saved value still applies: *Authorization Header* keeps sending JWTs in the Authorization header; *Both Headers* now sends only X-Civi-Auth, which is the only one CiviCRM evaluated.
- Every request carries `X-Requested-With: XMLHttpRequest`.
