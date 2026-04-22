# Changelog

All notable changes to `@ixiam/n8n-nodes-civicrm` are documented here.

---

## [2.1.5] — 2026-04-22

### Fixed
- **[MEDIUM]** `locationTypeCache` is now keyed per `baseUrl` to prevent cross-tenant cache pollution in n8n Cloud environments.
- **[LOW]** Resource options sorted alphabetically (Activity, Contact, Group, Membership, Relationship) with Custom API Call kept at the end.

### Improved
- Node subtitle now shows human-readable labels in Title Case (e.g. `Get Many: Contact` instead of `getMany: contact`).
- `resourceProp` now includes `noDataExpression: true` for consistency with `operationProp`.
- Operation options now include individual descriptions per action.
- Limit field description now states the default value explicitly.

---

## [2.1.2] — 2025-04-01

### Fixed
- Synced `pnpm-lock.yaml` with updated `package.json` overrides to prevent install errors.

---

## [2.1.1] — 2025-04-01

### Fixed
- Resolved `pnpm` version conflict in the `.github/workflows/publish` CI pipeline.

---

## [2.1.0] — 2025-04-01 · n8n Community Node Verification (Planning)

This release applies all changes required to pass the **n8n Community Node Verification** process.

### Planning / Validation Scope

The following areas were reviewed and adapted to meet the n8n verification requirements:

| Area | Change |
|------|--------|
| **Node output tracking** | Added `pairedItem` to every `out.push()` call so n8n can trace items through the workflow |
| **Strict mode** | Enabled `"strict": true` in `package.json → n8n` section |
| **Credential test** | Implemented `test` block in `CiviCrmApi.credentials.ts` that calls `/civicrm/ajax/api4/Contact/get` to validate credentials on save |
| **AI agent compatibility** | Used `NodeConnectionTypes` from `n8n-workflow` to expose the correct connection types, enabling the node inside AI agent workflows |
| **TypeScript cleanup** | Removed unused imports and variables flagged by the `@n8n/node-cli` linter |
| **pnpm lockfile** | Pinned `change-case` to `4.1.2` via `pnpm.overrides` to fix `ERR_REQUIRE_ESM` during build |

### Added
- `test` credential validation block — tests against `Contact/get` with a single-row limit.
- `pairedItem` field propagated in all resource handlers (`contact`, `membership`, `group`, `relationship`, `activity`, `customApi`).
- Organization name (`organization_name`) field exposed in Contact create/update operations.

### Fixed
- Email address fields were incorrectly sent to the API when the value was empty, causing unintended deletions — now skipped if blank.
- Primary location type deletion triggered when updating a contact without changing the primary — guard condition added.
- Credential test was returning false negatives due to missing `Content-Type: application/x-www-form-urlencoded` header — corrected in `test.request`.

### Changed
- Minimum supported n8n version aligned with `n8nNodesApiVersion: 1` + strict mode requirements.
- Publish workflow updated to use a fixed `pnpm` version to avoid lockfile mismatch errors in CI.

---

## [1.1.32] — 2025-03-27

### Added
- Extended AI/LLM agent compatibility: node now exposes the correct `NodeConnectionTypes` so it can be used as a tool inside n8n AI agent chains.

---

## [1.1.31] — 2025-03-27

### Added
- Initial AI agent support — enabled the node to participate in n8n AI agent workflows.

---

## [1.1.30] — 2025-03-25

### Changed
- Internal source folder restructured; `src/` artefacts removed from the dist bundle.

---

## [1.1.29] — 2025-03-25

### Fixed
- Build artefacts cleaned up; `src/` folder excluded from published dist.

---

## [1.1.28] — 2025-03-25

### Changed
- Minor packaging adjustments post-release.

---

## [1.1.27] — 2025-03-25

### Added
- Initial stable release with full API v4 support for: `Contact`, `Membership`, `Group`, `Relationship`, `Activity`, and custom API calls.
- Dynamic field mapping for standard and custom fields.
- Smart mapping for emails, phones, and addresses with location-type resolution.
- Bearer token authentication (`X-Civi-Auth`).
- Civi-Go compatible form-urlencoded transport layer.
