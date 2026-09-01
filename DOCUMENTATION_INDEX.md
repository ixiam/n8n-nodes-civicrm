# Documentation Index

**CiviCRM n8n Node - JWT Auto-Resolve Feature**  
**Version:** 3.0.0+  
**Date:** 2026-08-06

---

## 📚 Documentation Map

### For Users (Setting Up JWT)

```
START HERE
    ↓
1. [JWT_QUICKSTART.md](JWT_QUICKSTART.md) ⭐ READ FIRST
   └─ 5-minute setup guide
   └─ CiviCRM checklist
   └─ n8n credential setup
   └─ Common issues & fixes

2. [JWT_AUTORESOLVE_SETUP.md](JWT_AUTORESOLVE_SETUP.md) (Detailed)
   └─ Complete architecture explanation
   └─ CiviCRM requirements & configuration
   └─ n8n setup with screenshots
   └─ Troubleshooting guide
   └─ Security best practices
   └─ FAQ

3. [README.md](README.md) (Main Project)
   └─ Feature overview
   └─ Installation steps
   └─ Quick credentials reference
```

### For Developers (Understanding Implementation)

```
1. [ARCHITECTURE_JWT_AUTORESOLVE.md](ARCHITECTURE_JWT_AUTORESOLVE.md)
   └─ Technical architecture
   └─ Component breakdown (JwtAuth.ts, GenericFunctions.ts)
   └─ Caching strategy
   └─ Error handling
   └─ Security analysis
   └─ Testing strategy
   └─ Performance characteristics

2. [CHANGELOG_JWT_AUTORESOLVE.md](CHANGELOG_JWT_AUTORESOLVE.md)
   └─ What changed in v3.0.0
   └─ Breaking changes & migration
   └─ Bug fixes
   └─ Security improvements
```

### Code Files (Reference)

```
src/nodes/transport/
├── JwtAuth.ts
│   ├─ isJwtAuthEnabled(credentials)
│   ├─ resolveContactId(context, baseUrl, apiToken)
│   └─ getServerIssuedJwt(context, baseUrl, apiToken, contactId?, ttl?)
│
├── GenericFunctions.ts
│   ├─ civicrmApiRequest(method, path, body)
│   ├─ buildCiviAuthHeaders(credentials, baseUrl, jwtToken?)
│   ├─ hasResponseData(response)
│   └─ Other utilities...
│
└── Other files (unchanged)
    ├─ CiviCrmNode.ts
    ├─ descriptions/
    └─ etc.

credentials/
└── CiviCrmApi.credentials.ts
    └─ Credential fields (no jwtContactId anymore)
```

---

## 🎯 Quick Navigation by Scenario

### "I want to set up JWT quickly"
→ [JWT_QUICKSTART.md](JWT_QUICKSTART.md) (5 min)

