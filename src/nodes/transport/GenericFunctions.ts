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

/* ============================================================================
   CiviCRM ERROR DETAILS
   ----------------------------------------------------------------------------
   When CiviCRM rejects an APIv4 call it answers with an HTTP 4xx/5xx and a JSON
   body such as `{error_code, error_message, error_id?, status}` (see
   CRM_Api4_Page_AJAX). Passing the raw HTTP-client error straight to
   `NodeApiError` lost that body: n8n replaces the message with a generic text
   per status code ("The service was not able to process your request" for a
   500) and never surfaces `error_message`. Worse, the raw error carries the
   request config, including the auth headers.

   These helpers extract ONLY the useful, non-sensitive CiviCRM fields from the
   response body, redact anything that looks like a credential, cap the size,
   and build a `NodeApiError` from that sanitized object (never from the raw
   HTTP error). The n8n status-code message is kept as the prefix of the error
   message so existing consumers matching it (e.g. /^Forbidden/) keep working,
   and the CiviCRM detail is appended after " | CiviCRM: ".
============================================================================ */

/** Max length of the CiviCRM error message kept in the error / output item. */
const MAX_CIVI_ERROR_MESSAGE = 1000;
/** Max length of a non-JSON response body excerpt (HTML error pages, etc.). */
const MAX_BODY_EXCERPT = 300;
/** Max length of any other short field (error_code, error_id, db_error...). */
const MAX_SHORT_FIELD = 200;

/** Separator between n8n's status message and CiviCRM's own message. */
export const CIVICRM_ERROR_SEPARATOR = ' | CiviCRM: ';

/**
 * Sanitized CiviCRM error detail. Never contains request headers, credentials,
 * backtraces or SQL: only the fields listed here, each one length-capped.
 */
