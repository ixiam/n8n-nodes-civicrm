import type {
	ICredentialType,
	INodeProperties,
	IHttpRequestMethods,
} from 'n8n-workflow';

export class CiviCrmApi implements ICredentialType {
	name = 'civiCrmApi';
	displayName = 'CiviCRM API';
	documentationUrl = 'https://docs.civicrm.org/dev/en/latest/api/';

	authenticate = {
		type: 'generic' as const,
		properties: {
			headers: {
				'X-Civi-Auth': '={{"Bearer " + $credentials.apiToken}}',
				'Content-Type': 'application/x-www-form-urlencoded',
			},
		},
	};

	// Credential test button
	test = {
		request: {
			method: 'POST' as IHttpRequestMethods,
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

	properties: INodeProperties[] = [
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
