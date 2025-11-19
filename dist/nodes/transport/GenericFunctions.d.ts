import type { IExecuteFunctions } from 'n8n-workflow';
/**
 * Ejecuta una llamada a la API de CiviCRM v4 (Civi-Go)
 * Usa form-urlencoded con el campo "params" serializado
 */
export declare function civicrmApiRequest(this: IExecuteFunctions, method: 'POST', path: string, body: Record<string, unknown>): Promise<any>;
/**
 * Devuelve el cuerpo estándar para las llamadas API4 (plano)
 */
export declare function api4(entity: string, action: string, params?: Record<string, unknown>): Record<string, unknown>;
