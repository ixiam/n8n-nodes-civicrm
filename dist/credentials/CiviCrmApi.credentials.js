"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CiviCrmApi = void 0;
class CiviCrmApi {
    constructor() {
        this.name = 'civiCrmApi';
        this.displayName = 'CiviCRM API';
        this.documentationUrl = 'https://docs.civicrm.org/dev/en/latest/api/v4/usage/#auth';
        this.properties = [
            {
                displayName: 'URL',
                name: 'url',
                type: 'string',
                default: '',
                placeholder: 'https://example.org/civicrm',
                required: true,
            },
            {
                displayName: 'API Key',
                name: 'apiKey',
                type: 'string',
                typeOptions: {
                    password: true,
                },
                default: '',
                required: true,
            },
        ];
        this.authenticate = {
            type: 'generic',
            properties: {
                headers: {
                    Authorization: 'Bearer ={{$credentials.apiKey}}',
                },
            },
        };
        this.test = {
            request: {
                baseURL: '={{$credentials.url}}',
                url: '/civicrm/ajax/api4/Contact/get',
                method: 'POST',
                body: {
                    version: 4,
                    select: ['id'],
                    limit: 1,
                },
                ignoreHttpStatusErrors: false,
            },
        };
    }
}
exports.CiviCrmApi = CiviCrmApi;
