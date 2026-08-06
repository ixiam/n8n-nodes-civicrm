# Technical Architecture: JWT Auto-Resolve

**Target Audience:** Developers, Contributors, Maintainers  
**Date:** 2026-08-06

---

## System Overview

```
┌─────────────────────────────────────────────────────────┐
│                    n8n Workflow                          │
├─────────────────────────────────────────────────────────┤
│  [CiviCRM Node] → civicrmApiRequest()                    │
└─────────────────────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────┐
│        GenericFunctions.ts (Main Orchestrator)           │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  1. Check: JWT enabled?                                 │
│  2. Get JWT (via JwtAuth.ts)                            │
│  3. Try API call (with JWT or API Key)                  │
│  4. Check response: has data?                           │
│  5. Fallback: if no data → retry with API Key           │
│                                                          │
└─────────────────────────────────────────────────────────┘
       ↙                           ↘
    JwtAuth.ts              CiviCRM API
 (Token Gen & Caching)      (HTTP Endpoint)
```

---

## Component: `JwtAuth.ts`

### Exported Functions

#### 1. `isJwtAuthEnabled(credentials: any): boolean`

**Purpose:** Check if JWT is enabled in credential form.

```typescript
export function isJwtAuthEnabled(credentials: any): boolean {
  return credentials?.enableJwtAuth === true;
}
```

**Usage:**
```typescript
if (isJwtAuthEnabled(credentials)) {
  // Try JWT flow
}
```

**Returns:** `true` if user toggled "Enable JWT Auth", `false` otherwise.

---

#### 2. `resolveContactId(context, baseUrl, apiToken): Promise<number | undefined>`

**Purpose:** Resolve the Contact ID that owns the given API Key.

**Flow:**
```
Input: apiToken = "KyoPZYVtQMjbfXzq"
  ↓
Check cache[baseUrl:apiToken]
  ├─ If cached → return cached ID ✓
  └─ If not cached → continue
  ↓
POST /civicrm/ajax/api4/Contact/get
  Header: X-Civi-Auth: Bearer {apiToken}
  Body: {
    select: ["id"],
    where: [["api_key", "=", apiToken]],
    limit: 1
  }
  ↓
Parse response: response.values[0].id
  ↓
Store in cache[baseUrl:apiToken]
  ↓
Return: contactId (number)
```

**Implementation Details:**

```typescript
const contactIdCache: Record<string, number> = {};

export async function resolveContactId(
  context: IExecuteFunctions | ILoadOptionsFunctions,
  baseUrl: string,
  apiToken: string,
): Promise<number | undefined> {
  const cacheKey = `${baseUrl}:${apiToken}`;
  
  // ✓ Optimization: Check cache first
  if (contactIdCache[cacheKey]) {
    return contactIdCache[cacheKey];
  }

  try {
    // 1. Make Contact/get request with WHERE filter
    const response = await context.helpers.httpRequest.call(context, {
      method: 'POST',
      url: `${baseUrl}/civicrm/ajax/api4/Contact/get`,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Civi-Auth': `Bearer ${apiToken}`,
      },
      body: {
        // ✓ KEY: WHERE clause to find contact by api_key
        params: JSON.stringify({
          select: ['id'],
          where: [['api_key', '=', apiToken]],
          limit: 1,
        }),
      },
      json: true,
    });

    // 2. Extract contact from response
    const contacts = (response as { values?: Array<{ id: number }> })?.values || [];
    if (contacts.length === 0) {
      console.warn('[CiviCRM] Contact/get found no contact with this api_key');
      return undefined; // Graceful failure
    }

    // 3. Cache and return
    const contactId = contacts[0].id;
    contactIdCache[cacheKey] = contactId;
    return contactId;

  } catch (error) {
    // ✓ Graceful degradation: return undefined instead of throw
    console.warn(`[CiviCRM] Failed to auto-resolve: ${error.message}`);
    return undefined;
  }
}
```

**Key Design Decisions:**

1. **WHERE Clause**: `[['api_key', '=', apiToken]]` is CRITICAL
   - Without it: Returns empty (no filter = gets no specific contact)
   - With it: Returns the Contact that owns the API Key ✓

