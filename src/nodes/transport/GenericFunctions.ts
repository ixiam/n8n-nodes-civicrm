import type {
  IExecuteFunctions,
  IHttpRequestOptions,
  INode,
  JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeOperationError } from 'n8n-workflow';
import { isJwtAuthEnabled, getServerIssuedJwt } from './JwtAuth';

type JwtHeaderMode = 'both' | 'authorization' | 'xheader';

function getJwtHeaderMode(credentials: Record<string, unknown>): JwtHeaderMode {
  const rawMode = String(credentials.jwtHeaderMode ?? 'xheader');

  if (rawMode === 'authorization' || rawMode === 'xheader' || rawMode === 'both') {
    return rawMode;
  }

  return 'xheader';
}

function applyJwtHeaders(
  headers: Record<string, string>,
  jwtToken: string,
  headerMode: JwtHeaderMode,
): void {
  const bearer = `Bearer ${jwtToken}`;

  if (headerMode === 'both' || headerMode === 'authorization') {
    headers.Authorization = bearer;
  }

  if (headerMode === 'both' || headerMode === 'xheader') {
    headers['X-Civi-Auth'] = bearer;
  }
}

function getHttpErrorDetails(error: unknown): string {
  const errorObj = error as {
    message?: string;
    response?: { status?: number; data?: unknown };
  };

  const status = errorObj?.response?.status;
  const data = errorObj?.response?.data;
  const message = errorObj?.message ?? 'Request rejected by CiviCRM';

  if (typeof data === 'string' && data.trim()) {
    return status ? `${message} | HTTP ${status} body: ${data}` : `${message} | body: ${data}`;
  }

  if (data && typeof data === 'object') {
    const serialized = JSON.stringify(data);
    return status ? `${message} | HTTP ${status} body: ${serialized}` : `${message} | body: ${serialized}`;
  }

  return status ? `${message} | HTTP ${status}` : message;
}

/**
 * Normalizes the optional per-item "Base URL Override" parameter.
 *
 * - Empty / whitespace-only -> `undefined` (caller uses the credential's Base URL).
 * - Trims, strips trailing slashes, prepends `https://` when no scheme is given.
 * - Rejects any scheme other than http/https, and anything that does not parse
 *   as a URL with a host, with a NodeOperationError.
 *
 * Idempotent: normalizing an already-normalized value returns the same string,
 * so it is safe to call both in the node and in the transport.
 */
export function normalizeBaseUrlOverride(
  node: INode,
  rawValue: unknown,
  itemIndex?: number,
): string | undefined {
  if (rawValue === undefined || rawValue === null) return undefined;

  let value = String(rawValue).trim();
  if (!value) return undefined;

  value = value.replace(/\/+$/, '');

  const schemeMatch = /^([a-z][a-z0-9+.-]*):\/\//i.exec(value);
  if (schemeMatch) {
    const scheme = schemeMatch[1].toLowerCase();
    if (scheme !== 'http' && scheme !== 'https') {
      throw new NodeOperationError(
        node,
        `Invalid Base URL Override "${value}": only http:// and https:// URLs are allowed (got "${scheme}://").`,
        { itemIndex },
      );
    }
  } else {
    value = `https://${value}`;
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new NodeOperationError(
      node,
      `Invalid Base URL Override "${String(rawValue).trim()}": not a valid URL. Expected the site root, e.g. https://example.org`,
      { itemIndex },
    );
  }

  if ((parsed.protocol !== 'http:' && parsed.protocol !== 'https:') || !parsed.hostname) {
    throw new NodeOperationError(
      node,
      `Invalid Base URL Override "${String(rawValue).trim()}": only http:// and https:// URLs with a host are allowed.`,
      { itemIndex },
    );
  }

  return value;
}

export function buildCiviAuthHeaders(
  credentials: Record<string, unknown>,
  baseUrl: string,
  jwtToken?: string,
): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
  };

  // Use JWT if available and enabled; otherwise always fall back to API key
  if (jwtToken && isJwtAuthEnabled(credentials)) {
    const headerMode = getJwtHeaderMode(credentials);
    applyJwtHeaders(headers, jwtToken, headerMode);
  } else {
    // Always provide API key as fallback
    headers['X-Civi-Auth'] = `Bearer ${credentials.apiToken as string}`;
  }

  return headers;
}

/**
 * Executes a CiviCRM API v4 call with authentication (JWT or API Key).
 * Falls back to API Key if JWT is unavailable, fails, or returns empty results.
 *
 * `runtimeBearerToken` (optional) is a per-execution JWT that the caller
 * already holds for a specific real user (e.g. a CiviCRM Authx JWT minted by
 * Drupal for the logged-in contact, passed into the node via the "Runtime
 * Bearer Token" parameter/expression). When provided, it takes absolute
 * priority: it is sent as-is and none of the credential-based logic below
 * (JWT auto-resolve via `getServerIssuedJwt`/`resolveContactId`, or the
 * empty-response/error fallback to the credential's API key) runs at all.
 * See the early-return block right below for why.
 *
 * `baseUrlOverride` (optional) replaces the credential's Base URL for this
 * call (per-item "Base URL Override" parameter), so a single credential/API key
 * can target several CiviCRM instances. It is used for every request made by
 * this call, including the JWT paths (Contact/get auto-resolve,
 * AuthxCredential/create) and the API key fallback. The JWT caches in JwtAuth
 * are keyed by this effective base URL, so a token issued by one instance is
 * never sent to another. Empty/undefined -> credential Base URL, unchanged.
 */
