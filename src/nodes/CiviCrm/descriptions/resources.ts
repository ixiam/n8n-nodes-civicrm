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
	description:
		'The entity to operate on. "Any Entity" lists every entity and action the site offers; "Custom API Call" sends hand-written APIv4 calls.',
	options: [
		{ name: 'Activity', value: 'activity' },
		{ name: 'Any Entity', value: 'anyEntity', description: 'Entities and actions discovered from the connected site' },
		{ name: 'Contact', value: 'contact' },
		{ name: 'Custom API Call', value: 'customApi' },
		{ name: 'Group', value: 'group' },
		{ name: 'Membership', value: 'membership' },
		{ name: 'Relationship', value: 'relationship' },
	],
};

//
// =======================
// OPERATION SELECTOR
// =======================
//
// Scoped to the 5 fixed resources only (Custom API Call has its own operation
// dropdown below, `customApiOperationProp`). n8n resolves which of the two
// same-named `operation` properties to render based on the current `resource`
// value, since their `displayOptions.show.resource` lists are mutually
// exclusive - this keeps the fixed-resource CRUD operations completely
// unchanged while giving Custom API Call room for its own operation set.
export const operationProp: INodeProperties = {
	displayName: 'Operation',
	name: 'operation',
	type: 'options',
	default: 'getMany',
	noDataExpression: true,
	displayOptions: { show: { resource: ['contact', 'membership', 'group', 'relationship', 'activity'] } },
	options: [
		{ name: 'Create', value: 'create', description: 'Create a new record', action: 'Create a record' },
		{ name: 'Delete', value: 'delete', description: 'Delete a record by ID', action: 'Delete a record' },
		{ name: 'Get', value: 'get', description: 'Retrieve a single record by ID', action: 'Get a record' },
		{ name: 'Get Many', value: 'getMany', description: 'Retrieve multiple records with optional filtering', action: 'Get many records' },
		{ name: 'Update', value: 'update', description: 'Update a record by ID', action: 'Update a record' },
	],
};

//
// =======================
// CUSTOM API OPERATION SELECTOR
// =======================
//
// Only shown when Resource = "Custom API Call". `raw` preserves the original
// hand-typed entity/action/params passthrough. `getFields` and `search` are
// new, structured, discoverable operations for any CiviCRM APIv4 entity (not
// just the 5 fixed resources) - see CiviCrm.node.ts for how they're executed.
//
// The option list intentionally also matches every legacy value the old,
// shared `operationProp` could have stored for a `customApi` resource node
// saved before this property existed (get/getMany/create/update/delete), so
// pre-existing saved workflows keep resolving to the `raw` execution path
// with their `customAction`/`customParamsJson` fields still visible/editable.
export const customApiOperationProp: INodeProperties = {
	displayName: 'Operation',
	name: 'operation',
	type: 'options',
	default: 'raw',
	noDataExpression: true,
	displayOptions: { show: { resource: ['customApi'] } },
	options: [
		{ name: 'Create (Legacy)', value: 'create', description: 'Legacy value, resolves to Raw API Call', action: 'Send a raw api call legacy create' },
		{ name: 'Delete (Legacy)', value: 'delete', description: 'Legacy value, resolves to Raw API Call', action: 'Send a raw api call legacy delete' },
		{ name: 'Dynamic Search', value: 'search', description: 'Run {Entity}/get with a configurable Select and Where for any CiviCRM entity', action: 'Search any entity' },
		{ name: 'Get (Legacy)', value: 'get', description: 'Legacy value, resolves to Raw API Call', action: 'Send a raw api call legacy get' },
		{ name: 'Get Many (Legacy)', value: 'getMany', description: 'Legacy value, resolves to Raw API Call', action: 'Send a raw api call legacy get many' },
		{ name: 'List Fields', value: 'getFields', description: 'Call {Entity}/getFields and return field metadata for any CiviCRM entity', action: 'List the fields of an entity' },
		{ name: 'Raw API Call', value: 'raw', description: 'Hand-typed entity/action/params passthrough to any CiviCRM APIv4 endpoint (advanced/escape hatch)', action: 'Send a raw API call' },
		{ name: 'Update (Legacy)', value: 'update', description: 'Legacy value, resolves to Raw API Call', action: 'Send a raw api call legacy update' },
	],
};
