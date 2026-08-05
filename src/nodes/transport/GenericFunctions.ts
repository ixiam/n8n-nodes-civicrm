import type {
  IExecuteFunctions,
  ILoadOptionsFunctions,
  IHttpRequestOptions,
  JsonObject,
} from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';
import { isJwtAuthEnabled, getValidToken } from './JwtAuth';

const jwtValidationCache: Record<string, true> = {};

function getJwtValidationCacheKey(credentials: Record<string, unknown>, baseUrl: string): string {
  return [
    baseUrl,
    String(credentials.apiToken ?? ''),
    String(credentials.siteKey ?? ''),
    String(credentials.jwtExpiry ?? 900),
  ].join('|');
}

export function buildCiviAuthHeaders(
  credentials: Record<string, unknown>,
  baseUrl: string,
): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
    'X-Civi-Auth': `Bearer ${credentials.apiToken as string}`,
  };

  if (isJwtAuthEnabled(credentials)) {
    const siteKey = String(credentials.siteKey ?? '').trim();

    if (!siteKey) {
      throw new Error('JWT authentication is enabled but Site Key is empty.');
    }

    headers.Authorization = `Bearer ${getValidToken({
      siteKey,
      jwtExpiry: (credentials.jwtExpiry as number) || 900,
      baseUrl,
    })}`;
  }

  return headers;
}

export async function validateJwtIfEnabled(
  this: IExecuteFunctions | ILoadOptionsFunctions,
  credentials: Record<string, unknown>,
  baseUrl: string,
  headers: Record<string, string>,
) {
  if (!isJwtAuthEnabled(credentials)) {
    return;
  }

  const cacheKey = getJwtValidationCacheKey(credentials, baseUrl);
  if (jwtValidationCache[cacheKey]) {
    return;
  }

  try {
    await this.helpers.httpRequest.call(this, {
      method: 'POST',
      url: `${baseUrl}/civicrm/ajax/api4/Contact/get`,
      headers,
      body: {
        params: JSON.stringify({ select: ['id'], limit: 1 }),
      },
      json: true,
    });

    jwtValidationCache[cacheKey] = true;
  } catch (error) {
    const details = (error as { message?: string })?.message ?? 'Request rejected by CiviCRM';
    throw new Error(`JWT validation failed. Verify Site Key and AuthX JWT configuration. Details: ${details}`);
  }
}

/**
 * Executes a CiviCRM API v4 call (Civi-Go).
 * Uses form-urlencoded encoding with the "params" field serialized as JSON.
 */
export async function civicrmApiRequest(
  this: IExecuteFunctions,
  method: 'POST',
  path: string,
  body: Record<string, unknown>,
) {
  const credentials = (await this.getCredentials('civiCrmApi')) as Record<string, unknown>;
  const baseUrl = (credentials.baseUrl as string).replace(/\/$/, '');
  const headers = buildCiviAuthHeaders(credentials, baseUrl);

  const options: IHttpRequestOptions = {
    method,
    url: `${baseUrl}${path}`,
    headers,
    // flat body as expected by Civi-Go
    body: {
      params: JSON.stringify(body.params ?? body),
    },
    json: true,
  };

  try {
    await validateJwtIfEnabled.call(this, credentials, baseUrl, headers);

    // Use the raw httpRequest helper to avoid automatic header injection
    const response = await this.helpers.httpRequest.call(this, options);
    return response;
  } catch (error: unknown) {
    throw new NodeApiError(this.getNode(), error as JsonObject);
  }
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
