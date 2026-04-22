import type {
	IExecuteFunctions,
	ILoadOptionsFunctions,
	INodeExecutionData,
	INodePropertyOptions,
	INodeType,
	INodeTypeDescription,
	IDataObject,
} from 'n8n-workflow';
import { NodeConnectionTypes } from 'n8n-workflow';

import { civicrmApiRequest } from '../transport/GenericFunctions';
import { resourceProp, operationProp } from './descriptions/resources';
import { genericFields, upsertFields } from './descriptions/generic';

/* ============================================================================
   RESOURCES
============================================================================ */

type Resource =
	| 'contact'
	| 'membership'
	| 'group'
	| 'relationship'
	| 'activity'
	| 'customApi';

type Operation = 'get' | 'getMany' | 'create' | 'update' | 'delete';

const ENTITY_MAP: Record<Exclude<Resource, 'customApi'>, string> = {
	contact: 'Contact',
	membership: 'Membership',
	group: 'Group',
	relationship: 'Relationship',
	activity: 'Activity',
};

/* ============================================================================
   LOCATION TYPE CACHE
============================================================================ */

const locationTypeCache: Record<string, Record<string, string>> = {};

function normalizeLocationKey(s: string): string {
	return String(s || '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '');
}

async function getLocationTypeMap(this: IExecuteFunctions): Promise<Record<string, string>> {
	const credentials = await this.getCredentials('civiCrmApi');
	const baseUrl = String(credentials?.baseUrl || 'default');

	if (locationTypeCache[baseUrl]) return locationTypeCache[baseUrl];

	const res = await civicrmApiRequest.call(this, 'POST', '/civicrm/ajax/api4/OptionValue/get', {
		where: [['option_group_id:name', '=', 'location_type']],
		select: ['name', 'label'],
		limit: 0,
	});

	const map: Record<string, string> = {};
	const values = (res?.values || []) as Array<{ name?: string; label?: string }>;

	for (const v of values) {
		const name = v.name || '';
		const label = v.label || '';
		const k1 = normalizeLocationKey(name);
		const k2 = normalizeLocationKey(label);
		if (k1) map[k1] = name;
		if (k2) map[k2] = name;
	}

	locationTypeCache[baseUrl] = map;
	return map;
}

/* ============================================================================
   NODE DEFINITION
============================================================================ */

export class CiviCrm implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'CiviCRM',
		name: 'civiCrm',
		icon: 'file:civicrm.svg',
		group: ['transform'],
		version: 1,
		description:
			'Interact with CiviCRM API v4 (Civi-Go compatible).\n\n' +
			'Supports Contact, Membership, Group, Relationship, Activity entities, and Custom API Call.\n' +
			'Includes dynamic mapping of email, phone, address and location types.\n' +
			'Includes birth_date validation and JSON filters for GET MANY.\n',
		defaults: { name: 'CiviCRM' },
		subtitle: '={{{"get":"Get","getMany":"Get Many","create":"Create","update":"Update","delete":"Delete"}[$parameter["operation"]] + ": " + {"contact":"Contact","membership":"Membership","group":"Group","relationship":"Relationship","activity":"Activity","customApi":"Custom API Call"}[$parameter["resource"]]}}',
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],

		// @ts-ignore
		usableAsTool: true,
		// @ts-ignore
		actions: [
			{
				displayName: 'Get Contact',
				name: 'getContact',
				action: 'Get a contact',
				description: 'Retrieve a contact from CiviCRM by ID or email.',
				displayOptions: { show: { resource: ['contact'], operation: ['get'] } },
				properties: [
					{
						displayName: 'ID',
						name: 'id',
						type: 'number',
						default: 0,
						description: 'The internal CiviCRM ID of the contact to retrieve.',
					},
				],
			},
			{
				displayName: 'Get Many Contacts',
				name: 'getManyContacts',
				action: 'Get many contacts',
				description: 'Retrieve multiple contacts from CiviCRM with filtering.',
				displayOptions: { show: { resource: ['contact'], operation: ['getMany'] } },
				properties: [...genericFields],
			},
			{
				displayName: 'Create Contact',
				name: 'createContact',
				action: 'Create a contact',
				description: 'Create a new contact in CiviCRM.',
				displayOptions: { show: { resource: ['contact'], operation: ['create'] } },
				properties: [...upsertFields],
			},
			{
				displayName: 'Update Contact',
				name: 'updateContact',
				action: 'Update a contact',
				description: 'Update an existing contact in CiviCRM.',
				displayOptions: { show: { resource: ['contact'], operation: ['update'] } },
				properties: [
					{
						displayName: 'ID',
						name: 'id',
						type: 'number',
						default: 0,
						description: 'The ID of the contact to update.',
					},
					...upsertFields,
				],
			},
			{
				displayName: 'Delete Contact',
				name: 'deleteContact',
				action: 'Delete a contact',
				description: 'Delete a contact from CiviCRM.',
				displayOptions: { show: { resource: ['contact'], operation: ['delete'] } },
				properties: [
					{
						displayName: 'ID',
						name: 'id',
						type: 'number',
						default: 0,
						description: 'The ID of the contact to delete.',
					},
				],
			},

			// ======================================================================
			// MEMBERSHIP
			// ======================================================================
			{
				displayName: 'Get Membership',
				name: 'getMembership',
				action: 'Get a membership',
				description: 'Retrieve a membership by ID.',
				displayOptions: { show: { resource: ['membership'], operation: ['get'] } },
				properties: [
					{
						displayName: 'ID',
						name: 'id',
						type: 'number',
						default: 0,
						description: 'The internal CiviCRM ID of the membership.',
					},
				],
			},
			{
				displayName: 'Get Many Memberships',
				name: 'getManyMemberships',
				action: 'Get many memberships',
				description: 'Retrieve multiple memberships.',
				displayOptions: { show: { resource: ['membership'], operation: ['getMany'] } },
				properties: [...genericFields],
			},
			{
				displayName: 'Create Membership',
				name: 'createMembership',
				action: 'Create a membership',
				description: 'Create a new membership.',
				displayOptions: { show: { resource: ['membership'], operation: ['create'] } },
				properties: [...upsertFields],
			},
			{
				displayName: 'Update Membership',
				name: 'updateMembership',
				action: 'Update a membership',
				description: 'Update an existing membership.',
				displayOptions: { show: { resource: ['membership'], operation: ['update'] } },
				properties: [
					{
						displayName: 'ID',
						name: 'id',
						type: 'number',
						default: 0,
						description: 'The ID of the membership to update.',
					},
					...upsertFields,
				],
			},
			{
				displayName: 'Delete Membership',
				name: 'deleteMembership',
				action: 'Delete a membership',
				description: 'Delete a membership.',
				displayOptions: { show: { resource: ['membership'], operation: ['delete'] } },
				properties: [
					{
						displayName: 'ID',
						name: 'id',
						type: 'number',
						default: 0,
						description: 'The ID of the membership to delete.',
					},
				],
			},

			// ======================================================================
			// GROUP
			// ======================================================================
			{
				displayName: 'Get Group',
				name: 'getGroup',
				action: 'Get a group',
				description: 'Retrieve a group by ID.',
				displayOptions: { show: { resource: ['group'], operation: ['get'] } },
				properties: [
					{
						displayName: 'ID',
						name: 'id',
						type: 'number',
						default: 0,
						description: 'The internal CiviCRM ID of the group.',
					},
				],
			},
			{
				displayName: 'Get Many Groups',
				name: 'getManyGroups',
				action: 'Get many groups',
				description: 'Retrieve multiple groups.',
				displayOptions: { show: { resource: ['group'], operation: ['getMany'] } },
				properties: [...genericFields],
			},
			{
				displayName: 'Create Group',
				name: 'createGroup',
				action: 'Create a group',
				description: 'Create a new group.',
				displayOptions: { show: { resource: ['group'], operation: ['create'] } },
				properties: [...upsertFields],
			},
			{
				displayName: 'Update Group',
				name: 'updateGroup',
				action: 'Update a group',
				description: 'Update an existing group.',
				displayOptions: { show: { resource: ['group'], operation: ['update'] } },
				properties: [
					{
						displayName: 'ID',
						name: 'id',
						type: 'number',
						default: 0,
						description: 'The ID of the group to update.',
					},
					...upsertFields,
				],
			},
			{
				displayName: 'Delete Group',
				name: 'deleteGroup',
				action: 'Delete a group',
				description: 'Delete a group.',
				displayOptions: { show: { resource: ['group'], operation: ['delete'] } },
				properties: [
					{
						displayName: 'ID',
						name: 'id',
						type: 'number',
						default: 0,
						description: 'The ID of the group to delete.',
					},
				],
			},

			// ======================================================================
			// RELATIONSHIP
			// ======================================================================
			{
				displayName: 'Get Relationship',
				name: 'getRelationship',
				action: 'Get a relationship',
				description: 'Retrieve a relationship by ID.',
				displayOptions: { show: { resource: ['relationship'], operation: ['get'] } },
				properties: [
					{
						displayName: 'ID',
						name: 'id',
						type: 'number',
						default: 0,
						description: 'The internal CiviCRM ID of the relationship.',
					},
				],
			},
			{
				displayName: 'Get Many Relationships',
				name: 'getManyRelationships',
				action: 'Get many relationships',
				description: 'Retrieve multiple relationships.',
				displayOptions: { show: { resource: ['relationship'], operation: ['getMany'] } },
				properties: [...genericFields],
			},
			{
				displayName: 'Create Relationship',
				name: 'createRelationship',
				action: 'Create a relationship',
				description: 'Create a new relationship.',
				displayOptions: { show: { resource: ['relationship'], operation: ['create'] } },
				properties: [...upsertFields],
			},
			{
				displayName: 'Update Relationship',
				name: 'updateRelationship',
				action: 'Update a relationship',
				description: 'Update an existing relationship.',
				displayOptions: { show: { resource: ['relationship'], operation: ['update'] } },
				properties: [
					{
						displayName: 'ID',
						name: 'id',
						type: 'number',
						default: 0,
						description: 'The ID of the relationship to update.',
					},
					...upsertFields,
				],
			},
			{
				displayName: 'Delete Relationship',
				name: 'deleteRelationship',
				action: 'Delete a relationship',
				description: 'Delete a relationship.',
				displayOptions: { show: { resource: ['relationship'], operation: ['delete'] } },
				properties: [
					{
						displayName: 'ID',
						name: 'id',
						type: 'number',
						default: 0,
						description: 'The ID of the relationship to delete.',
					},
				],
			},

			// ======================================================================
			// ACTIVITY
			// ======================================================================
			{
				displayName: 'Get Activity',
				name: 'getActivity',
				action: 'Get an activity',
				description: 'Retrieve an activity by ID.',
				displayOptions: { show: { resource: ['activity'], operation: ['get'] } },
				properties: [
					{
						displayName: 'ID',
						name: 'id',
						type: 'number',
						default: 0,
						description: 'The internal CiviCRM ID of the activity.',
					},
				],
			},
			{
				displayName: 'Get Many Activities',
				name: 'getManyActivities',
				action: 'Get many activities',
				description: 'Retrieve multiple activities.',
				displayOptions: { show: { resource: ['activity'], operation: ['getMany'] } },
				properties: [...genericFields],
			},
			{
				displayName: 'Create Activity',
				name: 'createActivity',
				action: 'Create an activity',
				description: 'Create a new activity.',
				displayOptions: { show: { resource: ['activity'], operation: ['create'] } },
				properties: [...upsertFields],
			},
			{
				displayName: 'Update Activity',
				name: 'updateActivity',
				action: 'Update an activity',
				description: 'Update an existing activity.',
				displayOptions: { show: { resource: ['activity'], operation: ['update'] } },
				properties: [
					{
						displayName: 'ID',
						name: 'id',
						type: 'number',
						default: 0,
						description: 'The ID of the activity to update.',
					},
					...upsertFields,
				],
			},
			{
				displayName: 'Delete Activity',
				name: 'deleteActivity',
				action: 'Delete an activity',
				description: 'Delete an activity.',
				displayOptions: { show: { resource: ['activity'], operation: ['delete'] } },
				properties: [
					{
						displayName: 'ID',
						name: 'id',
						type: 'number',
						default: 0,
						description: 'The ID of the activity to delete.',
					},
				],
			},
		],
		credentials: [{ name: 'civiCrmApi', required: true }],

		properties: [
			//
			// RESOURCE + OPERATION
			//
			resourceProp,
			operationProp,

			//
			// CONTACT TYPE
			//
			{
				displayName: 'Contact Type',
				name: 'contactType',
				type: 'options',
				default: 'Individual',
				description: 'Type of contact to create or search for.',
				options: [
					{ name: 'Individual', value: 'Individual' },
					{ name: 'Organization', value: 'Organization' },
					{ name: 'Household', value: 'Household' },
				],
				displayOptions: { show: { resource: ['contact'] } },
			},

			//
			// LOCATION TYPES
			//
			{
				displayName: 'Email Location Type',
				name: 'emailLocation',
				type: 'options',
				default: 'Work',
				description: 'Location type for the email address.',
				options: [
					{ name: 'Home', value: 'Home' },
					{ name: 'Work', value: 'Work' },
					{ name: 'Other', value: 'Other' },
				],
				displayOptions: { show: { resource: ['contact'], operation: ['create', 'update'] } },
			},
			{
				displayName: 'Mark Email as Primary',
				name: 'isPrimaryEmail',
				type: 'boolean',
				default: true,
				description: 'Whether this email should be the primary email for the contact.',
				displayOptions: { show: { resource: ['contact'], operation: ['create', 'update'] } },
			},
			{
				displayName: 'Phone Location Type',
				name: 'phoneLocation',
				type: 'options',
				default: 'Work',
				description: 'Location type for the phone number.',
				options: [
					{ name: 'Home', value: 'Home' },
					{ name: 'Work', value: 'Work' },
					{ name: 'Mobile', value: 'Mobile' },
					{ name: 'Other', value: 'Other' },
				],
				displayOptions: { show: { resource: ['contact'], operation: ['create', 'update'] } },
			},
			{
				displayName: 'Mark Phone as Primary',
				name: 'isPrimaryPhone',
				type: 'boolean',
				default: true,
				description: 'Whether this phone should be the primary phone for the contact.',
				displayOptions: { show: { resource: ['contact'], operation: ['create', 'update'] } },
			},
			{
				displayName: 'Address Location Type',
				name: 'addressLocation',
				type: 'options',
				default: 'Home',
				description: 'Location type for the address.',
				options: [
					{ name: 'Home', value: 'Home' },
					{ name: 'Work', value: 'Work' },
					{ name: 'Billing', value: 'Billing' },
					{ name: 'Other', value: 'Other' },
				],
				displayOptions: { show: { resource: ['contact'], operation: ['create', 'update'] } },
			},
			{
				displayName: 'Mark Address as Primary',
				name: 'isPrimaryAddress',
				type: 'boolean',
				default: true,
				description: 'Whether this address should be the primary address for the contact.',
				displayOptions: { show: { resource: ['contact'], operation: ['create', 'update'] } },
			},

			//
			// ID for GET / UPDATE / DELETE
			//
			{
				displayName: 'ID',
				name: 'id',
				type: 'number',
				default: 0,
				required: true,
				description: 'The internal CiviCRM ID of the entity.',
				displayOptions: {
					show: {
						operation: ['get', 'update', 'delete'],
						resource: ['contact', 'membership', 'group', 'relationship', 'activity'],
					},
				},
			},

			//
			// CUSTOM API CALL
			//
			{
				displayName: 'Entity',
				name: 'customEntity',
				type: 'string',
				default: 'Contact',
				required: true,
				description:
					'CiviCRM API4 entity, for example Contact, Membership, Group, Activity, CustomValue, etc.',
				displayOptions: { show: { resource: ['customApi'] } },
			},
			{
				displayName: 'Action',
				name: 'customAction',
				type: 'string',
				default: 'get',
				required: true,
				description:
					'CiviCRM API4 action, for example get, getFields, create, update, delete, getOne, etc.',
				displayOptions: { show: { resource: ['customApi'] } },
			},
			{
				displayName: 'Params (JSON)',
				name: 'customParamsJson',
				type: 'string',
				typeOptions: {
					rows: 4,
				},
				default: '{\n  "limit": 25\n}',
				description:
					'Raw API4 params JSON passed as-is to CiviCRM. It must be a valid JSON object (no trailing commas).',
				displayOptions: { show: { resource: ['customApi'] } },
			},

			//
			// DYNAMIC FIELDS
			//
			...genericFields,
			...upsertFields,
		],
	};

	/* ============================================================================
	   LOAD OPTIONS (required by n8n verification)
	============================================================================ */

	methods = {
		loadOptions: {
			async loadOptionValues(this: ILoadOptionsFunctions) {
				const { baseUrl } = (await this.getCredentials('civiCrmApi')) as {
					baseUrl: string;
					apiToken: string;
				};

				const res = await this.helpers.httpRequestWithAuthentication.call(this, 'civiCrmApi', {
					method: 'POST',
					url: `${(baseUrl as string).replace(/\/$/, '')}/civicrm/ajax/api4/OptionValue/get`,
					headers: {
						'Content-Type': 'application/x-www-form-urlencoded',
					},
					body: { params: JSON.stringify({ limit: 50, select: ['id', 'label'] }) },
					json: true,
				});

				const values = (res?.values || []) as Array<{ id: number; label: string }>;

				return values.map((v) => ({
					name: v.label,
					value: v.id,
				}));
			},
		},
	};

	/* ============================================================================
	   EXECUTE
	============================================================================ */

	async execute(this: IExecuteFunctions) {
		const items = this.getInputData();
		const out: INodeExecutionData[] = [];

		const resource = this.getNodeParameter('resource', 0) as Resource;
		const operation = this.getNodeParameter('operation', 0) as Operation;

		const entity = resource !== 'customApi' ? ENTITY_MAP[resource] : '';

		for (let i = 0; i < items.length; i++) {
			try {
			// Custom API call: generic passthrough to any API4 entity/action
			if (resource === 'customApi') {
				const customEntity = this.getNodeParameter('customEntity', i) as string;
				const action = this.getNodeParameter('customAction', i) as string;
				const paramsJson = this.getNodeParameter('customParamsJson', i, '') as string;

				let params: Record<string, unknown> = {};
				if (paramsJson) {
					try {
						params = JSON.parse(paramsJson);
					} catch (error) {
						throw new Error('Invalid JSON in "Params (JSON)"');
					}
				}

				const res = await civicrmApiRequest.call(
					this,
					'POST',
					`/civicrm/ajax/api4/${customEntity}/${action}`,
					params,
				);

				// Return the raw API4 response so advanced users can work with values and metadata
				out.push({
					json: res as IDataObject,
					pairedItem: { item: i },
				});
				continue;
			}

			const emailLocationParam = this.getNodeParameter('emailLocation', i, 'Work') as string;
			const phoneLocationParam = this.getNodeParameter('phoneLocation', i, 'Work') as string;
			const addressLocationParam = this.getNodeParameter('addressLocation', i, 'Home') as string;
			const isPrimaryEmail = this.getNodeParameter('isPrimaryEmail', i, true) as boolean;
			const isPrimaryPhone = this.getNodeParameter('isPrimaryPhone', i, true) as boolean;
			const isPrimaryAddress = this.getNodeParameter('isPrimaryAddress', i, true) as boolean;

			let emailLocationName = emailLocationParam;
			let phoneLocationName = phoneLocationParam;
			let addressLocationName = addressLocationParam;

			/* ======================================================
			   GET
			====================================================== */
			if (operation === 'get') {
				const id = this.getNodeParameter('id', i) as number;

				const params =
					resource === 'contact'
						? {
							where: [['id', '=', id]],
							limit: 1,
							select: [
								'id',
								'display_name',
								'first_name',
								'last_name',
								'organization_name',
								'legal_name',
								'contact_type',
								'gender_id',
								'gender_id:name',
								'birth_date',
							],
							chain: {
								emails: ['Email', 'get', { where: [['contact_id', '=', '$id']] }],
								phones: ['Phone', 'get', { where: [['contact_id', '=', '$id']] }],
								addresses: ['Address', 'get', { where: [['contact_id', '=', '$id']] }],
							},
						}
						: {
							where: [['id', '=', id]],
							limit: 1,
							select: ['id', 'name', 'title', 'subject', 'display_name'],
						};

				const res = await civicrmApiRequest.call(
					this,
					'POST',
					`/civicrm/ajax/api4/${entity}/get`,
					params,
				);

				out.push({
					json: res?.values?.[0] ?? {},
					pairedItem: { item: i },
				});
				continue;
			}

			/* ======================================================
			   GET MANY
			====================================================== */
			if (operation === 'getMany') {
				const limit = this.getNodeParameter('limit', i, 100) as number;
				const returnAll = this.getNodeParameter('returnAll', i, false) as boolean;
				const whereJson = this.getNodeParameter('whereJson', i, '') as string;

				let where: any[] = [];
				if (whereJson) {
					try {
						where = JSON.parse(whereJson);
					} catch (error) {
						throw new Error('Invalid JSON in whereJson');
					}
				}

				if (resource === 'contact') {
					const contactType = this.getNodeParameter('contactType', i, '') as string;
					if (contactType) where.push(['contact_type', '=', contactType]);
				}

				const params =
					resource === 'contact'
						? {
							where,
							select: [
								'id',
								'display_name',
								'first_name',
								'last_name',
								'organization_name',
								'legal_name',
								'contact_type',
								'gender_id',
								'gender_id:name',
								'birth_date',
							],
							chain: {
								emails: ['Email', 'get', { where: [['contact_id', '=', '$id']] }],
								phones: ['Phone', 'get', { where: [['contact_id', '=', '$id']] }],
								addresses: ['Address', 'get', { where: [['contact_id', '=', '$id']] }],
							},
						}
						: {
							where,
							select: ['id', 'name', 'title', 'subject', 'display_name'],
						};

				if (returnAll) {
					let offset = 0;
					const page = 500;
					let hasMore = true;

					while (hasMore) {
						const r = await civicrmApiRequest.call(
							this,
							'POST',
							`/civicrm/ajax/api4/${entity}/get`,
							{ ...params, limit: page, offset },
						);

						const vals = r?.values ?? [];
						for (const v of vals) {
							out.push({
								json: v,
								pairedItem: { item: i },
							});
						}

						if (vals.length < page) {
							hasMore = false;
						} else {
							offset += page;
						}
					}
				} else {
					const r = await civicrmApiRequest.call(
						this,
						'POST',
						`/civicrm/ajax/api4/${entity}/get`,
						{ ...params, limit },
					);

					const vals = r?.values ?? [];
					for (const v of vals) {
						out.push({
							json: v,
							pairedItem: { item: i },
						});
					}
				}

				continue;
			}

			/* ======================================================
			   DELETE
			====================================================== */
			if (operation === 'delete') {
				const id = this.getNodeParameter('id', i) as number;

				const r = await civicrmApiRequest.call(
					this,
					'POST',
					`/civicrm/ajax/api4/${entity}/delete`,
					{
						where: [['id', '=', id]],
					},
				);

				out.push({
					json: {
						success: true,
						message: `${entity} ${id} deleted`,
						deleted_id: id,
						api_response: r,
					},
					pairedItem: { item: i },
				});

				continue;
			}

			/* ======================================================
			   CREATE / UPDATE
			====================================================== */

			const isCreate = operation === 'create';
			const id = !isCreate ? (this.getNodeParameter('id', i) as number) : undefined;

			const pairs = this.getNodeParameter('fields.field', i, []) as Array<{
				fieldName: string;
				fieldValue: string;
			}>;

			const values: Record<string, unknown> = {};
			const emailData: Record<string, unknown> = {};
			const phoneData: Record<string, unknown> = {};
			const addressData: Record<string, unknown> = {};

			let locationTypeMap: Record<string, string> = {};
			if (resource === 'contact') {
				locationTypeMap = await getLocationTypeMap.call(this);
			}

			for (const p of pairs) {
				if (!p.fieldName) continue;

				const key = p.fieldName.trim();
				const rawVal = convertValue(p.fieldValue);
				const val = rawVal;

				/* Email simple */
				if (key === 'email') {
					if (val !== '' && val !== null && val !== undefined) {
						emailData.email = val;
					}
					continue;
				}
				if (key.startsWith('email.')) {
					if (val !== '' && val !== null && val !== undefined) {
						emailData[key.replace(/^email\./, '')] = val;
					}
					continue;
				}

				/* Phone simple */
				if (key === 'phone') {
					if (val !== '' && val !== null && val !== undefined) {
						phoneData.phone = val;
					}
					continue;
				}
				if (key.startsWith('phone.')) {
					if (val !== '' && val !== null && val !== undefined) {
						phoneData[key.replace(/^phone\./, '')] = val;
					}
					continue;
				}

				/* Address */
				if (key.startsWith('address.')) {
					if (val !== '' && val !== null && val !== undefined) {
						addressData[key.replace(/^address\./, '')] = val;
					}
					continue;
				}

				/* Dynamic prefix: resolve location type from field name */
				const segments = key.split('.');
				if (segments.length >= 2 && resource === 'contact') {
					const prefixRaw = segments[0];
					const root = segments[1];
					const subfield = segments.slice(2).join('.') || '';

					const normalizedPrefix = normalizeLocationKey(prefixRaw);
					const mappedLocationName = locationTypeMap[normalizedPrefix];

					if (root === 'email' || root === 'phone' || root === 'address') {
						if (mappedLocationName) {
							if (root === 'email') emailLocationName = mappedLocationName;
							if (root === 'phone') phoneLocationName = mappedLocationName;
							if (root === 'address') addressLocationName = mappedLocationName;
						}

						if (root === 'email') {
							if (val !== '' && val !== null && val !== undefined) {
								if (!subfield) emailData.email = val;
								else emailData[subfield] = val;
							}
							continue;
						}

						if (root === 'phone') {
							if (val !== '' && val !== null && val !== undefined) {
								if (!subfield) phoneData.phone = val;
								else phoneData[subfield] = val;
							}
							continue;
						}

						if (root === 'address') {
							if (val !== '' && val !== null && val !== undefined) {
								if (subfield) addressData[subfield] = val;
							}
							continue;
						}
					}
				}

				/* gender */
				if (key === 'gender' || key === 'gender_id') {
					if (val !== '' && val !== null && val !== undefined) {
						values.gender_id = val;
					}
					continue;
				}

				/* birth_date */
				if (key === 'birth_date' || key === 'birth') {
					if (val !== '' && val !== null && val !== undefined) {
						values.birth_date = normalizeBirthDate(String(val));
					}
					continue;
				}

				/* default */
				if (val !== '' && val !== null && val !== undefined) {
					values[key] = val;
				}
			}

			/* Contact type */
			const contactType = this.getNodeParameter('contactType', i, '') as string;
			if (resource === 'contact' && contactType) {
				values.contact_type = contactType;
			}

			/* CREATE/UPDATE contact */
			let contactId = id;
			if (isCreate) {
				const r = await civicrmApiRequest.call(
					this,
					'POST',
					'/civicrm/ajax/api4/Contact/create',
					{ values },
				);
				contactId = r?.values?.[0]?.id;
				if (!contactId) throw new Error('Failed to create contact.');
			} else {
				await civicrmApiRequest.call(
					this,
					'POST',
					`/civicrm/ajax/api4/${entity}/update`,
					{
						values,
						where: [['id', '=', contactId]],
					},
				);
			}

			/* SUBENTITIES */
			if (resource === 'contact') {
				if (isCreate && isPrimaryEmail) {
					await civicrmApiRequest.call(this, 'POST', '/civicrm/ajax/api4/Email/delete', {
						where: [
							['contact_id', '=', contactId],
							['is_primary', '=', true],
						],
					});
				}
				if (isCreate && isPrimaryPhone) {
					await civicrmApiRequest.call(this, 'POST', '/civicrm/ajax/api4/Phone/delete', {
						where: [
							['contact_id', '=', contactId],
							['is_primary', '=', true],
						],
					});
				}
				if (isCreate && isPrimaryAddress) {
					await civicrmApiRequest.call(this, 'POST', '/civicrm/ajax/api4/Address/delete', {
						where: [
							['contact_id', '=', contactId],
							['is_primary', '=', true],
						],
					});
				}

				if (Object.keys(emailData).length) {
					if (isCreate) {
						await civicrmApiRequest.call(this, 'POST', '/civicrm/ajax/api4/Email/create', {
							values: {
								...emailData,
								contact_id: contactId,
								is_primary: isPrimaryEmail,
								'location_type_id:name': emailLocationName,
							},
						});
					} else {
						const existingEmail = await civicrmApiRequest.call(this, 'POST', '/civicrm/ajax/api4/Email/get', {
							where: [
								['contact_id', '=', contactId],
								['location_type_id:name', '=', emailLocationName],
							],
							limit: 1,
							select: ['id'],
						});
						const existingEmailId = existingEmail?.values?.[0]?.id as number | undefined;
						if (existingEmailId) {
							await civicrmApiRequest.call(this, 'POST', '/civicrm/ajax/api4/Email/update', {
								values: {
									id: existingEmailId,
									...emailData,
									contact_id: contactId,
									is_primary: isPrimaryEmail,
								},
							});
						} else {
							await civicrmApiRequest.call(this, 'POST', '/civicrm/ajax/api4/Email/create', {
								values: {
									...emailData,
									contact_id: contactId,
									is_primary: isPrimaryEmail,
									'location_type_id:name': emailLocationName,
								},
							});
						}
					}
				}

				if (Object.keys(phoneData).length) {
					if (isCreate) {
						await civicrmApiRequest.call(this, 'POST', '/civicrm/ajax/api4/Phone/create', {
							values: {
								...phoneData,
								contact_id: contactId,
								is_primary: isPrimaryPhone,
								'location_type_id:name': phoneLocationName,
							},
						});
					} else {
						const existingPhone = await civicrmApiRequest.call(this, 'POST', '/civicrm/ajax/api4/Phone/get', {
							where: [
								['contact_id', '=', contactId],
								['location_type_id:name', '=', phoneLocationName],
							],
							limit: 1,
							select: ['id'],
						});
						const existingPhoneId = existingPhone?.values?.[0]?.id as number | undefined;
						if (existingPhoneId) {
							await civicrmApiRequest.call(this, 'POST', '/civicrm/ajax/api4/Phone/update', {
								values: {
									id: existingPhoneId,
									...phoneData,
									contact_id: contactId,
									is_primary: isPrimaryPhone,
								},
							});
						} else {
							await civicrmApiRequest.call(this, 'POST', '/civicrm/ajax/api4/Phone/create', {
								values: {
									...phoneData,
									contact_id: contactId,
									is_primary: isPrimaryPhone,
									'location_type_id:name': phoneLocationName,
								},
							});
						}
					}
				}


				if (Object.keys(addressData).length) {
					if (isCreate) {
						await civicrmApiRequest.call(this, 'POST', '/civicrm/ajax/api4/Address/create', {
							values: {
								...addressData,
								contact_id: contactId,
								is_primary: isPrimaryAddress,
								'location_type_id:name': addressLocationName,
							},
						});
					} else {
						const existingAddress = await civicrmApiRequest.call(this, 'POST', '/civicrm/ajax/api4/Address/get', {
							where: [
								['contact_id', '=', contactId],
								['location_type_id:name', '=', addressLocationName],
							],
							limit: 1,
							select: ['id'],
						});
						const existingAddressId = existingAddress?.values?.[0]?.id as number | undefined;
						if (existingAddressId) {
							await civicrmApiRequest.call(this, 'POST', '/civicrm/ajax/api4/Address/update', {
								values: {
									id: existingAddressId,
									...addressData,
									contact_id: contactId,
									is_primary: isPrimaryAddress,
								},
							});
						} else {
							await civicrmApiRequest.call(this, 'POST', '/civicrm/ajax/api4/Address/create', {
								values: {
									...addressData,
									contact_id: contactId,
									is_primary: isPrimaryAddress,
									'location_type_id:name': addressLocationName,
								},
							});
						}
					}
				}
			}

			/* FINAL GET */
			const res = await civicrmApiRequest.call(
				this,
				'POST',
				`/civicrm/ajax/api4/${entity}/get`,
				{
					where: [['id', '=', contactId]],
					select: [
						'id',
						'display_name',
						'first_name',
						'last_name',
						'organization_name',
						'legal_name',
						'contact_type',
						'gender_id',
						'gender_id:name',
						'birth_date',
					],
					...(resource === 'contact'
						? {
							chain: {
								emails: ['Email', 'get', { where: [['contact_id', '=', '$id']] }],
								phones: ['Phone', 'get', { where: [['contact_id', '=', '$id']] }],
								addresses: ['Address', 'get', { where: [['contact_id', '=', '$id']] }],
							},
						}
						: {}),
				},
			);

			out.push({
				json: res?.values?.[0] ?? {},
				pairedItem: { item: i },
			});
			} catch (error) {
				if (this.continueOnFail()) {
					out.push({ json: { error: error instanceof Error ? error.message : String(error) }, pairedItem: { item: i } });
					continue;
				}
				throw error;
			}
		}

		return [out];
	}
}

