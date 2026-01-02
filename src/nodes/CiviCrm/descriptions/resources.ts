import type { INodeProperties } from 'n8n-workflow';

//
// =======================
// RESOURCE SELECTOR
// =======================
//
export const resourceProp: INodeProperties = {
	displayName: 'Resource',
	name: 'resource',
	type: 'options',
	default: 'contact',
	description: 'The entity to operate on. Choose "Custom API Call" to access any CiviCRM APIv4 entity not listed.',
	options: [
		{ name: 'Contact', value: 'contact' },
		{ name: 'Membership', value: 'membership' },
		{ name: 'Group', value: 'group' },
		{ name: 'Relationship', value: 'relationship' },
		{ name: 'Activity', value: 'activity' },
		{ name: 'Custom API Call', value: 'customApi' },
	],
};

//
// =======================
// OPERATION SELECTOR
// =======================
//
export const operationProp: INodeProperties = {
	displayName: 'Operation',
	name: 'operation',
	type: 'options',
	default: 'getMany',
	noDataExpression: true,
	description: 'The action to perform on the selected resource.',
	options: [
		{ name: 'Create', value: 'create' },
		{ name: 'Delete', value: 'delete' },
		{ name: 'Get', value: 'get' },
		{ name: 'Get Many', value: 'getMany' },
		{ name: 'Update', value: 'update' },
	],
};
