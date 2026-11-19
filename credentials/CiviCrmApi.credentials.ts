import type {
	IAuthenticate,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

import { authenticateRequest } from '../src/nodes/transport/Auth';

export class CiviCrmApi implements ICredentialType {
	name = 'civiCrmApi';
	displayName = 'CiviCRM API';
	icon = 'file:civicrm.svg' as const;
	documentationUrl = 'https://docs.civicrm.org/dev/en/latest/framework/authx/';

	properties: INodeProperties[] = [
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			default: '',
			placeholder: 'https://crm.example.org',
			required: true,
			description:
				'Root URL of the CiviCRM site, without "/civicrm" (the connector adds /civicrm/ajax/api4 itself)',
		},
		{
			displayName: 'Authentication Type',
			name: 'authType',
			type: 'options',
			default: 'apiKey',
			options: [
				{
					name: 'API Key',
					value: 'apiKey',
					description: 'API key of a CiviCRM contact (needs the "authenticate with api key" permission)',
				},
				{
					name: 'Username and Password',
					value: 'password',
					description:
						'CMS username and password (needs the "authenticate with password" permission and "pass" enabled in the AuthX settings)',
				},
			],
		},
		{
			displayName: 'API Key',
			name: 'apiToken',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			displayOptions: { show: { authType: ['apiKey'] } },
		},
		{
			displayName: 'Username',
			name: 'username',
			type: 'string',
			default: '',
			required: true,
			displayOptions: { show: { authType: ['password'] } },
		},
		{
			displayName: 'Password',
			name: 'password',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			displayOptions: { show: { authType: ['password'] } },
		},
		{
			displayName: 'Send Credentials Via',
			name: 'authFlow',
			type: 'options',
			default: 'xheader',
			options: [
				{
					name: 'X-Civi-Auth Header (Recommended)',
					value: 'xheader',
					description: 'Works behind proxies that strip the Authorization header',
				},
				{
					name: 'Authorization Header',
					value: 'header',
					description: 'Standard HTTP header; CiviCRM disables this route by default (authx_header_cred)',
				},
				{
					name: '_authx Request Parameter',
					value: 'param',
					description: 'Sent in the POST body, for proxies that drop custom headers',
				},
			],
			description:
				'How the credential is sent to CiviCRM. The chosen route must accept this credential type in the AuthX settings.',
		},
		{
			displayName: 'Site Key',
			name: 'siteKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			description:
				'Optional. Sent as X-Civi-Key for sites whose AuthX guard relies on the site key (CIVICRM_SITE_KEY).',
		},
		{
			displayName: 'Use Short-Lived JWT',
			name: 'enableJwtAuth',
			type: 'boolean',
			default: false,
			description:
				'Whether to exchange the credential for a short-lived JWT (AuthxCredential.create) and send that instead. Needs the "generate any authx credential" permission and "jwt" enabled for the chosen route.',
		},
		{
			displayName: 'JWT Expiry (Seconds)',
			name: 'jwtExpiry',
			type: 'number',
			default: 3600,
			typeOptions: { minValue: 60, maxValue: 86400 },
			displayOptions: { show: { enableJwtAuth: [true] } },
			description: 'Lifetime of each JWT before a new one is requested',
		},
		{
			// Kept so credentials saved before 4.0 keep sending JWTs in the header they chose.
			displayName: 'JWT Header Mode (Legacy)',
			name: 'jwtHeaderMode',
			type: 'hidden',
			default: '',
		},
	];

	// Applies the chosen credential type, route and site key (used by the test below).
	authenticate: IAuthenticate = async (credentials, requestOptions) =>
		await authenticateRequest(credentials, requestOptions);

	// Signs in exactly as the node will and asks CiviCRM who the credential belongs to.
	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.baseUrl}}',
			url: '/civicrm/ajax/api4/Contact/get',
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: {
				params: JSON.stringify({ select: ['id'], where: [['id', '=', 'user_contact_id']], limit: 1 }),
			},
		},
	};
}

export const civiCrmApi = CiviCrmApi;