/* ============================================================================
   UTILS
============================================================================ */

function convertValue(val: string): unknown {
	const t = String(val ?? '').trim();
	if (t === '') return '';
	if (t === 'true') return true;
	if (t === 'false') return false;
	if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
	try {
		const j = JSON.parse(t);
		if (typeof j === 'object') return j;
	} catch (error) {
		// Not valid JSON, return original value
	}
	return val;
}

function normalizeBirthDate(input: string): string {
	if (!input) return input;
	let v = input.trim();

	if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
		// Already in correct format
	} else if (/^\d{2}\/\d{2}\/\d{4}$/.test(v)) {
		const [d, m, y] = v.split('/');
		v = `${y}-${m}-${d}`;
	} else if (/^\d{2}-\d{2}-\d{4}$/.test(v)) {
		const [d, m, y] = v.split('-');
		v = `${y}-${m}-${d}`;
	} else if (/^\d{4}\/\d{2}\/\d{2}$/.test(v)) {
		v = v.replace(/\//g, '-');
	} else if (/^\d{4}\.\d{2}\.\d{2}$/.test(v)) {
		v = v.replace(/\./g, '-');
	}

	const dt = new Date(v);
	if (isNaN(dt.getTime())) throw new Error(`Invalid birth_date: ${input}`);
	return v;
}

export default CiviCrm;
