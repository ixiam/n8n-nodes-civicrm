# Changelog

All notable changes to `@ixiam/n8n-nodes-civicrm` are documented here.

---

## [3.2.0] — 2026-09-08

### Added
- **`Runtime Bearer Token (Optional)`** node parameter (Get, Get Many, and all three Custom API Call operations). Accepts a JWT already issued for a specific real CiviCRM contact (e.g. an Authx JWT minted by another system for a logged-in end user), typically set by expression (`={{ $json.user_jwt }}`). When set, it's used exactly as given as the `Authorization: Bearer` header for that call, entirely bypassing the credential's own JWT auto-resolve and API-key fallback. An empty or denied CiviCRM response in this mode is returned/thrown as-is - it is **not** retried with the credential's API key, because a denial is the correct outcome of a real permission check for that specific user, not a failure to compensate for. Built for per-user permission enforcement in multi-tenant workflows (each execution can act as a different real CiviCRM identity instead of a single shared credential).

### Changed
- Shortened the node's top-level `description` (shown in n8n's node picker) to a single sentence, consistent with other community nodes.

---

## [3.1.0] — 2026-09-04

### Added
- **Custom API Call: "List Fields" operation.** Calls CiviCRM APIv4 `{Entity}/getFields` for any entity name (`customEntity`, free-typed - Contact, Contribution, Event, Case, custom entities, etc., not limited to the 5 fixed resources) and returns one output item per field (falls back to the raw response if the field list is empty), instead of requiring users to hand-type `customAction: "getFields"` with a manual params blob. New parameter: `getFieldsAction` (optional, default `get`) sets the APIv4 action context passed to `getFields`.
- **Custom API Call: "Dynamic Search" operation.** Runs `{Entity}/get` for any entity name with a configurable `select` and `where`, reusing the same `[field, operator, value]` triples JSON pattern as the existing Get Many "Where (JSON)" field. New parameters: `searchSelectJson` (JSON array of field names, default `["id"]`), `searchWhereJson` (JSON array of filter triples), `searchReturnAll` / `searchLimit` (500-row pagination when Return All is enabled, matching the existing Get Many pagination behavior).
- New `operation` dropdown scoped to the Custom API Call resource (`customApiOperationProp`): `Raw API Call` (`raw`, the original hand-typed passthrough, now the explicit default), `List Fields` (`getFields`), `Dynamic Search` (`search`). The existing `operation` dropdown for Contact/Membership/Group/Relationship/Activity (get/getMany/create/update/delete) is unchanged and unaffected - its `displayOptions` were narrowed to those 5 resources so the two same-named `operation` properties don't overlap in the UI.

### Fixed
- Test suite in `test/nodes/CiviCrm.test.ts` was not runnable: `jest`/`ts-jest`/`@types/jest` were missing from `devDependencies`, and the node import path pointed at `dist/nodes/...` instead of the real build output at `dist/src/nodes/...`. Added the missing dev dependencies, fixed the import, and added a `test:unit` script (`jest`) alongside the existing `test` script (which still just runs the build, unchanged, to avoid altering existing CI expectations around `npm test`).

### Notes
- Backward compatibility: a Custom API Call node saved before this release may have a legacy `operation` value (`get`/`getMany`/`create`/`update`/`delete`, inherited from the old shared dropdown). All of these still resolve to the Raw API Call path at execution time with `customAction`/`customParamsJson` unchanged; the new operation dropdown also lists them explicitly (labeled "(Legacy)") so `customAction`/`customParamsJson` remain visible/editable in the UI without requiring the user to touch the operation field.

---

## [3.0.0] — 2026-09-01

### Added
- **JWT authentication with auto-resolve.** New "Enable JWT Authentication" credential toggle: when on, the node exchanges the API key for a short-lived, server-issued JWT (via CiviCRM's AuthX extension) instead of sending the API key on every request. Contact ID is auto-resolved from the API key - no manual entry needed.
- **`JWT Header Mode`** credential field: choose whether the JWT is sent via the `X-Civi-Auth` header, the `Authorization` header, or both.
- **`JWT Expiry (Seconds)`** credential field (default 3600, 60-86400) to configure how long the issued token is valid before it must be renewed.
- **Visible fallback warnings.** If JWT is enabled but can't be obtained or used (AuthX not configured, permission denied, etc.), the node now surfaces a non-blocking warning in the node's output pane and transparently falls back to API Key auth - workflows never break because of a JWT failure, but the fallback is no longer silent.

### Changed
- **[BREAKING]** Major version bump to reflect the new credential shape (`enableJwtAuth`, `jwtHeaderMode`, `jwtExpiry` fields added to `CiviCrmApi` credentials). Existing API Key-only credentials keep working unchanged; JWT is opt-in.
- The credential's "Test credentials" button intentionally remains a plain API-key connectivity check, since n8n always prefers a credential type's declarative `test` over a node's `testedBy` - JWT-specific failures are only surfaced at execution time (see warnings above), not in credential testing.

---

## [2.1.8] — 2026-09-01

### Fixed
- **[MEDIUM]** `package.json`'s `author` field converted from a plain string to the object form (`{ "name": ..., "email": ... }`), required by the n8n community node linter (`n8n-nodes-base/community-package-json-author-name-missing`). Flagged by n8n's automated review of the v2.1.7 submission.

---

## [2.1.7] — 2026-08-31

### Fixed
- **[HIGH]** Contact → Get Many no longer implicitly filters by `contact_type`. The shared "Contact Type" dropdown defaulted to `Individual` and was applied to every Contact operation, so a Get Many with no filters configured silently sent `where: [["contact_type","=","Individual"]]` and could return an empty result with no error. Get Many now has its own optional filter defaulting to "Any" (no filter); Create/Update keep the existing required default.

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
