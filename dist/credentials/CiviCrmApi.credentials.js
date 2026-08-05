"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.civiCrmApi = exports.CiviCrmApi = void 0;
class CiviCrmApi {
    constructor() {
        this.name = 'civiCrmApi';
        this.displayName = 'CiviCRM API';
        this.icon = 'file:civicrm.svg';
        this.documentationUrl = 'https://docs.civicrm.org/dev/en/latest/api/v4/usage/#auth';
        this.properties = [
            {
                displayName: 'Base URL',
                name: 'baseUrl',
                type: 'string',
                default: '',
                placeholder: 'https://example.org/civicrm',
                required: true,
            },
            {
                displayName: 'API Token',
                name: 'apiToken',
                type: 'string',
                typeOptions: {
                    password: true,
                },
                default: '',
                required: true,
            },
            {
                displayName: 'Enable JWT Authentication',
                name: 'enableJwtAuth',
                type: 'boolean',
                default: false,
                description: 'Use JWT tokens signed with Site Key for enhanced security',
            },
            {
                displayName: 'Site Key',
                name: 'siteKey',
                type: 'string',
                typeOptions: {
                    password: true,
                },
                default: '',
                placeholder: 'Ex: your-site-secret-key',
                description: 'Shared secret for JWT signing (must match CiviCRM AuthX Consumer Secret)',
                displayOptions: {
                    show: {
                        enableJwtAuth: [true],
                    },
                },
                required: false,
            },
            {
                displayName: 'JWT Expiry (seconds)',
                name: 'jwtExpiry',
                type: 'number',
                default: 900,
                description: 'Token lifetime in seconds (default: 900 = 15 minutes)',
                displayOptions: {
                    show: {
                        enableJwtAuth: [true],
                    },
                },
            },
        ];
        this.test = {
            request: {
                baseURL: '={{$credentials.baseUrl}}',
                url: '/civicrm/ajax/api4/Contact/get',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'X-Civi-Auth': '={{ "Bearer " + $credentials.apiToken }}',
                },
                body: {
                    params: JSON.stringify({ select: ['id'], limit: 1 }),
                },
            },
        };
    }
}
exports.CiviCrmApi = CiviCrmApi;
exports.civiCrmApi = CiviCrmApi;
