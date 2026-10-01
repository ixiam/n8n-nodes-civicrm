# Development

## Local stack

A Docker Compose stack runs n8n with this package mounted as an installed community package (same node type as production, `@ixiam/n8n-nodes-civicrm.civiCrm`) and a builder container that recompiles on save:

```bash
cd ../docker-compose            # the compose file lives next to this repository
docker compose up -d            # n8n on http://localhost:5678
docker compose logs -f civicrm-builder
docker compose restart n8n      # load a code change (about 5 s)
```

No Node.js is needed on the host. The builder installs dependencies with pnpm (version pinned in `package.json`) into the store at `.pnpm-store/`. Any other pnpm install of this repo (another container, CI-style runs) must use the same store (`npm_config_store_dir`), otherwise pnpm relinks `node_modules` and the builder has to repair it.

## Commands

```bash
pnpm install
pnpm run build          # n8n-node build: cleans dist/, compiles, copies icons
pnpm run lint           # n8n community-node rules (must stay at 0 problems)
pnpm test               # build + all Jest suites (live suite skips itself)
pnpm run test:unit      # Jest only (expects an up-to-date dist/)
pnpm run test:integration
```

## Tests

| Suite | What it covers |
|---|---|
| `test/transport/*.test.ts` | Credential resolution, request building per route, error mapping |
| `test/nodes/*.test.ts` | Node execution with mocked HTTP: auth flows, JWT sessions and fallback, retries, Any Entity discovery and execution, Base URL Override, 3.x regression tests |
| `test/integration/live.int.test.ts` | The real node code against a live CiviCRM site, over HTTP |
| `test/e2e/*.json` | n8n workflows for manual or scripted end-to-end runs inside n8n |

### Live integration suite

Skipped unless `CIVI_IT_URL` is set. It needs two contacts: an admin and a limited one without `generate any authx credential`.

```bash
export CIVI_IT_URL=http://test01.example
export CIVI_IT_ADMIN_KEY=...      CIVI_IT_ADMIN_USER=...      CIVI_IT_ADMIN_PASS=...
export CIVI_IT_LIMITED_KEY=...    CIVI_IT_LIMITED_USER=...    CIVI_IT_LIMITED_PASS=...
# optional site-key block: a third contact WITHOUT "authenticate with api key/password"
export CIVI_IT_SITE_KEY=...       CIVI_IT_SITEKEY_KEY=...     CIVI_IT_SITEKEY_USER=...    CIVI_IT_SITEKEY_PASS=...
pnpm run test:integration
```

Site settings the suite expects (AuthX): `api_key` and `pass` accepted on all three routes; `jwt` accepted on X-Civi-Auth and Authorization but **not** on `_authx` (to exercise the JWT refusal path); guards `site_key` and `perm`. The suite creates a Tag and a Contact and deletes both. Keep requests sequential (`--runInBand`): some hosting stacks answer 502 at three or more parallel requests.

### End-to-end workflows

`test/e2e/` holds the workflows used to verify the release inside n8n (auth matrix, Any Entity Tag lifecycle, built-in Contact lifecycle, paging and the safety gate, site-key guard). Import them in n8n (**Workflows → Import from File**), create credentials with the names referenced in each node, and run them. See `test/e2e/README.md`.

## Releasing

1. Set the version in `package.json` and add the entry to `CHANGELOG.md`.
2. Create a GitHub release. The publish workflow builds and publishes to npm with provenance (Trusted Publishing).
3. Versions with a pre-release suffix (e.g. `4.0.0-dev.1`) are published under the npm `next` tag, so `latest` installs never pick them up.
