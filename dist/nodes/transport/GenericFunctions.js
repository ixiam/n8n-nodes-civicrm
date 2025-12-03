"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.civicrmApiRequest = civicrmApiRequest;
exports.api4 = api4;
const n8n_workflow_1 = require("n8n-workflow");
/**
 * Ejecuta una llamada a la API de CiviCRM v4 (Civi-Go)
 * Usa form-urlencoded con el campo "params" serializado
 */
async function civicrmApiRequest(method, path, body) {
    var _a;
    const { baseUrl, apiToken } = (await this.getCredentials('civiCrmApi'));
    const options = {
        method,
        url: `${baseUrl.replace(/\/$/, '')}${path}`,
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'X-Civi-Auth': `Bearer ${apiToken}`,
        },
        // cuerpo plano como espera Civi-Go
        body: {
            params: JSON.stringify((_a = body.params) !== null && _a !== void 0 ? _a : body),
        },
        json: true,
    };
    try {
        const response = await this.helpers.httpRequest(options);
        return response;
    }
    catch (error) {
        throw new n8n_workflow_1.NodeApiError(this.getNode(), error);
    }
}
/**
 * Devuelve el cuerpo estándar para las llamadas API4 (plano)
 */
function api4(entity, action, params = {}) {
    // devolvemos los parámetros planos, no anidados
    return params;
}