export async function civicrmApiRequest(
  this: IExecuteFunctions,
  method: 'POST',
  path: string,
  body: Record<string, unknown>,
  runtimeBearerToken?: string,
  baseUrlOverride?: string,
) {
  const credentials = (await this.getCredentials('civiCrmApi')) as Record<string, unknown>;
  const normalizedOverride = normalizeBaseUrlOverride(this.getNode(), baseUrlOverride);
  const baseUrl = normalizedOverride ?? (credentials.baseUrl as string).replace(/\/$/, '');
  const apiToken = credentials.apiToken as string;

  // Runtime bearer token path: used exactly as given, with no fallback.
  //
  // This exists for per-user permission enforcement (issue #25): the token
  // here already belongs to a specific real CiviCRM contact (not the
  // credential's own contact/API key owner), so an empty or denied response
  // is a *correct* outcome - it means that real user lacks permission for
  // the requested data - not a failure to silently "fix" by retrying with a
  // more privileged identity. That is exactly the behavior the credential-based
  // path below has (empty JWT response -> retry with the plaintext API key),
  // and it is exactly what must NOT happen here, so this path never falls
  // through into that logic.
  //
  // The token is sent with the same header(s) as the credential's JWT path
  // (`jwtHeaderMode`, default `xheader` = X-Civi-Auth). A hardcoded
  // `Authorization` header is not enough: many nginx + PHP-FPM setups do not
  // pass it to PHP, so CiviCRM sees an unauthenticated request and rejects it
  // ("SECURITY ALERT: Ajax requests can only be issued by javascript
  // clients"). X-Civi-Auth always reaches CiviCRM.
  if (runtimeBearerToken) {
    const headers: Record<string, string> = {
      'Content-Type': 'application/x-www-form-urlencoded',
    };
    applyJwtHeaders(headers, runtimeBearerToken, getJwtHeaderMode(credentials));
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
      // Whatever CiviCRM returns (including an empty `values: []`) is
      // returned to the caller untouched - no retry, no fallback.
      return await this.helpers.httpRequest.call(this, options);
    } catch (error: unknown) {
      throw new NodeApiError(this.getNode(), error as JsonObject);
    }
  }

  let jwtToken: string | undefined;
  let useJwt = false;

  // Attempt to obtain JWT if enabled
  if (isJwtAuthEnabled(credentials)) {
    const ttl = Number(credentials.jwtExpiry ?? 3600);

    try {
      // Auto-resolve contact ID is built-in to getServerIssuedJwt
      jwtToken = await getServerIssuedJwt(this, baseUrl, apiToken, 0, ttl);
      if (jwtToken) {
        useJwt = true;
      } else {
        this.addExecutionHints({
          message: 'JWT authentication could not be obtained (no token returned by CiviCRM). Falling back to API Key authentication.',
          type: 'warning',
          location: 'outputPane',
        });
      }
    } catch (error) {
      const errorMsg = getHttpErrorDetails(error);
      this.addExecutionHints({
        message: `JWT authentication failed (${errorMsg}). Falling back to API Key authentication.`,
        type: 'warning',
        location: 'outputPane',
      });
    }
  }

  // Try with JWT first (if available)
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
      
      // Check if response has data. If JWT returned empty but we expected data, fallback to API key
      const hasData = hasResponseData(response);
      if (hasData) {
        return response;
      } else {
        this.addExecutionHints({
          message: 'The JWT-authenticated request returned no data (JWT may have limited permissions). Retrying with API Key authentication.',
          type: 'warning',
          location: 'outputPane',
        });
        // Fall through to API key attempt below
      }
    } catch (error: unknown) {
      const errorMsg = getHttpErrorDetails(error);
      this.addExecutionHints({
        message: `The JWT-authenticated request failed (${errorMsg}). Retrying with API Key authentication.`,
        type: 'warning',
        location: 'outputPane',
      });
      // Fall through to API key attempt below
    }
  }

  // Fallback to API Key
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
    return await this.helpers.httpRequest.call(this, apiKeyOptions);
  } catch (error: unknown) {
    throw new NodeApiError(this.getNode(), error as JsonObject);
  }
}

/**
 * Check if API response contains actual data.
 * Returns false if response is empty/no results, true if has data.
 */
function hasResponseData(response: any): boolean {
  if (!response) return false;
  
  // Check for APIv4 response format: { values: [...], count: N }
  if (response.values !== undefined) {
    return Array.isArray(response.values) && response.values.length > 0;
  }
  
  // Check for other formats
  if (Array.isArray(response)) {
    return response.length > 0;
  }
  
  // If response exists and isn't an empty array, consider it has data
  return Object.keys(response).length > 0;
}

/**
 * Returns the standard body for API4 calls (flat params).
 */
export function api4(
  entity: string,
  action: string,
  params: Record<string, unknown> = {},
) {
  // return flat parameters, not nested
  return params;
}