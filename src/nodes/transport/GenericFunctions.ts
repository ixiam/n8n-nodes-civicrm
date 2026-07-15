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

  // Determine which token to use
  let authToken = credentials.apiToken as string;
  
  if (isJwtAuthEnabled(credentials)) {
    authToken = getValidToken({
      siteKey: credentials.siteKey as string,
      jwtExpiry: (credentials.jwtExpiry as number) || 900,
      baseUrl,
    });
  }

  const options: IHttpRequestOptions = {
    method,
    url: `${baseUrl}${path}`,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-Civi-Auth': `Bearer ${authToken}`,
    },
    // flat body as expected by Civi-Go
    body: {
      params: JSON.stringify(body.params ?? body),
    },
    json: true,
  };

  try {
    const response = await this.helpers.httpRequestWithAuthentication.call(
      this,
      'civiCrmApi',
      options,
    );
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
