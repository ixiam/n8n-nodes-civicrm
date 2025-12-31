import type {
	ICredentialType,
	INodeProperties,
	ICredentialTestRequest,
} from 'n8n-workflow';

export class CiviCrmApi implements ICredentialType {

	name = 'civiCrmApi';
	displayName = 'CiviCRM API';
	documentationUrl = 'https://docs.civicrm.org/dev/en/latest/api/';

	properties: INodeProperties[] = [
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

	// ← ESTA ES LA PARTE CRÍTICA
	authenticate = {
		type: 'generic' as const,
		properties: {
			headers: {
				'X-Civi-Auth': '={{ "Bearer " + $credentials.apiToken }}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			method: 'POST',
			url: '={{ $credentials.baseUrl.replace(/\\/$/, "") }}/civicrm/ajax/api4/Contact/get',
			headers: {
				'X-Civi-Auth': '={{ "Bearer " + $credentials.apiToken }}',
				'Content-Type': 'application/json',
			},
			body: { limit: 1 },
		},
	};
}
