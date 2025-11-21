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

	authenticate = {
		type: 'generic' as const,
		properties: {
			baseURL: '={{ $credentials.baseUrl.replace(/\\/$/, "") }}',
			headers: {
				'X-Civi-Auth': '={{ "Bearer " + $credentials.apiToken }}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{ $credentials.baseUrl.replace(/\\/$/, "") }}',
			url: '/civicrm/ajax/api4/Contact/get',
			method: 'POST',
			body: { 
				limit: 1,
				select: ['id']
			},
		},
	};
}
