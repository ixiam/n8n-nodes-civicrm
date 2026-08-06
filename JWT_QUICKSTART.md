# Quick Start: JWT Auto-Resolve (5 minutes)

## Prerequisites ✅

- [ ] CiviCRM 5.48+ with AuthX extension enabled
- [ ] You have an API Key from CiviCRM
- [ ] n8n instance with this node installed

---

## Step 1: Configure CiviCRM (2 minutes)

### 1.1 Enable AuthX for X-Header

```bash
# Navigate to:
Administer → System Settings → AuthX Settings

# Find: "Credential types for X-Civi-Auth header"
# Value: ["jwt"]  ← Must include jwt

# Save
```

**Done!** CiviCRM is now configured.

---

## Step 2: Add Credential in n8n (2 minutes)

### 2.1 Create New Credential

```
Credentials → + New Credential → CiviCRM API
```

### 2.2 Fill Form

| Field | Value |
|-------|-------|
| Base URL | `https://your-site.org/civicrm` |
| API Token | Your API Key from CiviCRM |
| Enable JWT Auth | ✓ Toggle ON |
| JWT Header Mode | X-Civi-Auth (default) |

### 2.3 Test

Click **"Test credentials"** → Should pass ✓

---

## Step 3: Use in Workflow (1 minute)

### 3.1 Add CiviCRM Node

```
+ Add Node → CiviCRM
```

### 3.2 Select Credential

```
Credential → [Your credential from Step 2.2]
```

### 3.3 Configure API Call

```
Entity: Contact
Action: get
Params: (your query)
```

### 3.4 Execute

Click ▶ Execute → Data flows ✓

---

## What Happens Behind Scenes

```
You click Execute:
  ↓
1. System resolves your Contact ID
   └─ Query: "Which Contact owns this API Key?"
   
2. System generates JWT
   └─ Create: Time-bounded token (1 hour)
   
3. System makes API call
   └─ Try: JWT first
   └─ If fails/empty: Fallback to API Key
   
4. n8n shows results
   └─ Data flows to next node ✓
```

**You never see these steps** - it's all automatic.

---

## Common Issues

### "Test credentials" Fails

**Fix:**
1. Check API Key spelling in n8n credential
2. Verify Base URL is exactly correct
3. Verify CiviCRM AuthX is enabled

### No Data Returned

**Fix:**
1. Uncheck "Enable JWT Auth" temporarily
2. Test again
3. If works: JWT has limited perms (auto-fallback handles this)
4. If fails: Data issue, not JWT

### "Contact ID won't resolve"

**Fix:**
1. Verify API Key is assigned to a Contact in CiviCRM
2. Login to CiviCRM → Administer → Users → [Your User]
3. Should show "API Token" field with your key
4. If missing: Click "Generate"

---

## Next Steps

- 📖 Read full setup guide: [JWT_AUTORESOLVE_SETUP.md](JWT_AUTORESOLVE_SETUP.md)
- 🔒 Security considerations: [JWT_AUTORESOLVE_SETUP.md#security-notes](JWT_AUTORESOLVE_SETUP.md#security-notes)
- 🐛 Troubleshooting: [JWT_AUTORESOLVE_SETUP.md#troubleshooting](JWT_AUTORESOLVE_SETUP.md#troubleshooting)

---

**That's it! Your JWT authentication is ready.** 🚀