### "I'm getting an error with credentials"
→ [JWT_AUTORESOLVE_SETUP.md - Troubleshooting](JWT_AUTORESOLVE_SETUP.md#troubleshooting)

### "I need to understand how it works"
→ [ARCHITECTURE_JWT_AUTORESOLVE.md](ARCHITECTURE_JWT_AUTORESOLVE.md)

### "I'm upgrading from v2 to v3"
→ [CHANGELOG_JWT_AUTORESOLVE.md - Breaking Changes](CHANGELOG_JWT_AUTORESOLVE.md#-breaking-changes)

### "I want to contribute/modify code"
→ [ARCHITECTURE_JWT_AUTORESOLVE.md - Component Details](ARCHITECTURE_JWT_AUTORESOLVE.md#component-jwtauthts)

### "I need to explain JWT to my team"
→ [JWT_AUTORESOLVE_SETUP.md - Architecture](JWT_AUTORESOLVE_SETUP.md#architecture)

### "I'm having security concerns"
→ [JWT_AUTORESOLVE_SETUP.md - Security Notes](JWT_AUTORESOLVE_SETUP.md#security-notes)

### "What changed in v3?"
→ [CHANGELOG_JWT_AUTORESOLVE.md](CHANGELOG_JWT_AUTORESOLVE.md#-new-features)

---

## 📖 Reading Guide by Role

### System Administrator (CiviCRM)

**Goal:** Configure CiviCRM to support JWT

**Read in order:**
1. JWT_QUICKSTART.md → "Step 1: Configure CiviCRM"
2. JWT_AUTORESOLVE_SETUP.md → "CiviCRM Requirements"
   - AuthX extension installation
   - API Key setup
   - AuthX settings configuration
   - Permissions & roles

**Time:** 15-30 minutes  
**Action Items:**
- [ ] Enable AuthX extension
- [ ] Configure authx_xheader_cred setting
- [ ] Create/verify API Key for n8n user
- [ ] Test: `curl` command from Troubleshooting

---

### n8n Administrator

**Goal:** Set up JWT credentials in n8n

**Read in order:**
1. JWT_QUICKSTART.md → "Step 2: Add Credential in n8n"
2. JWT_AUTORESOLVE_SETUP.md → "Configuration in n8n"
3. JWT_AUTORESOLVE_SETUP.md → "Troubleshooting" (for issues)

**Time:** 10-20 minutes  
**Action Items:**
- [ ] Get API Key from CiviCRM admin
- [ ] Create credential in n8n
- [ ] Test credentials
- [ ] Use in workflow

---

### Workflow Developer

**Goal:** Use JWT-enabled credential in workflows

**Read in order:**
1. JWT_QUICKSTART.md → "Step 3: Use in Workflow"
2. README.md → "Key Features" (understand capabilities)
3. JWT_AUTORESOLVE_SETUP.md → "Authentication Flow" (understand what happens)

**Time:** 5 minutes  
**Action Items:**
- [ ] Select credential from dropdown
- [ ] Build workflow normally
- [ ] Test workflow
- [ ] Enjoy automatic JWT ✓

---

### Developer / Contributor

**Goal:** Understand and modify implementation

**Read in order:**
1. CHANGELOG_JWT_AUTORESOLVE.md → "New Features"
2. ARCHITECTURE_JWT_AUTORESOLVE.md → full document
3. Source code: `src/nodes/transport/JwtAuth.ts` and `GenericFunctions.ts`

**Time:** 30-60 minutes  
**Action Items:**
- [ ] Understand data flow
- [ ] Understand caching strategy
- [ ] Review error handling
- [ ] Plan changes/contributions

---

### Support / Troubleshooting

**Goal:** Help users resolve issues

**Read in order:**
1. JWT_AUTORESOLVE_SETUP.md → "Troubleshooting"
   - Issue 1: Test credentials fails
   - Issue 2: No output data returned
   - Issue 3: Contact ID won't resolve
   - Issue 4: JWT expires mid-workflow
2. JWT_AUTORESOLVE_SETUP.md → "FAQ"
3. ARCHITECTURE_JWT_AUTORESOLVE.md → "Error Handling Strategy"

**Time:** 20-30 minutes (once)  
**Action Items:**
- [ ] Understand common issues
- [ ] Know debug steps
- [ ] Collect debug info format
- [ ] Know when to escalate

---

## 🔍 Index by Topic

### Authentication & Security

| Topic | Location | Key Content |
|-------|----------|-------------|
| JWT vs API Key | JWT_AUTORESOLVE_SETUP.md | Table comparing both |
| Security best practices | JWT_AUTORESOLVE_SETUP.md#security-notes | What to do & not do |
| Token lifetime | JWT_AUTORESOLVE_SETUP.md#issue-4-jwt-expires | TTL configuration |
| Permission errors | ARCHITECTURE_JWT_AUTORESOLVE.md | Error handling |

### Configuration

| Topic | Location | Key Content |
|-------|----------|-------------|
| CiviCRM setup | JWT_QUICKSTART.md | Checklist |
| AuthX configuration | JWT_AUTORESOLVE_SETUP.md#authx-settings | Settings required |
| n8n credential | JWT_QUICKSTART.md | Step-by-step |
| JWT header mode | JWT_AUTORESOLVE_SETUP.md | Header options |

### Troubleshooting

| Topic | Location | Key Content |
|-------|----------|-------------|
| Credentials test fails | JWT_AUTORESOLVE_SETUP.md#issue-1 | Debug steps |
| No output data | JWT_AUTORESOLVE_SETUP.md#issue-2 | Root causes |
| Contact ID fails | JWT_AUTORESOLVE_SETUP.md#issue-3 | Resolution |
| JWT expires | JWT_AUTORESOLVE_SETUP.md#issue-4 | TTL adjustment |

### Technical Details

| Topic | Location | Key Content |
|-------|----------|-------------|
| System architecture | ARCHITECTURE_JWT_AUTORESOLVE.md | Data flow diagram |
| JwtAuth.ts | ARCHITECTURE_JWT_AUTORESOLVE.md#component-jwtauthts | Function details |
| GenericFunctions.ts | ARCHITECTURE_JWT_AUTORESOLVE.md#component-genericfunctionsts | Flow logic |
| Caching strategy | ARCHITECTURE_JWT_AUTORESOLVE.md#caching-strategy | How caching works |
| Error handling | ARCHITECTURE_JWT_AUTORESOLVE.md#error-handling | 3-level fallback |

### FAQ

| Question | Answer Location |
|----------|------------------|
| Can I use JWT without auto-resolve? | JWT_AUTORESOLVE_SETUP.md#faq |
| What if my API Key changes? | JWT_AUTORESOLVE_SETUP.md#faq |
| Can multiple nodes share credential? | JWT_AUTORESOLVE_SETUP.md#faq |
| How often is contact ID cached? | JWT_AUTORESOLVE_SETUP.md#faq |

---

## 📋 Checklist: First-Time Setup

### CiviCRM Admin (10 min)

- [ ] AuthX extension installed & enabled
- [ ] `authx_xheader_cred` setting = `['jwt']`
- [ ] API Key generated for n8n user
- [ ] API Key assigned to Contact record
- [ ] Tested with curl command

### n8n Admin (10 min)

- [ ] Have API Key from CiviCRM admin
- [ ] Create credential:
  - [ ] Base URL entered
  - [ ] API Token entered
  - [ ] "Enable JWT Auth" toggled ON
- [ ] "Test credentials" passes
- [ ] Shared with relevant users

### Workflow Developer (5 min)

- [ ] Select credential from dropdown
- [ ] Choose CiviCRM action
- [ ] Configure entity & params
- [ ] Test workflow
- [ ] Verify data flowing

---

## 🚀 Getting Help

### Before Opening Issue

1. **Check this index** - search for your issue
2. **Read Troubleshooting** - [JWT_AUTORESOLVE_SETUP.md#troubleshooting](JWT_AUTORESOLVE_SETUP.md#troubleshooting)
3. **Check FAQ** - [JWT_AUTORESOLVE_SETUP.md#faq](JWT_AUTORESOLVE_SETUP.md#faq)

### When Opening Issue

Include:
- [ ] CiviCRM version
- [ ] n8n version  
- [ ] Node version (v3.0.0+)
- [ ] Exact error message
- [ ] Logs from "Support & Debugging" section
- [ ] Steps to reproduce
- [ ] Expected vs actual behavior

---

## 📞 Support Resources

| Resource | Link |
|----------|------|
| **GitHub Issues** | https://github.com/Ixiam/n8n-nodes-civicrm/issues |
| **Discussions** | https://github.com/Ixiam/n8n-nodes-civicrm/discussions |
| **CiviCRM Docs** | https://docs.civicrm.org |
| **n8n Docs** | https://docs.n8n.io |
| **AuthX Docs** | https://docs.civicrm.org/dev/en/latest/framework/authx/ |

---

## 📝 Document Versions

| Document | Version | Last Updated | Purpose |
|----------|---------|--------------|---------|
| JWT_QUICKSTART.md | v1.0 | 2026-08-06 | Quick setup guide |
| JWT_AUTORESOLVE_SETUP.md | v1.0 | 2026-08-06 | Complete reference |
| ARCHITECTURE_JWT_AUTORESOLVE.md | v1.0 | 2026-08-06 | Technical deep-dive |
| CHANGELOG_JWT_AUTORESOLVE.md | v1.0 | 2026-08-06 | Release notes |
| README.md | v3.0.0 | 2026-08-06 | Main project file |

---

## 🔄 Documentation Maintenance

### When Adding Features

1. Update CHANGELOG_JWT_AUTORESOLVE.md
2. Update relevant setup/architecture docs
3. Update README.md if user-facing
4. Update this index if new sections added

### When Fixing Bugs

1. Update Troubleshooting section (if user-facing)
2. Add to CHANGELOG under "Bug Fixes"
3. Update architecture docs (if internal changes)

### When Releasing New Version

1. Update version numbers in all docs
2. Add to CHANGELOG
3. Update README with new features
4. Notify users of breaking changes

---

**Last Updated:** 2026-08-06  
**Maintained by:** Ixiam Global Solutions  
**License:** See repository LICENSE file

---

### Quick Links

- 🚀 [Quick Start](JWT_QUICKSTART.md)
- 📖 [Complete Setup Guide](JWT_AUTORESOLVE_SETUP.md)
- 🏗️ [Technical Architecture](ARCHITECTURE_JWT_AUTORESOLVE.md)
- 📋 [Changelog](CHANGELOG_JWT_AUTORESOLVE.md)
- 📦 [Main Project](README.md)
