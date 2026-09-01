# Changelog

All notable changes to this project will be documented in this file.

---

## [3.0.0] - 2026-08-06

### ✨ New Features

#### **JWT Authentication with Automatic Contact ID Resolution**

The most significant update - JWT is now **production-ready** with zero manual configuration.

**What's New:**
- 🎯 **Auto-Resolve Contact ID**: No more manual contact ID input. The system automatically determines your Contact ID from your API Key using the CiviCRM Contact/get endpoint with `WHERE api_key = ...` filter.
- 🔄 **Smart Fallback**: If JWT generation fails or returns limited data, the node automatically retries with API Key. Workflows never fail due to JWT permission issues.
- 🚀 **Intelligent Caching**: Contact ID and JWT tokens are cached (30-minute TTL for JWT with 30-second safety buffer) to minimize API calls.
- 📊 **Enhanced Logging**: Detailed debug logs show JWT generation, fallback behavior, and response handling.

**User Experience:**
- ✅ Removed `jwtContactId` field from credential form (no longer needed)
- ✅ Simplified credential setup: just provide Base URL, API Token, and toggle "Enable JWT Auth"
- ✅ Credentials test always uses API Key (more reliable)
- ✅ Workflows automatically benefit from time-bounded tokens

**Architecture Improvements:**
- 🔧 New `resolveContactId()` function: Queries Contact/get with proper WHERE clause
- 🔧 Improved `getServerIssuedJwt()`: Auto-resolve integrated, returns undefined gracefully on failure
- 🔧 Enhanced `civicrmApiRequest()`: Multi-level fallback (JWT → empty check → API Key)
- 🔧 New `hasResponseData()` utility: Detects empty responses reliably

**Security Benefits:**
- 🔒 JWT tokens expire automatically (1 hour default, configurable)
- 🔒 Leaked token has limited lifetime vs indefinite API Key
- 🔒 Proper Contact scoping via auto-resolved Contact ID
- 🔒 All communication via HTTPS

### 📚 Documentation

Three new comprehensive guides added:

1. **[JWT_QUICKSTART.md](JWT_QUICKSTART.md)** - 5-minute setup guide
   - CiviCRM configuration checklist
   - n8n credential setup step-by-step
   - Common issues & quick fixes

2. **[JWT_AUTORESOLVE_SETUP.md](JWT_AUTORESOLVE_SETUP.md)** - Complete reference manual
   - Architecture & how auto-resolve works
   - CiviCRM requirements (AuthX, API Key, settings)
   - n8n configuration details
   - Authentication flow diagrams
   - Comprehensive troubleshooting guide
   - Security best practices
   - FAQ & support

3. **[README.md](README.md)** - Updated
   - New Credentials section with JWT details
   - JWT auto-resolve feature description
   - Link to setup guides

### 🐛 Bug Fixes

- Fixed empty response handling: Nodes no longer return "No output data" when JWT has limited permissions
- Fixed Contact/get query: Now uses proper `WHERE api_key = ...` filter to resolve contact correctly
- Fixed credential test: Always uses API Key (doesn't depend on JWT which might fail in test)
- Improved error messages: More descriptive console logs for debugging

### 🔄 Breaking Changes

#### Removed Field: `jwtContactId`

If you have existing credentials with JWT enabled:
- ✅ **Good news**: They automatically migrate! The `jwtContactId` field is ignored.
- ✅ Credentials will work with auto-resolve immediately
- ✅ No manual action needed

**Before (v2.x):**
```json
{
  "enableJwtAuth": true,
  "jwtContactId": 55601  // ← Manual input required
}
```

**After (v3.0+):**
```json
{
  "enableJwtAuth": true
  // jwtContactId removed - auto-resolved instead
}
```

### 📊 Comparison: v2 vs v3

| Feature | v2 (API Key) | v2 (JWT Manual) | v3 (JWT Auto) |
|---------|---|---|---|
| **Setup** | Simple | Complex (need contact ID) | Simple (auto-resolved) |
| **Token Lifetime** | Indefinite | 1 hour (configured) | 1 hour (configured) |
| **Permission Errors** | Fails workflow | Fails workflow | Auto-fallback to API Key |
| **Empty Results** | Returns empty | Returns empty | Auto-retry with API Key |
| **Caching** | None | Manual | Automatic (30 min JWT + ID) |
| **UX** | 3 fields | 5 fields | 3 fields |
| **Security** | Good | Better (time-limited) | Better (time-limited + smart) |

### 🧪 Testing

All features tested against CiviCRM 5.67+ with AuthX enabled:

```bash
✅ Contact ID auto-resolution: Works correctly
✅ JWT generation: Creates valid tokens
✅ API calls with JWT: Returns data properly
✅ Empty response fallback: Detects and retries
✅ Credential testing: Validates correctly
✅ Caching: No redundant API calls
```

### 📦 Dependencies

No new dependencies added. Uses existing:
- `n8n-workflow` for core types
- `node:https` for HTTP requests
- Standard Node.js features

### 🔍 Code Quality

- ✅ TypeScript strict mode
- ✅ No console.log in production (uses warnings for errors)
- ✅ Comprehensive error handling
- ✅ JSDoc comments for all public functions
- ✅ Proper type safety for responses

### ⚡ Performance

- **JWT Caching**: 30-minute TTL reduces redundant generation calls
- **Contact ID Caching**: Eliminates repeated Contact/get lookups
- **Smart Fallback**: Retries only when necessary
- **Memory**: Cache cleared per session (n8n lifecycle)

### 🌍 Compatibility

- ✅ CiviCRM 5.48+ (AuthX required)
- ✅ n8n 1.0.0+
- ✅ Node.js 18+
- ✅ All CMS platforms (WordPress, Drupal, Joomla)
- ✅ Civi-Go compatible

### 📝 Migration Guide

**For existing JWT users:**
1. No action needed - auto-resolve works immediately
2. Update n8n node to v3.0.0
3. Credentials with JWT enabled will automatically use auto-resolve
4. `jwtContactId` field is ignored (backwards compatible)

**For new JWT users:**
1. Follow [JWT_QUICKSTART.md](JWT_QUICKSTART.md)
2. Enable "JWT Auth" toggle in credential
3. Done! Contact ID auto-resolved

**For API Key only users:**
1. No changes needed
2. Credentials continue to work as before
3. Can opt-in to JWT when ready

### 🚀 Next Steps

- [ ] Add JWT token refresh endpoint (manual invalidation)
- [ ] Add JWT scope customization
- [ ] Add multi-contact support (generate JWT for different contact)
- [ ] Add webhook authentication via JWT

---

## [2.x] - Previous Releases

See git history for changes in v2.x and earlier versions.

---

## How to Report Issues

Found a bug or have a feature request? Please:

1. Check [JWT_AUTORESOLVE_SETUP.md Troubleshooting](JWT_AUTORESOLVE_SETUP.md#troubleshooting)
2. Check existing [GitHub Issues](https://github.com/Ixiam/n8n-nodes-civicrm/issues)
3. Open a new issue with:
   - n8n version
   - Node version (v3.0.0+)
   - CiviCRM version
   - Error message (with logs)
   - Minimal reproduction steps

---

## Contributors

- **Ixiam Global Solutions** - Development & maintenance
- **CiviCRM Community** - Feedback & testing

---

**Last Updated:** 2026-08-06
