import type { IExecuteFunctions, IHttpRequestOptions, JsonObject } from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';
import { isJwtAuthEnabled, getValidToken } from './JwtAuth';

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
  const credentials = await this.getCredentials('civiCrmApi');
  const baseUrl = (credentials.baseUrl as string).replace(/\/$/, '');

  // Always send API token in X-Civi-Auth header for backward compatibility
  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
    'X-Civi-Auth': `Bearer ${credentials.apiToken as string}`,
  };

  // Add Authorization header with JWT if enhanced auth is enabled
  if (isJwtAuthEnabled(credentials)) {
    headers['Authorization'] = `Bearer ${getValidToken({
      siteKey: credentials.siteKey as string,
      jwtExpiry: (credentials.jwtExpiry as number) || 900,
      baseUrl,
    })}`;
  }

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
