import type { INodeProperties } from 'n8n-workflow';

const show = (operation?: string[]) => ({
	show: operation ? { resource: ['anyEntity'], operation } : { resource: ['anyEntity'] },
});

/** Standard operations get their own entries in n8n's node picker; "Other Action" opens the discovered list. */
export const anyEntityOperationProp: INodeProperties = {
	displayName: 'Operation',
	name: 'operation',
	type: 'options',
	noDataExpression: true,
	default: 'get',
	displayOptions: show(),
	options: [
		{ name: 'Create', value: 'create', description: 'Create a record', action: 'Create a record in any entity' },
		{
			name: 'Create or Update',
			value: 'save',
			description: 'Create a record, or update it when the match fields find one (APIv4 save)',
			action: 'Create or update a record in any entity',
		},
		{ name: 'Delete', value: 'delete', description: 'Delete records by ID or filters', action: 'Delete records in any entity' },
		{ name: 'Get Many', value: 'get', description: 'Get records with fields, filters and sort', action: 'Get many records from any entity' },
		{
			name: 'Other Action',
			value: 'other',
			description: 'Run any other action the entity offers, e.g. Get Duplicates',
			action: 'Run another action on any entity',
		},
		{ name: 'Update', value: 'update', description: 'Update records matched on chosen fields', action: 'Update records in any entity' },
	],
};

const FILTER_OPERATORS = [
	'=', '!=', '>', '>=', '<', '<=', 'LIKE', 'NOT LIKE', 'CONTAINS', 'NOT CONTAINS', 'IN', 'NOT IN',
	'BETWEEN', 'NOT BETWEEN', 'IS NULL', 'IS NOT NULL', 'IS EMPTY', 'IS NOT EMPTY', 'REGEXP',
].map((op) => ({ name: op, value: op }));

const filterCollection = (actions: string[]): INodeProperties => ({
	displayName: 'Filters',
	name: 'anyFilters',
	type: 'fixedCollection',
	typeOptions: { multipleValues: true },
	placeholder: 'Add Filter',
	default: {},
	displayOptions: show(actions),
	options: [
		{
			name: 'filter',
			displayName: 'Filter',
			values: [
				{
					displayName: 'Field Name or ID',
					name: 'field',
					type: 'options',
					typeOptions: { loadOptionsMethod: 'getAnyEntityFields', loadOptionsDependsOn: ['anyEntity'] },
					default: '',
					description:
						'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
				},
				{
					displayName: 'Operator',
					name: 'operator',
					type: 'options',
					options: FILTER_OPERATORS,
					default: '=',
				},
				{
					displayName: 'Value',
					name: 'value',
					type: 'string',
					default: '',
					description:
						'For IN / BETWEEN use a JSON array or comma-separated values. Ignored for IS NULL / IS EMPTY operators.',
				},
			],
		},
	],
});

const mapper = (action: string, mode: 'add' | 'update' | 'upsert'): INodeProperties => ({
	displayName: 'Values',
	name: 'anyValues',
	type: 'resourceMapper',
	noDataExpression: true,
	default: { mappingMode: 'defineBelow', value: null },
	required: true,
	displayOptions: show([action]),
	typeOptions: {
		loadOptionsDependsOn: ['anyEntity', 'operation'],
		resourceMapper: {
			resourceMapperMethod: 'getAnyEntityMappingColumns',
			mode,
			fieldWords: { singular: 'field', plural: 'fields' },
			addAllFields: false,
			multiKeyMatch: mode === 'upsert',
			supportAutoMap: true,
			matchingFieldsLabels:
				mode === 'add'
					? undefined
					: {
							title: 'Fields to Match On',
							description: 'Records whose values in these fields match are updated',
							hint: 'Usually "id"',
						},
		},
	},
});