2. **Caching**: Simple in-memory cache
   - Key: `${baseUrl}:${apiToken}`
   - No expiry (contact ID doesn't change)
   - Thread-safe: each request gets own context

3. **Error Handling**: Returns `undefined` instead of throwing
   - Allows caller to decide next action
   - Won't break workflow if resolution fails

**Performance:** O(1) cache lookup + O(1) CiviCRM API call

---

#### 3. `getServerIssuedJwt(context, baseUrl, apiToken, contactId?, ttl?): Promise<string | undefined>`

**Purpose:** Generate or return cached JWT token.

**Flow:**
```
Input: contactId = 0 (or undefined)
  ↓
Auto-resolve needed?
  ├─ YES (contactId === 0)
  │  └─ Call resolveContactId()
  │     └─ If fails: return undefined (no JWT)
  │     └─ If succeeds: use resolved contactId
  └─ NO: use provided contactId
  ↓
Check JWT cache[baseUrl:contactId:ttl]
  ├─ If valid & not expiring soon (>30s) → return ✓
  └─ If expired or expiring soon → continue
  ↓
POST /civicrm/ajax/api4/AuthxCredential/create
  Header: X-Civi-Auth: Bearer {apiToken}
  Body: {
    contactId: {resolvedContactId},
    ttl: {ttl}
  }
  ↓
Parse response: response.values[0].cred
  Format: "Bearer eyJ0eXAi..."
  ↓
Extract token: substring(7) to remove "Bearer "
  ↓
Store in cache with expiry = now + ttl*1000
  ↓
Return: token (string)
```

**Implementation Details:**

```typescript
interface ServerIssuedJwt {
  token: string;
  expiresAt: number; // Timestamp milliseconds
}

const serverIssuedCache: Record<string, ServerIssuedJwt> = {};

export async function getServerIssuedJwt(
  context: IExecuteFunctions | ILoadOptionsFunctions,
  baseUrl: string,
  apiToken: string,
  contactId: number = 0, // ✓ Default 0 triggers auto-resolve
  ttl: number = 3600,
): Promise<string | undefined> {
  
  // ===== STEP 1: Auto-Resolve if needed =====
  let resolvedContactId = contactId;
  if (resolvedContactId === 0 || resolvedContactId === undefined) {
    const resolved = await resolveContactId(context, baseUrl, apiToken);
    if (!resolved) {
      // Can't resolve → can't generate JWT
      return undefined;
    }
    resolvedContactId = resolved;
  }

  // ===== STEP 2: Check Cache =====
  const cacheKey = `${baseUrl}:${resolvedContactId}:${ttl}`;
  const now = Date.now();
  const cached = serverIssuedCache[cacheKey];

  // ✓ KEY: 30-second safety buffer
  // Prevents mid-request expiry. Refresh if expires in <30s
  if (cached && cached.expiresAt > now + 30000) {
    return cached.token;
  }

  // ===== STEP 3: Generate JWT =====
  try {
    const response = await context.helpers.httpRequest.call(context, {
      method: 'POST',
      url: `${baseUrl}/civicrm/ajax/api4/AuthxCredential/create`,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Civi-Auth': `Bearer ${apiToken}`,
      },
      body: {
        params: JSON.stringify({
          contactId: resolvedContactId,
          ttl: ttl,
        }),
      },
      json: true,
    });

    // Parse response
    const cred = (response as { values?: Array<{ cred: string }> })
      ?.values?.[0]?.cred || '';
    
    if (!cred.startsWith('Bearer ')) {
      console.warn('[CiviCRM] Invalid JWT response: missing Bearer token');
      return undefined;
    }

    // Extract token (remove "Bearer " prefix)
    const token = cred.substring(7);
    
    // Store in cache
    serverIssuedCache[cacheKey] = {
      token,
      expiresAt: now + ttl * 1000,
    };

    return token;

  } catch (error) {
    // Distinguish permission errors from other errors
    const isPermissionDenied = error.message.includes('403') || 
                               error.message.includes('Permission denied');
    
    if (isPermissionDenied) {
      console.warn(
        '[CiviCRM JWT] User lacks permissions. Will use API key instead.'
      );
    } else {
      console.warn(
        `[CiviCRM JWT] Failed to obtain JWT: ${error.message}`
      );
    }
    
    // ✓ Return undefined → allows fallback to API Key
    return undefined;
  }
}
```

**Key Design Decisions:**

1. **Auto-Resolve Default**: `contactId = 0` signals auto-resolve needed
   - Allows `getServerIssuedJwt(context, baseUrl, apiToken, 0, ttl)`
   - Caller doesn't need to resolve separately

2. **30-Second Safety Buffer**: `expiresAt > now + 30000`
   - Prevents token expiring mid-request
   - Trade-off: slight inefficiency vs stability
   - Example: 1-hour JWT gets refreshed at 30 minutes mark

3. **Graceful Error Handling**:
   - Permission errors (403): log warning, return undefined
   - Other errors: log warning, return undefined
   - Never throw → allows fallback mechanism

4. **Response Parsing**:
   - Response format: `{ values: [{ cred: "Bearer eyJ0..." }] }`
   - Extract token substring (remove "Bearer " prefix)
   - Validate format before caching

**Performance:**
- First call: O(2) API requests (resolve + generate)
- Subsequent calls (within TTL): O(1) cache lookup
- Subsequent calls (after TTL): O(1) API request (fast refresh)

---

## Component: `GenericFunctions.ts`

### Main Function: `civicrmApiRequest()`

**Purpose:** Execute CiviCRM API call with intelligent authentication.

**Flow:**
```
Input: method, path, body
  ↓
[STAGE 1] Attempt JWT (if enabled)
  ├─ Call: getServerIssuedJwt()
  └─ If returns token → continue
     If returns undefined → skip JWT
  ↓
[STAGE 2] Make API call with JWT (if available)
  ├─ Build headers: X-Civi-Auth: Bearer {jwt}
  ├─ Make request
  ├─ Check: does response have data?
  │  ├─ YES (values.length > 0) → return response ✓
  │  └─ NO (empty response)
  │     └─ Log: "JWT returned empty. Retrying with API Key."
  │     └─ Continue to fallback
  └─ Catch errors → continue to fallback
  ↓
[STAGE 3] Fallback to API Key (if JWT failed/empty)
  ├─ Build headers: X-Civi-Auth: Bearer {apiKey}
  ├─ Make request
  └─ Return response (or error if both fail)
```

**Implementation Details:**

```typescript
export async function civicrmApiRequest(
  this: IExecuteFunctions,
  method: 'POST',
  path: string,
  body: Record<string, unknown>,
) {
  const credentials = await this.getCredentials('civiCrmApi') 
    as Record<string, unknown>;
  const baseUrl = (credentials.baseUrl as string).replace(/\/$/, '');
  const apiToken = credentials.apiToken as string;

  let jwtToken: string | undefined;
  let useJwt = false;

  // ===== STAGE 1: Attempt JWT =====
  if (isJwtAuthEnabled(credentials)) {
    const ttl = Number(credentials.jwtExpiry ?? 3600);

    try {
      jwtToken = await getServerIssuedJwt(
        this, 
        baseUrl, 
        apiToken, 
        0, // ← Auto-resolve
        ttl
      );
      if (jwtToken) {
        useJwt = true;
      } else {
        console.warn(
          '[CiviCRM] JWT generation returned no token, falling back to API key'
        );
      }
    } catch (error) {
      console.warn(
        `[CiviCRM] JWT generation failed: ${error.message}. Falling back...`
      );
    }
  }

  // ===== STAGE 2: Try JWT (if available) =====
  if (useJwt && jwtToken) {
    const headers = buildCiviAuthHeaders(credentials, baseUrl, jwtToken);
    const options: IHttpRequestOptions = {
      method,
      url: `${baseUrl}${path}`,
      headers,
      body: {
        params: JSON.stringify(body.params ?? body),
      },
      json: true,
    };

    try {
      const response = await this.helpers.httpRequest.call(this, options);
      
      // ✓ KEY: Check if response has actual data
      const hasData = hasResponseData(response);
      if (hasData) {
        return response; // Success with JWT ✓
      } else {
        console.warn(
          '[CiviCRM] JWT returned empty. Retrying with API key ' +
          '(JWT may have limited permissions).'
        );
        // Fall through to API key attempt
      }
    } catch (error: unknown) {
      console.warn('[CiviCRM] JWT request failed. Retrying with API key.');
      // Fall through to API key attempt
    }
  }

  // ===== STAGE 3: Fallback to API Key =====
  const apiKeyHeaders = buildCiviAuthHeaders(credentials, baseUrl, undefined);
  const apiKeyOptions: IHttpRequestOptions = {
    method,
    url: `${baseUrl}${path}`,
    headers: apiKeyHeaders,
    body: {
      params: JSON.stringify(body.params ?? body),
    },
    json: true,
  };

  try {
    const response = await this.helpers.httpRequest.call(this, apiKeyOptions);
    if (useJwt && jwtToken) {
      console.log(
        '[CiviCRM] API key request successful ' +
        '(JWT was insufficient, using API key as fallback)'
      );
    }
    return response;
  } catch (error: unknown) {
    throw new NodeApiError(this.getNode(), error as JsonObject);
  }
}
```

### Utility Function: `hasResponseData(response: any): boolean`

**Purpose:** Detect if API response contains actual data.

```typescript
function hasResponseData(response: any): boolean {
  if (!response) return false;
  
  // ✓ CiviCRM APIv4 format: { values: [...], count: N }
  if (response.values !== undefined) {
    return Array.isArray(response.values) && response.values.length > 0;
  }
  
  // ✓ Array format
  if (Array.isArray(response)) {
    return response.length > 0;
  }
  
  // ✓ Other formats: if response exists and not empty
  return Object.keys(response).length > 0;
}
```

**Examples:**
```typescript
hasResponseData({ values: [], count: 0 })          // false
hasResponseData({ values: [{ id: 1 }], count: 1 }) // true
hasResponseData([])                                  // false
hasResponseData([{ id: 1 }])                        // true
hasResponseData({})                                  // false
```

---

## Caching Strategy

### Contact ID Cache

```
Cache: Record<string, number>
Key: `${baseUrl}:${apiToken}`
Value: contactId (number)
TTL: Indefinite (contact ID never changes)

Example:
  Cache["https://crm.org:MyApiKey123"] = 55601
```

**When Used:**
- First JWT generation per API key
- Subsequent JWT generations reuse cached ID

**Invalidation:**
- Session-scoped (cleared when n8n session ends)
- Manual: user generates new API key in CiviCRM

---

### JWT Token Cache

```
Cache: Record<string, ServerIssuedJwt>
Key: `${baseUrl}:${contactId}:${ttl}`
Value: { token: string, expiresAt: number }
TTL: As configured (default 3600 = 1 hour)

Example:
  Cache["https://crm.org:55601:3600"] = {
    token: "eyJ0eXAi...",
    expiresAt: 1723028400000  // 1 hour from now
  }
```

**When Used:**
- First JWT generation per contact/TTL combination
- Returned within TTL (30-second safety buffer)

**Expiry Logic:**
```
if (cached && cached.expiresAt > now + 30000) {
  // Valid: has 30+ seconds remaining
  return cached.token;
} else {
  // Expired or expiring soon: refresh
  // Generate new JWT
}
```

**Invalidation:**
- Automatic: when expiresAt < now
- Session-scoped: cleared when n8n session ends

---

## Error Handling Strategy

### Level 1: JWT Auto-Resolve

```
resolveContactId()
  ↓
  Error (network, invalid response, etc.)
    ↓
    Log: [CiviCRM] Failed to auto-resolve contact ID: ...
    ↓
    Return: undefined
    ↓
  Caller (getServerIssuedJwt) sees undefined
    ↓
    Cannot generate JWT
    ↓
    Fall back to API Key
```

**Result:** Workflow doesn't break; uses API Key instead.

---

### Level 2: JWT Generation

```
getServerIssuedJwt()
  ↓
  Error (permission denied, network, invalid contact ID)
    ↓
    Distinguish:
      ├─ Permission error (403, "Permission denied")
      │  └─ Log: User lacks permissions, using API key
      │
      └─ Other error
         └─ Log: JWT generation failed, using API key
    ↓
    Return: undefined
    ↓
  Caller (civicrmApiRequest) sees undefined
    ↓
    Skip JWT → use API Key directly
```

**Result:** Workflow doesn't break; falls back immediately.

---

### Level 3: API Call Execution

```
civicrmApiRequest()
  ↓
  [If JWT available]
    Make request with JWT
      ↓
      Success + data
        └─ Return response ✓
      ↓
      Success but empty
        └─ Log: JWT returned empty, retrying...
        └─ Fall through to API Key
      ↓
      Error (exception)
        └─ Log: JWT request failed, retrying...
        └─ Fall through to API Key
  ↓
  [API Key fallback]
    Make request with API Key
      ↓
      Success
        └─ Return response ✓
      ↓
      Error (exception)
        └─ Throw NodeApiError (workflow fails, as expected)
```

**Result:** 
- JWT works → use JWT ✓
- JWT insufficient → auto-fallback to API Key ✓
- Both fail → workflow fails (expected) ✗

---

## Security Considerations

### JWT Token Safety

1. **Lifetime**: Default 1 hour
   - Leaked token: access only for 1 hour
   - Compared to API Key: indefinite access
   - **Advantage:** Time-limited exposure

2. **Scope**: Limited to resolved Contact
   - JWT scoped to `sub: cid:{contactId}`
   - Contact has its own CiviCRM permissions
   - **Advantage:** Can't exceed Contact's access

3. **Signing**: CiviCRM internal keys
   - JWT signed with CiviCRM HMAC keys
   - Cannot be forged by external party
   - **Advantage:** CiviCRM validates authority

### API Key Safety

1. **Stored**: n8n credential encryption
   - Encrypted at rest (n8n handles)
   - Sent only over HTTPS
   - **Best Practice:** Never log raw key

2. **Revocation**: Manual via CiviCRM
   - Regenerate key → old key invalid
   - **Best Practice:** Rotate quarterly

### Recommendations

```
For automated workflows:
  ✅ Use JWT (time-limited)

For manual/occasional tasks:
  ✅ Use API Key (simpler)

For high-security:
  ✅ Use JWT + short TTL (e.g., 300 seconds)
  ✅ Rotate API keys frequently
  ✅ Monitor access logs
```

---

## Testing Strategy

### Unit Tests Needed

```typescript
describe('JwtAuth.ts', () => {
  describe('resolveContactId', () => {
    it('should resolve contact ID from API key', async () => {
      // Mock: Contact/get returns { values: [{ id: 55601 }] }
      // Assert: returns 55601
    });

    it('should cache contact ID', async () => {
      // Call twice with same key
      // Assert: second call uses cache (no HTTP request)
    });

    it('should return undefined if contact not found', async () => {
      // Mock: Contact/get returns { values: [] }
      // Assert: returns undefined (graceful)
    });
  });

  describe('getServerIssuedJwt', () => {
    it('should generate JWT with auto-resolved contact', async () => {
      // Mock: resolveContactId returns 55601
      // Mock: AuthxCredential/create returns { values: [{ cred: "Bearer ..." }] }
      // Assert: returns JWT token
    });

    it('should use cached JWT', async () => {
      // Call twice
      // Assert: second call uses cache (no HTTP request)
    });

    it('should refresh expired JWT', async () => {
      // Mock: expired cache entry
      // Assert: generates new JWT
    });

    it('should return undefined on permission error', async () => {
      // Mock: AuthxCredential/create returns 403
      // Assert: returns undefined (fallback to API Key)
    });
  });
});

describe('GenericFunctions.ts', () => {
  describe('civicrmApiRequest', () => {
    it('should use JWT when enabled', async () => {
      // Mock: JWT enabled, JWT generation succeeds
      // Assert: request headers contain JWT
    });

    it('should fallback to API key if JWT returns empty', async () => {
      // Mock: JWT returns { values: [], count: 0 }
      // Assert: retries with API Key
      // Assert: API Key returns data
    });

    it('should handle missing API data gracefully', async () => {
      // Both JWT and API Key return empty
      // Assert: returns empty response (workflow decides)
    });
  });

  describe('hasResponseData', () => {
    it('should detect APIv4 format with data', () => {
      expect(hasResponseData({ values: [{ id: 1 }] })).toBe(true);
    });

    it('should detect APIv4 format without data', () => {
      expect(hasResponseData({ values: [] })).toBe(false);
    });

    it('should detect array format', () => {
      expect(hasResponseData([{ id: 1 }])).toBe(true);
      expect(hasResponseData([])).toBe(false);
    });
  });
});
```

### Integration Tests Needed

```bash
# Test against real CiviCRM instance

1. JWT generation with auto-resolve
   ├─ Create API key in test contact
   ├─ Enable JWT in credential
   ├─ Make API call
   └─ Assert: JWT used, data returned

2. JWT fallback to API Key
   ├─ Mock JWT to return empty
   ├─ Make API call
   └─ Assert: API Key used, data returned

3. Contact ID auto-resolve accuracy
   ├─ Create two contacts with different API keys
   ├─ Verify each JWT scoped to correct contact
   └─ Assert: proper permission isolation
```

---

## Performance Characteristics

### Time Complexity

| Operation | Complexity | Notes |
|-----------|-----------|-------|
| API call (cached) | O(1) | Cache lookup + HTTP request |
| First JWT gen | O(2) | Resolve + generate (2 HTTP calls) |
| Subsequent JWT gen (cached) | O(1) | Cache lookup |
| JWT fallback | O(1) | HTTP request with API Key |

### Space Complexity

```
Contact ID Cache: O(n) 
  where n = number of unique (baseUrl, apiToken) pairs

JWT Token Cache: O(m)
  where m = number of unique (baseUrl, contactId, ttl) pairs

Typical usage: n ≈ 1-5, m ≈ 1-10
Memory: <1KB per n8n session
```

### Network Calls

```
Per workflow execution:

Best case (JWT cached):
  1 HTTP call (API request)

Typical case (JWT expires):
  3 HTTP calls (resolve, generate, API request)

Worst case (both caches miss):
  3 HTTP calls (same as typical)

Fallback case (JWT → API Key):
  4 HTTP calls (resolve, generate, API request failed, API Key retry)
```

---

## Future Enhancements

### Planned Features

1. **JWT Invalidation Endpoint**
   - Manual JWT expiry (don't wait 1 hour)
   - Useful for security incidents

2. **Custom JWT Scope**
   - Allow specifying required CiviCRM permissions
   - Generated JWT limited to those scopes

3. **Multi-Contact Support**
   - Generate JWT for different contact than API key owner
   - Useful for delegated access

4. **Webhook JWT**
   - JWT for webhook authentication
   - Separate from API call JWT

### Potential Optimizations

1. **Distributed Caching**
   - Redis cache (shared across n8n instances)
   - Reduces API calls in multi-instance setup

2. **Batch JWT Generation**
   - Pre-generate multiple JWTs
   - Reduces first-call latency

3. **OAuth2 Integration**
   - OAuth flow to CiviCRM
   - More flexible for SaaS scenarios

---

## Contributing

### Code Style

```typescript
// Always include JSDoc for public functions
/**
 * Brief description.
 * 
 * @param param1 - Description
 * @returns Description
 * @throws When this happens
 */
export async function myFunction(param1: string): Promise<string> {
  // Implementation
}
```

### Adding New Features

1. Add feature to appropriate file (JwtAuth.ts or GenericFunctions.ts)
2. Add unit tests in `test/`
3. Update documentation (README.md, CHANGELOG)
4. Submit PR

### Reporting Bugs

Include:
- CiviCRM version
- n8n version
- Exact error message
- Steps to reproduce
- Expected vs actual behavior

---

## References

- [CiviCRM AuthX Docs](https://docs.civicrm.org/dev/en/latest/framework/authx/)
- [CiviCRM APIv4 Docs](https://docs.civicrm.org/dev/en/latest/api/v4/usage/)
- [n8n Credentials Docs](https://docs.n8n.io/credentials/)
- [JWT.io](https://jwt.io/)

---

**Last Updated:** 2026-08-06  
**Maintained by:** Ixiam Global Solutions
