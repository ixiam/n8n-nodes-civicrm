"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CiviCrmApi = void 0;
class CiviCrmApi {
    constructor() {
        this.name = 'civiCrmApi';
        this.displayName = 'CiviCRM API';
        this.documentationUrl = 'https://docs.civicrm.org/dev/en/latest/api/';
        this.authenticate = {
            type: 'generic',
            properties: {
                headers: {
                    'X-Civi-Auth': '={{"Bearer " + $credentials.apiToken}}',
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
            },
        };
        // Credential test button
        this.test = {
            request: {
                method: 'POST',
                url: '={{$credentials.baseUrl.replace(/\\/$/, "")}}/civicrm/ajax/api4/Contact/get',
                headers: {
                    'X-Civi-Auth': '={{"Bearer " + $credentials.apiToken}}',
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: {
                    params: '={"limit":1}', // API4 compatible
                },
                json: true,
            },
        };
        this.properties = [
            {
                displayName: 'Base URL',
                name: 'baseUrl',
                type: 'string',
                default: '',
                required: true,
                placeholder: 'https://crm.example.org',
                description: 'Base URL without a trailing slash.',
            },
            {
                displayName: 'API Token',
                name: 'apiToken',
                type: 'string',
                typeOptions: { password: true },
                default: '',
                required: true,
                description: 'Sent as "X-Civi-Auth: Bearer &lt;token&gt;"',
            },
        ];
    }
}
exports.CiviCrmApi = CiviCrmApi;
