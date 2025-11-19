import type {
	ICredentialDataDecryptedObject,
	ICredentialTestFunctions,
	ICredentialsDecrypted,
	INodeProperties,
} from 'n8n-workflow';

export class CiviCrmApi {

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

	// ✔ Autenticación genérica (esto sí es válido)
	authenticate = {
		type: 'generic',
		properties: {
			headers: {
				'X-Civi-Auth': '={{"Bearer " + $credentials.apiToken}}',
			},
		},
	};

test = {
	httpRequest: {
		method: 'POST',
		url: '={{ $credentials.baseUrl.replace(/\\/$/, "") }}/civicrm/ajax/api4/Contact/get',
		headers: {
			'X-Civi-Auth': '={{ "Bearer " + $credentials.apiToken }}',
			'Content-Type': 'application/json',
		},
		body: {
			limit: 1,
		},
	},
};
}