export interface CiviCrmErrorDetails {
  /** HTTP status of CiviCRM's response, as a string ("500", "403"...). */
  http_code?: string;
  /** APIv4 `error_code` (exception code; "1" when CiviCRM hides the detail). */
  error_code?: string | number;
  /** APIv4 `error_message` (the real reason, or CiviCRM's "Sorry an error occurred... (Error ID: X)"). */
  error_message?: string;
  /** APIv4 `error_id` (recent CiviCRM), to find the full error in CiviCRM's log. */
  error_id?: string;
  /** APIv4 `status` echoed in the body. */
  status?: string | number;
  /** `debug.db_error` short DB error label, only present when CiviCRM sends debug info. */
  db_error?: string;
  /** Plain-text excerpt of a non-JSON body (e.g. an nginx/PHP HTML error page). */
  body?: string;
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/**
 * Removes credential-looking content from a string: the exact secret values
 * we know about (API key, JWTs), any `Bearer`/`Basic` token, any JWT-shaped
 * string and `api_key=`/`token=`-style parameters.
 */
export function redactSecrets(text: string, secrets: Array<string | undefined> = []): string {
  let out = String(text);
  for (const secret of secrets) {
    if (typeof secret === 'string' && secret.length >= 4) {
      out = out.split(secret).join('[REDACTED]');
    }
  }
  out = out.replace(/\b(Bearer|Basic)\s+[A-Za-z0-9\-._~+/]+=*/gi, '$1 [REDACTED]');
  out = out.replace(/\beyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]*/g, '[REDACTED_JWT]');
  out = out.replace(/\b(api_?key|token|password|passwd|secret|jwt)=([^&\s"']+)/gi, '$1=[REDACTED]');
  return out;
}

function cleanString(
  value: unknown,
  max: number,
  secrets: Array<string | undefined>,
): string | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  const text = String(value).trim();
  if (!text) return undefined;
  return truncate(redactSecrets(text, secrets), max);
}

function htmlToText(text: string): string {
  return text
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function bodyToValue(raw: unknown): unknown {
  if (raw === undefined || raw === null) return undefined;
  if (Buffer.isBuffer(raw)) return raw.toString('utf8');
  if (raw instanceof ArrayBuffer) return Buffer.from(raw).toString('utf8');
  return raw;
}

/**
 * Extracts the sanitized CiviCRM detail from an HTTP-client error (axios-style
 * `error.response.{status,data}`, request-style `error.{statusCode,error}`, or
 * the same nested under `error.cause`).
 */
export function extractCiviCrmErrorDetails(
  error: unknown,
  secrets: Array<string | undefined> = [],
): CiviCrmErrorDetails {
  const details: CiviCrmErrorDetails = {};
  if (!error || typeof error !== 'object') return details;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const e = error as Record<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const response = (e.response ?? e.cause?.response) as Record<string, any> | undefined;

  const status =
    response?.status ?? response?.statusCode ?? e.httpCode ?? e.statusCode ?? e.cause?.statusCode;
  if (status !== undefined && status !== null && /^\d{3}$/.test(String(status))) {
    details.http_code = String(status);
  }

  const requestStyleBody =
    typeof e.error === 'object' || typeof e.error === 'string' ? e.error : undefined;
  let data = bodyToValue(response?.data ?? response?.body ?? requestStyleBody);

  if (typeof data === 'string') {
    const trimmed = data.trim();
    data = trimmed;
    if (trimmed.startsWith('{')) {
      try {
        data = JSON.parse(trimmed);
      } catch {
        // Not JSON: keep the text, handled below as a body excerpt.
      }
    }
  }

  if (data && typeof data === 'object' && !Array.isArray(data)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d = data as Record<string, any>;
    const message =
      cleanString(d.error_message, MAX_CIVI_ERROR_MESSAGE, secrets) ??
      cleanString(d.message, MAX_CIVI_ERROR_MESSAGE, secrets) ??
      cleanString(
        typeof d.error === 'string' ? d.error : d.error?.message,
        MAX_CIVI_ERROR_MESSAGE,
        secrets,
      );
    if (message) details.error_message = message;

    if (typeof d.error_code === 'number') {
      details.error_code = d.error_code;
    } else {
      const code = cleanString(d.error_code, MAX_SHORT_FIELD, secrets);
      if (code) details.error_code = code;
    }

    // Users without 'view debug output' only get "Sorry an error occurred...
    // (Error ID: XXXX-XXXX-XXXX)" and, depending on the CiviCRM version, no
    // `error_id` field: take it from the message so it can be looked up in
    // CiviCRM's log.
    const errorId =
      cleanString(d.error_id, MAX_SHORT_FIELD, secrets) ??
      /\(Error ID: ([A-Za-z0-9-]{4,64})\)/.exec(details.error_message ?? '')?.[1];
    if (errorId) details.error_id = errorId;

    if (typeof d.status === 'number') {
      details.status = d.status;
    } else {
      const st = cleanString(d.status, MAX_SHORT_FIELD, secrets);
      if (st) details.status = st;
    }

    const dbError = cleanString(d.debug?.db_error, MAX_SHORT_FIELD, secrets);
    if (dbError) details.db_error = dbError;
  } else if (typeof data === 'string' && data) {
    const text = htmlToText(data);
    if (text) details.body = truncate(redactSecrets(text, secrets), MAX_BODY_EXCERPT);
  }

  return details;
}

/** One-line summary of the CiviCRM detail ("" when CiviCRM sent nothing usable). */
export function summarizeCiviCrmError(details: CiviCrmErrorDetails): string {
  let text = details.error_message ?? details.body ?? '';
  if (details.db_error && !text.includes(details.db_error)) {
    text = text ? `${text} (${details.db_error})` : details.db_error;
  }
  return text;
}

/**
 * Builds the NodeApiError thrown when a CiviCRM call fails.
 *
 * - `message`: n8n's usual status-code message (unchanged prefix, so existing
 *   checks such as /^Forbidden/ still match) + " | CiviCRM: <error_message>"
 *   when CiviCRM sent a reason.
 * - `description`: HTTP code, error_code, error_id and the CiviCRM message.
 * - `context.civicrm`: the sanitized `CiviCrmErrorDetails` (read by the node to
 *   expose them in the Continue On Fail output item).
 *
 * The raw HTTP error is never attached (it carries the request config, i.e.
 * the auth headers); only a sanitized plain object reaches NodeApiError.
 */
export function buildCiviCrmApiError(
  node: INode,
  error: unknown,
  secrets: Array<string | undefined> = [],
  itemIndex?: number,
): NodeApiError {
  if (error instanceof NodeApiError) return error;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const e = (error && typeof error === 'object' ? error : {}) as Record<string, any>;
  const details = extractCiviCrmErrorDetails(error, secrets);
  let rawMessage = 'Request to CiviCRM failed';
  if (typeof e.message === 'string' && e.message.trim()) rawMessage = e.message;
  else if (typeof error === 'string' && error.trim()) rawMessage = error;

  const errorResponse: JsonObject = {
    message: truncate(redactSecrets(rawMessage, secrets), MAX_SHORT_FIELD),
  };
  // Network-level codes (ECONNREFUSED, ETIMEDOUT...) let n8n pick its usual
  // descriptive message when there is no HTTP status.
  if (typeof e.code === 'string' && /^[A-Z0-9_]{2,40}$/.test(e.code)) {
    errorResponse.code = e.code;
  }

  const summary = summarizeCiviCrmError(details);

  const descriptionParts: string[] = [];
  if (details.http_code) descriptionParts.push(`HTTP ${details.http_code}`);
  if (details.error_code !== undefined) descriptionParts.push(`error_code ${details.error_code}`);
  if (details.error_id) descriptionParts.push(`error_id ${details.error_id}`);
  const description = summary
    ? `CiviCRM APIv4 error${descriptionParts.length ? ` (${descriptionParts.join(', ')})` : ''}: ${summary}`
    : undefined;

  const apiError = new NodeApiError(node, errorResponse, {
    httpCode: details.http_code,
    description,
    itemIndex,
  });

  if (summary) {
    apiError.message = `${apiError.message}${CIVICRM_ERROR_SEPARATOR}${summary}`;
  }
  if (Object.keys(details).length) {
    apiError.context.civicrm = details as unknown as JsonObject;
  }

  return apiError;
}

/** Short, sanitized text for execution hints (JWT -> API key fallback). */
function getHttpErrorDetails(error: unknown, secrets: Array<string | undefined> = []): string {
  const errorObj = (error && typeof error === 'object' ? error : {}) as { message?: string };
  const message = redactSecrets(
    truncate(String(errorObj.message ?? 'Request rejected by CiviCRM'), MAX_SHORT_FIELD),
    secrets,
  );
  const details = extractCiviCrmErrorDetails(error, secrets);
  const summary = summarizeCiviCrmError(details);
  const status = details.http_code ? ` | HTTP ${details.http_code}` : '';
  return summary ? `${message}${status}${CIVICRM_ERROR_SEPARATOR}${summary}` : `${message}${status}`;
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
      throw buildCiviCrmApiError(this.getNode(), error, [runtimeBearerToken, apiToken]);
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
      const errorMsg = getHttpErrorDetails(error, [apiToken, jwtToken]);
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
      const errorMsg = getHttpErrorDetails(error, [apiToken, jwtToken]);
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
    throw buildCiviCrmApiError(this.getNode(), error, [apiToken, jwtToken]);
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