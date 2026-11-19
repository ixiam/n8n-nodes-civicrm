# End-to-end workflows

Workflows used to verify 4.0 inside n8n (2.41) against a live CiviCRM 6.4 site. Each starts with a Manual Trigger and runs top to bottom.

| File | Checks |
|---|---|
| `auth-matrix.json` | Signs in with six credentials (API key and password, all three routes, JWT sessions, a 3.x-style credential) and returns the contact each one belongs to. The limited user's JWT step shows a warning in the output panel and still succeeds. |
| `any-entity-tag-lifecycle.json` | Any Entity on `Tag`: create (field mapper, expression in the name), get with a filter, update matched on `id`, read back, delete. Leaves nothing behind. |
| `built-in-contact-lifecycle.json` | Built-in Contact with email, phone and address on location type *Main*, birth date `15/06/1985` → `1985-06-15`, update, read with the limited credential, delete, and a permanent purge through Custom API Call. |
| `any-entity-paging-and-safety.json` | Return All on `Country` (more than 100 rows), Contact → Get Duplicates, and Contact → Replace refused without *Show Advanced* (continues with the error message as output). |
| `site-key.json` | A contact **without** the "authenticate with …" permissions signs in only thanks to the Site Key (API key via X-Civi-Auth, password via `_authx`), reads itself through Any Entity, and the same credential without the site key fails with the guard message. |

## Credentials to create

The nodes reference credentials by name. Create these **CiviCRM API** credentials before importing (or reassign each node's credential after import):

| Name | Type | Route | Other |
|---|---|---|---|
| `admin-key-xheader` | API key of an admin contact | X-Civi-Auth | |
| `admin-pass-header` | Username and password of that admin | Authorization | |
| `limited-key-param` | API key of a limited contact | `_authx` | |
| `admin-key-jwt` | Admin API key | X-Civi-Auth | Use Short-Lived JWT on |
| `limited-key-jwt` | Limited API key | X-Civi-Auth | Use Short-Lived JWT on |
| `legacy-3x` | Admin API key | (leave defaults) | Base URL with a trailing slash |
| `sitekey-key-xheader` | API key of a contact without "authenticate with api key/password" | X-Civi-Auth | Site Key = the site's `CIVICRM_SITE_KEY` |
| `sitekey-pass-param` | Username and password of that contact | `_authx` | Site Key as above |
| `sitekey-missing` | API key of that contact | X-Civi-Auth | no Site Key (expected to fail) |

The limited contact should lack *generate any authx credential* (so its JWT step falls back with a warning) and *add contacts* / *delete contacts*. The site settings are listed in [DEVELOPMENT.md](../../DEVELOPMENT.md#live-integration-suite).
