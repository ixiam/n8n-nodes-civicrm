import type {
  IExecuteFunctions,
  IHttpRequestOptions,
  JsonObject,
} from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';
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
 */
export async function civicrmApiRequest(
  this: IExecuteFunctions,
  method: 'POST',
  path: string,
  body: Record<string, unknown>,
) {
  const credentials = (await this.getCredentials('civiCrmApi')) as Record<string, unknown>;
  const baseUrl = (credentials.baseUrl as string).replace(/\/$/, '');
  const apiToken = credentials.apiToken as string;

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
        console.warn('[CiviCRM] JWT generation returned no token, falling back to API key');
        this.addExecutionHints({
          message: 'JWT authentication could not be obtained (no token returned by CiviCRM). Falling back to API Key authentication.',
          type: 'warning',
          location: 'outputPane',
        });
      }
    } catch (error) {
      const errorMsg = getHttpErrorDetails(error);
      console.warn(`[CiviCRM] JWT generation failed: ${errorMsg}. Falling back to API key.`);
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
        console.warn(
          '[CiviCRM] JWT returned empty response. Retrying with API key (JWT may have limited permissions).'
        );
        this.addExecutionHints({
          message: 'The JWT-authenticated request returned no data (JWT may have limited permissions). Retrying with API Key authentication.',
          type: 'warning',
          location: 'outputPane',
        });
        // Fall through to API key attempt below
      }
    } catch (error: unknown) {
      const errorMsg = getHttpErrorDetails(error);
      console.warn('[CiviCRM] JWT request failed. Retrying with API key.');
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
    const response = await this.helpers.httpRequest.call(this, apiKeyOptions);
    if (useJwt && jwtToken) {
      console.log('[CiviCRM] API key request successful (JWT was insufficient, using API key as fallback)');
    }
    return response;
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