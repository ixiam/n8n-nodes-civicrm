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
                description: 'Enable server-issued JWT authentication for improved security (time-bound tokens, auto-resolved contact ID). When disabled, uses API key authentication.',
            },
            {
                displayName: 'JWT Header Mode',
                name: 'jwtHeaderMode',
                type: 'options',
                default: 'xheader',
                displayOptions: {
                    show: {
                        enableJwtAuth: [true],
                    },
                },
                options: [
                    {
                        name: 'X-Civi-Auth Header (Recommended)',
                        value: 'xheader',
                    },
                    {
                        name: 'Authorization Header',
                        value: 'authorization',
                    },
                    {
                        name: 'Both Headers',
                        value: 'both',
                    },
                ],
                description: 'Where to send the JWT token.',
            },
            {
                displayName: 'JWT Expiry (Seconds)',
                name: 'jwtExpiry',
                type: 'number',
                default: 3600,
                typeOptions: {
                    minValue: 60,
                    maxValue: 86400,
                },
                displayOptions: {
                    show: {
                        enableJwtAuth: [true],
                    },
                },
                description: 'Lifetime of the server-issued JWT, in seconds, before it must be renewed. Default is 3600 (1 hour).',
            },
        ];
        // n8n's CredentialsTester always prefers a `test` defined directly here over the
        // CiviCrm node's `testedBy: 'testCiviCrmApiConnection'` (see CiviCrm.node.ts), so
        // that JWT-aware test never actually runs while this declarative test exists.
        // It's kept as a plain API-key connectivity check so "Test credentials" always
        // works reliably; the node's execution path (addExecutionHints) is what surfaces
        // JWT-specific failures instead.
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
