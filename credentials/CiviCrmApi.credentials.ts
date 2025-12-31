import type {
	ICredentialType,
	INodeProperties,
	ICredentialTestRequest,
} from 'n8n-workflow';

export class CiviCrmApi implements ICredentialType {

	name = 'civiCrmApi';
	displayName = 'CiviCRM API';
	documentationUrl = 'https://docs.civicrm.org/dev/en/latest/api/v4/usage/#auth';

	properties: INodeProperties[] = [
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
	];

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
			url: '={{ $credentials.baseUrl }}/civicrm/ajax/api4/Contact/get',
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

export const civiCrmApi = CiviCrmApi;
