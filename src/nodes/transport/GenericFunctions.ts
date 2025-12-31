import type { IExecuteFunctions, IHttpRequestOptions, JsonObject } from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';

/**
 * Ejecuta una llamada a la API de CiviCRM v4 (Civi-Go)
 * Usa form-urlencoded con el campo "params" serializado
 */
export async function civicrmApiRequest(
  this: IExecuteFunctions,
  method: 'POST',
  path: string,
  body: Record<string, unknown>,
) {
  const credentials = await this.getCredentials('civiCrmApi');
  const baseUrl = (credentials.url as string).replace(/\/$/, '');

  const options: IHttpRequestOptions = {
    method,
    url: `${baseUrl}${path}`,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    // cuerpo plano como espera Civi-Go
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
 * Devuelve el cuerpo estándar para las llamadas API4 (plano)
 */
export function api4(
  entity: string,
  action: string,
  params: Record<string, unknown> = {},
) {
  // devolvemos los parámetros planos, no anidados
  return params;
}
