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
	noDataExpression: true,
	default: 'contact',
	description: 'The entity to operate on. Choose "Custom API Call" to access any CiviCRM APIv4 entity not listed.',
	options: [
		{ name: 'Activity', value: 'activity' },
		{ name: 'Contact', value: 'contact' },
		{ name: 'Group', value: 'group' },
		{ name: 'Membership', value: 'membership' },
		{ name: 'Relationship', value: 'relationship' },
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
		{ name: 'Create', value: 'create', description: 'Create a new record' },
		{ name: 'Delete', value: 'delete', description: 'Delete a record by ID' },
		{ name: 'Get', value: 'get', description: 'Retrieve a single record by ID' },
		{ name: 'Get Many', value: 'getMany', description: 'Retrieve multiple records with optional filtering' },
		{ name: 'Update', value: 'update', description: 'Update a record by ID' },
	],
};
