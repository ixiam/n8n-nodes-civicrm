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

  // Validate JWT configuration FIRST before any request
  if (isJwtAuthEnabled(credentials)) {
    if (!credentials.siteKey || (credentials.siteKey as string).trim() === '') {
      throw new NodeApiError(this.getNode(), {
        message: 'JWT Authentication is enabled but Site Key is not configured. Please provide a Site Key in the CiviCRM credentials.',
        description: 'Site Key is required for JWT authentication. It must match your CiviCRM AuthX Consumer Secret.',
        level: 'error',
      } as JsonObject);
    }
  }

  // Use combined headers: always send X-Civi-Auth for backward compatibility,
  // and add Authorization header with JWT when enhanced auth is enabled
  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
    'X-Civi-Auth': `Bearer ${credentials.apiToken as string}`,
  };

  if (isJwtAuthEnabled(credentials)) {
    // JWT enabled: also send Authorization header with JWT token
    try {
      const token = getValidToken({
        siteKey: credentials.siteKey as string,
        jwtExpiry: (credentials.jwtExpiry as number) || 900,
        baseUrl,
      });
      headers['Authorization'] = `Bearer ${token}`;
    } catch (jwtError: unknown) {
      const errorMsg = jwtError instanceof Error ? jwtError.message : String(jwtError);
      if (errorMsg.includes('Site Key') || errorMsg.includes('required')) {
        throw new NodeApiError(this.getNode(), {
          message: `JWT Authentication Error: ${errorMsg}. Ensure Site Key is configured correctly.`,
          level: 'warning',
        } as JsonObject);
      } else if (errorMsg.includes('Base URL') || errorMsg.includes('Invalid')) {
        throw new NodeApiError(this.getNode(), {
          message: `JWT Configuration Error: ${errorMsg}. Check Base URL format.`,
          level: 'warning',
        } as JsonObject);
      } else {
        throw new NodeApiError(this.getNode(), {
          message: `JWT Token Generation Failed: ${errorMsg}`,
          level: 'warning',
        } as JsonObject);
      }
    }
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
