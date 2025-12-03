"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CiviCrmApi = void 0;
class CiviCrmApi {
    constructor() {
        this.name = 'civiCrmApi';
        this.displayName = 'CiviCRM API';
        this.documentationUrl = 'https://docs.civicrm.org/dev/en/latest/api/';
        this.properties = [
            {
                displayName: 'Base URL',
                name: 'baseUrl',
                type: 'string',
                default: '',
                required: true,
            },
            {
                displayName: 'API Token',
                name: 'apiToken',
                type: 'string',
                typeOptions: { password: true },
                default: '',
                required: true,
            },
        ];
        this.authenticate = {
            type: 'generic',
            properties: {
                headers: {
                    'X-Civi-Auth': '={{ "Bearer " + $credentials.apiToken }}',
                },
            },
        };
        this.test = {
            request: {
                url: '={{ $credentials.baseUrl }}/civicrm/ajax/api4/Contact/get',
                method: 'POST',
                body: {
                    limit: 1,
                    select: ['id']
                },
            },
        };
    }
}
exports.CiviCrmApi = CiviCrmApi;
