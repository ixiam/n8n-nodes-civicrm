# CiviCRM n8n Node: JWT Auto-Resolve Setup Guide

**Version:** 3.0.0+  
**Date:** 2026-08-06  
**Feature:** Automatic Contact ID Resolution for JWT Authentication

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [CiviCRM Requirements](#civicrm-requirements)
4. [Configuration in n8n](#configuration-in-n8n)
5. [Authentication Flow](#authentication-flow)
6. [Troubleshooting](#troubleshooting)
7. [Security Notes](#security-notes)

---

## Overview

### What Changed

Previously, JWT authentication required users to manually provide their CiviCRM Contact ID in the n8n credential form. This was:
- ❌ Not intuitive (most users don't know their contact ID)
- ❌ Error-prone (wrong ID = broken workflows)
- ❌ Poor UX for typical n8n users

### Solution: Auto-Resolve Contact ID

The n8n node now **automatically determines your Contact ID** from your API Key, eliminating manual input:

```
User Input:           CiviCRM Config:        n8n Credential Form:
- Base URL      ──────→ API Key + AuthX ──────→ [Auto-resolved]
- API Token          Settings              No contactId field!
- JWT Toggle
```

### Key Benefits

| Aspect | Before | After |
|--------|--------|-------|
| **UX** | Manual contactId input | Zero extra input |
| **Error Rate** | High (wrong IDs) | Zero (auto-detected) |
| **Permissions** | JWT only | JWT + API Key fallback |
| **Data Flow** | Fails if JWT insufficient | Auto-fallback to API Key |

---

## Architecture

### How Auto-Resolve Works

```
1. User enables JWT in n8n credential form
   └─ Provides: baseUrl, apiToken, enableJwtAuth=true

2. First API call is made (any CiviCRM request)
   ├─ Step A: Resolve Contact ID
   │  └─ Query: Contact/get with WHERE api_key = [apiToken]
   │  └─ Result: Get contact ID of API key owner
   │
   ├─ Step B: Generate JWT
   │  └─ Call: AuthxCredential/create with resolved contactId
   │  └─ Result: Get time-bounded JWT token
   │
   └─ Step C: Make API request
      ├─ Try with JWT (if available)
      │  └─ If data returned → use it ✓
      │  └─ If empty (limited perms) → fallback to API Key
      │
      └─ Fallback to API Key (always works)
         └─ If JWT unavailable/failed → use API Key ✓

3. Caching (30 minutes)
   ├─ Contact ID cached (no re-resolution per request)
   ├─ JWT cached (no re-generation per request)
   └─ 30-second safety buffer before expiry
```

### Data Flow Diagram

```
n8n Workflow
    ↓
civicrmApiRequest()
    ├─→ isJwtAuthEnabled? → YES
    │   ├─→ getServerIssuedJwt()
    │   │   ├─→ resolveContactId()
    │   │   │   ├─ POST Contact/get
    │   │   │   │  WHERE api_key = apiToken
    │   │   │   └─ Return: contactId (cached)
    │   │   │
    │   │   ├─→ AuthxCredential/create
    │   │   │   WITH contactId
    │   │   └─ Return: JWT (cached)
    │   │
    │   └─→ Try API call with JWT
    │       └─ If empty → Flag for fallback
    │
    ├─ Fallback to API Key?
    │  └─ YES → Try API call with API Key
    │
    └─→ Return data
```

---

## CiviCRM Requirements

### 1. AuthX Extension (REQUIRED)

JWT authentication requires the **AuthX extension** to be installed and enabled in CiviCRM.

#### Check Installation

```bash
# Via CiviCRM admin UI:
Administer → Extensions → Check "authx" is installed

# Via command line:
cv ext:list | grep authx
# Should show: ext/authx [enabled]
```

#### Install if Missing

```bash
cv ext:download authx
cv ext:enable authx
```

**Minimum Version:** CiviCRM 5.48+ (AuthX included in core)

---

### 2. API Key Configuration

Each user that will use JWT authentication needs:

#### Create/Find API Key

```bash
# Via CiviCRM Admin UI:
1. Administer → Users → [Your User] → API Token
2. Click "Generate" or copy existing token
3. Format: alphanumeric string (e.g., "KyoPZYVtQMjbfXzq")
```

#### Assign API Key to Contact

The API Key is stored in the Contact record:

```bash
# Via database (for reference):
SELECT id, display_name, api_key 
FROM civicrm_contact 
WHERE api_key = 'KyoPZYVtQMjbfXzq';
```

**Important:** The API Key's Contact record is the one that will be used for JWT generation.

---

### 3. AuthX Settings Configuration

Configure CiviCRM to accept JWT for API calls:

#### Configure X-Header Auth Flow (Recommended)

```bash
# Via CiviCRM admin UI:
Administer → System Settings → AuthX

# Look for setting: "Allow authentication via X-Civi-Auth header"
# Or search: "authx_xheader_cred"

# Set value to: ['jwt']
# (as a JSON array, or list of credential types)
```

#### Via Database/Code

```php
// In civicrm.settings.php or via API:
$config['authx_xheader_cred'] = array('jwt');
```

**What This Does:**
- Tells CiviCRM to accept JWT tokens in the `X-Civi-Auth: Bearer {token}` header
- Only JWT is accepted (not API keys) in X-Header flow
- This is the recommended flow for n8n

---

### 4. JWT Signing Keys (Automatic)

CiviCRM automatically manages JWT signing keys:

- **Where stored:** `civicrm.settings.php` 
- **Key setting:** `CIVICRM_SIGN_KEYS` (array of HMAC keys)
- **Generated:** Automatically at CiviCRM installation
- **Your role:** Nothing needed - it's automatic

```php
// Example (do NOT modify manually):
$config['CIVICRM_SIGN_KEYS'] = array(
  'main' => 'YourSecretKeyGeneratedAtInstall...',
);
```

---

### 5. Permissions & Roles

The Contact that owns the API Key determines JWT permissions:

#### Recommended Setup

```bash
# Create dedicated user for n8n integration:
1. Administer → Users → New User
   - Username: n8n_bot
   - Email: n8n@yourdomain.org
   - Status: Active

2. Assign CMS role(s) with appropriate permissions
   - WordPress: API User role
   - Drupal: API User permissions
   - Joomla: Appropriate access level

3. Assign CiviCRM ACLs (if using ACL system)
   - Grant API User role
   - Grant access to required resources

4. Generate API Token
   - For this user → get API Key
   - Use this key in n8n credential
```

#### Permission Mapping

| CiviCRM Operation | Required Permission | Notes |
|---|---|---|
| Contact.get | "access my contact" | JWT gets logged-in contact |
| Contact.create | "add contacts" | Must have via role/ACL |
| Contribution.get | "access my contact records" | Limited to own/related |
| * (any API) | "use CiviCRM" | Basic API access |

---

## Configuration in n8n

### Step 1: Create Credential

1. Open n8n workspace
2. Go to **Credentials** → **+ New Credential**
3. Select **CiviCRM API**
4. Fill in:

| Field | Value | Example |
|-------|-------|---------|
| **Display Name** | Any label | "CiviCRM Prod" |
| **Base URL** | Your CiviCRM URL | `https://your-site.org/civicrm` |
| **API Token** | From CiviCRM admin | `KyoPZYVtQMjbfXzq` |
| **Enable JWT Auth** | Toggle ON ✓ | Checked |
| **JWT Header Mode** | X-Civi-Auth (default) | Recommended |

### Step 2: Verify Format

```
Base URL format options (both work):
  ✓ https://your-site.org
  ✓ https://your-site.org/civicrm

The node normalizes automatically.
```

### Step 3: Test Credentials

Click **"Test credentials"** button:

```
✓ Passes: Contact/get request succeeds
          Shows "Test successful"

✗ Fails: Check troubleshooting section below
```

### Step 4: Configure JWT Settings (Optional)

These fields appear directly below **Enable JWT Auth** once it's toggled on:

| Setting | Default | Notes |
|---------|---------|-------|
| **JWT Header Mode** | X-Civi-Auth | Use this (recommended) |
| **JWT Expiry (Seconds)** | 3600 | 60–86400 (1 minute to 24 hours) |

**Header Mode Options:**
- `X-Civi-Auth` (recommended): Uses custom header
- `Authorization`: Uses standard HTTP Authorization header
- `Both`: Sends in both headers

---

## Authentication Flow

### Request Flow with Auto-Resolve

```
User makes n8n API call
    ↓
1. Check: Is JWT enabled in credentials?
    ├─ NO → Use API Key only
    └─ YES → Continue

2. Get JWT (cached if available)
    ├─ Resolve Contact ID
    │  GET /civicrm/ajax/api4/Contact/get
    │  WHERE api_key = '{apiToken}'
    │  ↓
    │  Returns: { values: [{ id: 55601 }], count: 1 }
    │
    ├─ Generate JWT  
    │  POST /civicrm/ajax/api4/AuthxCredential/create
    │  params: { contactId: 55601, ttl: 3600 }
    │  ↓
    │  Returns: { values: [{ cred: "Bearer eyJ0eXAi..." }] }
    │
    └─ Store in cache (30 min TTL)

3. Make API request with JWT
    GET /civicrm/ajax/api4/{Entity}/{action}
    Header: X-Civi-Auth: Bearer {jwt}
    ↓
    If: returns data → SUCCESS ✓
    If: returns empty (limited perms) → Fallback

4. Fallback to API Key (if needed)
    GET /civicrm/ajax/api4/{Entity}/{action}
    Header: X-Civi-Auth: Bearer {apiToken}
    ↓
    Returns data (API Key has full permissions)

5. n8n receives data → Workflow continues
```

### Example Request Headers

```http
# Step 2a: Resolve Contact ID
POST /civicrm/ajax/api4/Contact/get
X-Civi-Auth: Bearer KyoPZYVtQMjbfXzq
Content-Type: application/x-www-form-urlencoded

params={"select":["id"],"where":[["api_key","=","KyoPZYVtQMjbfXzq"]],"limit":1}

# Response:
{"values":[{"id":55601}],"count":1,"countFetched":1}

---

# Step 2b: Generate JWT
POST /civicrm/ajax/api4/AuthxCredential/create
X-Civi-Auth: Bearer KyoPZYVtQMjbfXzq
Content-Type: application/x-www-form-urlencoded

params={"contactId":55601,"ttl":3600}

# Response:
{"values":[{"cred":"Bearer eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiIsImtpZCI6Im1ha0..."}]}

---

# Step 3: Use JWT for API calls
POST /civicrm/ajax/api4/Contact/get
X-Civi-Auth: Bearer eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiIsImtpZCI6Im1ha0...
Content-Type: application/x-www-form-urlencoded

params={"select":["id","display_name"],"limit":25}

# Response:
{"values":[{"id":119990,"display_name":"John Doe"},...],"count":25,"countFetched":25}
```

---

## Troubleshooting

### Issue 1: "Test credentials" Fails

#### Symptoms
```
❌ Error: "Authorization failed" or "401 Unauthorized"
```

#### Causes & Solutions

| Cause | Check | Solution |
|-------|-------|----------|
| Invalid API Key | CiviCRM: Administer → Users → Your User | Copy correct API token |
| Wrong Base URL | Verify URL in credential | Must be exact CiviCRM URL |
| CiviCRM offline | Try: `curl https://your-site.org/civicrm` | Verify server is up |
| AuthX disabled | CiviCRM: Administer → Extensions → authx | Enable AuthX extension |

#### Debug Steps

```bash
# 1. Test API Key directly (from terminal):
curl -X POST https://your-site.org/civicrm/ajax/api4/Contact/get \
  -H "X-Civi-Auth: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d 'params={"select":["id"],"limit":1}'

# Expected: {"values":[{"id":...}],...}
# If error: API Key invalid or AuthX not configured

# 2. Check CiviCRM logs:
tail -f /var/log/civicrm.log
```

---

### Issue 2: "No output data returned" in n8n

#### Symptoms
```
✓ Credentials test: PASS
❌ Workflow execution: No output data returned
n8n stops executing the workflow when a node has no output data.
```

#### Causes & Solutions

| Cause | Indicator | Solution |
|-------|-----------|----------|
| JWT limited perms | JWT works but returns 0 results | Fallback to API Key (auto) |
| Wrong Contact ID | contact_id not resolving | Check: API Key assigned to correct Contact |
| No data in CiviCRM | Query returns empty | Verify records exist with correct filters |
| Incorrect query params | n8n logs show empty `values` | Check: select fields, where clause, limit |

#### Auto-Fallback Behavior

If JWT returns empty, n8n automatically uses API Key:

```
Logs will show:
[CiviCRM] JWT returned empty response. Retrying with API key 
         (JWT may have limited permissions).
[CiviCRM] API key request successful 
         (JWT was insufficient, using API key as fallback)
```

#### Manual Fix

If auto-fallback doesn't trigger:

1. **Disable JWT temporarily:**
   - Edit credential → Uncheck "Enable JWT Auth"
   - Test workflow again
   - If works: JWT has permissions issue

2. **Check JWT permissions:**
   - CiviCRM Admin → Check user role/ACL
   - Add missing permissions
   - Re-enable JWT

3. **Use API Key only:**
   - Leave JWT disabled
   - Node uses API Key (more reliable)

---

### Issue 3: Contact ID Won't Resolve

#### Symptoms
```
Logs show:
[CiviCRM] Failed to auto-resolve contact ID: Contact/get returned no contacts
```

#### Causes & Solutions

| Cause | Check | Solution |
|-------|-------|----------|
| API Key not assigned to Contact | Database: `SELECT api_key FROM civicrm_contact WHERE id = 123` | Generate new API Key in CiviCRM |
| Wrong Contact DB state | Check contact record exists | Contact may be deleted/merged |
| API Key changed | Compare n8n credential vs CiviCRM | Update n8n credential with new key |

#### Verify

```bash
# Check if API Key is assigned to a Contact:
mysql -u civicrm_user -p civicrm_db -e \
  "SELECT id, display_name, api_key FROM civicrm_contact 
   WHERE api_key = 'KyoPZYVtQMjbfXzq';"

# Should return 1 row with your contact
# If 0 rows: API Key not assigned
```

---

### Issue 4: JWT Expires Mid-Workflow

#### Symptoms
```
Logs show:
[CiviCRM] JWT failed (token expired)
```

#### Explanation

JWT tokens have **TTL (Time To Live)**:
- Default: 1 hour
- Cache safety buffer: 30 seconds before expiry
- Auto-refresh when expired

#### Prevention

- Workflows should complete within the configured expiry
- Long-running workflows: Split into multiple runs
- To increase TTL: Edit credential → "JWT Expiry (Seconds)" → increase (max 86400)

#### Example

```
Default: 3600 seconds (1 hour)
For 2-hour workflows: Set to 7200
For 30-minute workflows: Set to 1800
```

---

## Security Notes

### Authentication Security

#### JWT vs API Key

| Aspect | JWT | API Key |
|--------|-----|---------|
| **Scope** | Limited to resolved contact | Full contact permissions |
| **Lifetime** | 1 hour (configurable) | Indefinite |
| **Revocation** | Automatic on expiry | Manual via CiviCRM |
| **Use Case** | Automated workflows | Manual/scheduled tasks |
| **Risk** | If leaked: 1-hour window | If leaked: indefinite access |

#### Recommendation

✅ **Use JWT for automated workflows** (better security)
✅ **Use API Key only for non-JWT** (fallback)

### Secret Management

#### Do NOT

- ❌ Commit credentials to git
- ❌ Log API Keys in production
- ❌ Share credentials over email
- ❌ Use same API Key for multiple services

#### Do

- ✅ Store API Key in n8n Secrets (encrypted)
- ✅ Use separate API Key per service/environment
- ✅ Rotate API Keys periodically
- ✅ Audit API Key access logs

### Network Security

#### Recommended

```
# Only allow HTTPS (TLS 1.2+)
Base URL: https://your-site.org ✓
Base URL: http://your-site.org ✗ (NEVER)

# Whitelist n8n IP in firewall (if possible)
```

#### CORS Headers (if applicable)

CiviCRM should allow requests from n8n domain:

```
Administer → System Settings → CORS
Add n8n domain to allowed origins
```

---

## Testing & Validation

### Verify Setup

```bash
#!/bin/bash

# 1. Test credentials
API_KEY="KyoPZYVtQMjbfXzq"
BASE_URL="https://your-site.org/civicrm"

echo "1. Testing API Key..."
curl -X POST "$BASE_URL/ajax/api4/Contact/get" \
  -H "X-Civi-Auth: Bearer $API_KEY" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d 'params={"select":["id"],"limit":1}' \
  -s | jq .

echo -e "\n2. Checking AuthX extension..."
curl -s "$BASE_URL/ajax/api4/System/get" \
  -H "X-Civi-Auth: Bearer $API_KEY" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d 'params={"select":["authx_enabled"]}' | jq .

echo -e "\n✓ If both returned valid JSON, setup is correct!"
```

### n8n Test Workflow

Create test workflow:

```
1. CiviCRM Node (any action)
   ├─ Credential: Your configured credential
   ├─ Enable JWT: ON
   └─ Action: Contact.get

2. Debug output
   └─ Shows: Data returned with JWT ✓
```

---

## FAQ

### Q: Can I use JWT without auto-resolve?

**A:** No. This version requires auto-resolve (it's automatic). The `jwtContactId` field has been removed.

### Q: What if my API Key changes?

**A:** 
1. Generate new API Key in CiviCRM
2. Update credential in n8n with new key
3. Contact ID will auto-resolve to new contact

### Q: Does auto-resolve work with user roles/ACLs?

**A:** Yes. JWT is scoped to the Contact that owns the API Key. Ensure that Contact has proper CiviCRM ACL permissions.

### Q: Can I use the same API Key for multiple n8n nodes?

**A:** ✓ Yes, multiple nodes can share the same credential. Cache ensures efficiency.

### Q: How often is contact ID cached?

**A:** Contact ID cached per API Key + Base URL combination, indefinitely (no expiry). Only JWT refreshes (30 min + 30s buffer).

### Q: What if Contact ID doesn't match contact API Key?

**A:** Won't happen. Contact ID is resolved from the Contact that owns the API Key. They're always in sync.

### Q: Can I use this with webhook authenticators?

**A:** No. This feature is for API calls within workflows only. Webhooks use different auth.

---

## Support & Debugging

### Enable Debug Logging

In n8n, check the **Execution Details** tab:

```
Look for logs starting with:
[CiviCRM] JWT generated successfully
[CiviCRM] API key request successful
[CiviCRM] Retrying with API key...
```

### Collect Debug Info

If you need support, provide:

1. n8n version: `Settings` → `About`
2. n8n-nodes-civicrm version: Check node details
3. CiviCRM version: Admin UI → System Info
4. Error message from n8n logs
5. Error message from CiviCRM logs (`var/log/civicrm.log`)

### Report Issues

```
Repository: https://github.com/Ixiam/n8n-nodes-civicrm
Issue Template: Include the debug info above
```

---

## Changelog

### v3.0.0 (2026-08-06)

**New Features:**
- ✨ Automatic Contact ID resolution via WHERE api_key clause
- ✨ Smart fallback from JWT to API Key
- ✨ Improved error logging and debugging

**Breaking Changes:**
- 🔄 Removed `jwtContactId` credential field (now auto-resolved)
- 🔄 Existing credentials with JWT enabled will auto-migrate

**Bug Fixes:**
- 🐛 Fixed empty response handling with JWT
- 🐛 Improved Contact/get query filter accuracy

**Security:**
- 🔒 JWT now properly scoped to API Key owner
- 🔒 Fallback ensures graceful degradation

---

## Related Documentation

- [CiviCRM AuthX Framework](https://docs.civicrm.org/dev/en/latest/framework/authx/)
- [CiviCRM API v4](https://docs.civicrm.org/dev/en/latest/api/v4/usage/)
- [n8n Credentials](https://docs.n8n.io/credentials/)
- [n8n HTTP Node](https://docs.n8n.io/nodes/n8n-nodes-base.http-request/)

---

**Last Updated:** 2026-08-06  
**Maintained by:** Ixiam  
**License:** See repository LICENSE file