export const anyEntityProperties: INodeProperties[] = [
	{
		displayName: 'Show Advanced Entities and Actions',
		name: 'anyShowAdvanced',
		type: 'boolean',
		default: false,
		displayOptions: show(),
		description:
			'Whether to also list administrative entities (System, Setting, ...) and actions that can change or remove data in bulk (replace, revert, mergeDuplicates, ...)',
	},
	{
		displayName: 'Entity Name or ID',
		name: 'anyEntity',
		type: 'options',
		typeOptions: { loadOptionsMethod: 'getAnyEntities', loadOptionsDependsOn: ['anyShowAdvanced'] },
		default: '',
		required: true,
		displayOptions: show(),
		description:
			'CiviCRM entity, discovered from the connected site. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
	},
	{
		displayName: 'Action Name or ID',
		name: 'anyAction',
		type: 'options',
		typeOptions: { loadOptionsMethod: 'getAnyEntityActions', loadOptionsDependsOn: ['anyEntity', 'anyShowAdvanced'] },
		default: '',
		required: true,
		displayOptions: show(['other']),
		description:
			'Other action supported by the entity for this credential. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
	},

	// get
	{
		displayName: 'Field Names or IDs to Return',
		name: 'anySelect',
		type: 'multiOptions',
		typeOptions: { loadOptionsMethod: 'getAnyEntityFields', loadOptionsDependsOn: ['anyEntity'] },
		default: [],
		displayOptions: show(['get']),
		description:
			'Leave empty to return all core fields. Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
	},
	filterCollection(['get']),
	{
		displayName: 'Sort',
		name: 'anySort',
		type: 'fixedCollection',
		typeOptions: { multipleValues: true },
		placeholder: 'Add Sort Field',
		default: {},
		displayOptions: show(['get']),
		options: [
			{
				name: 'sort',
				displayName: 'Sort',
				values: [
					{
						displayName: 'Field Name or ID',
						name: 'field',
						type: 'options',
						typeOptions: { loadOptionsMethod: 'getAnyEntityFields', loadOptionsDependsOn: ['anyEntity'] },
						default: '',
						description:
							'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
					},
					{
						displayName: 'Direction',
						name: 'direction',
						type: 'options',
						options: [
							{ name: 'Ascending', value: 'ASC' },
							{ name: 'Descending', value: 'DESC' },
						],
						default: 'ASC',
					},
				],
			},
		],
	},
	{
		displayName: 'Return All',
		name: 'anyReturnAll',
		type: 'boolean',
		default: false,
		displayOptions: show(['get']),
		description: 'Whether to return all results or only up to a given limit',
	},
	{
		displayName: 'Limit',
		name: 'anyLimit',
		type: 'number',
		typeOptions: { minValue: 1 },
		default: 50,
		displayOptions: { show: { resource: ['anyEntity'], operation: ['get'], anyReturnAll: [false] } },
		description: 'Max number of results to return',
	},

	// create / update / save
	mapper('create', 'add'),
	mapper('update', 'update'),
	mapper('save', 'upsert'),

	// delete
	{
		displayName: 'Record ID',
		name: 'anyDeleteId',
		type: 'number',
		default: 0,
		displayOptions: show(['delete']),
		description: 'ID of the record to delete. Leave 0 to delete the records matching the Filters instead.',
	},
	filterCollection(['delete']),

	// shared options for get / delete
	{
		displayName: 'Options',
		name: 'anyOptions',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: show(['get', 'delete']),
		options: [
			{
				displayName: 'Where (JSON)',
				name: 'whereJson',
				type: 'json',
				default: '[]',
				description:
					'Extra APIv4 where clauses as a JSON array of [field, operator, value] triples, combined with the Filters above',
			},
		],
	},

	// every other action
	{
		displayName: 'Params (JSON)',
		name: 'anyParamsJson',
		type: 'json',
		default: '{}',
		displayOptions: show(['other']),
		description: 'APIv4 params for this action, passed as-is (for example {"values": {...}} or {"where": [...]})',
	},
];
