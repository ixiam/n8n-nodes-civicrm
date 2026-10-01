import type {
	FieldType,
	IDataObject,
	ILoadOptionsFunctions,
	INodePropertyOptions,
	ResourceMapperField,
	ResourceMapperFields,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import { cachedDiscovery } from '../../transport/Discovery';
import { assertApiName, civicrmApiRequest, fetchUncapped } from '../../transport/GenericFunctions';
import { actionLabel, isEntityOffered, isOtherActionOffered, sortActions } from './policy';

const API = '/civicrm/ajax/api4';

interface CiviField extends IDataObject {
	name: string;
	title?: string;
	description?: string;
	data_type?: string;
	input_type?: string;
	required?: boolean;
	readonly?: boolean;
	serialize?: number | null;
	options?: Array<{ id: string | number; label: string }> | boolean;
}

function currentString(ctx: ILoadOptionsFunctions, name: string): string {
	const value = ctx.getCurrentNodeParameter(name);
	return typeof value === 'string' ? value.trim() : '';
}

/** Entity selected in the panel; expressions cannot be resolved without input data. */
function selectedEntity(ctx: ILoadOptionsFunctions): string | undefined {
	const entity = currentString(ctx, 'anyEntity');
	if (!entity || entity.startsWith('=')) return undefined;
	return assertApiName(ctx.getNode(), 'entity', entity);
}

async function entityFields(ctx: ILoadOptionsFunctions, entity: string, action: string): Promise<CiviField[]> {
	return await cachedDiscovery(ctx, ['fields', entity, action], async () => {
		const rows = await fetchUncapped.call(ctx, `${API}/${entity}/getFields`, {
			action,
			select: ['name', 'title', 'description', 'data_type', 'input_type', 'required', 'readonly', 'serialize', 'options'],
			loadOptions: ['id', 'label'],
		});
		return rows as CiviField[];
	});
}

export async function getAnyEntities(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	const showAdvanced = this.getCurrentNodeParameter('anyShowAdvanced') === true;
	const entities = await cachedDiscovery(this, ['entities'], async () =>
		(await fetchUncapped.call(this, `${API}/Entity/get`, {
			select: ['name', 'title', 'description', 'type'],
		})) as Array<{ name: string; title?: string; description?: string }>,
	);
	return entities
		.filter((e) => isEntityOffered(e.name, showAdvanced))
		.map((e) => ({
			name: e.title && e.title !== e.name ? `${e.title} (${e.name})` : e.name,
			value: e.name,
			description: e.description ?? undefined,
		}))
		.sort((a, b) => a.name.localeCompare(b.name));
}

export async function getAnyEntityActions(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	const entity = selectedEntity(this);
	if (!entity) return [];
	const showAdvanced = this.getCurrentNodeParameter('anyShowAdvanced') === true;
	const actions = await cachedDiscovery(this, ['actions', entity], async () => {
		const response = await civicrmApiRequest.call(this, 'POST', `${API}/${entity}/getActions`, {
			select: ['name', 'description'],
		});
		return (response?.values ?? []) as Array<{ name: string; description?: string }>;
	});
	const byName = new Map(actions.map((a) => [a.name, a]));
	return sortActions(actions.map((a) => a.name).filter((name) => isOtherActionOffered(name, showAdvanced))).map(
		(name) => ({ name: actionLabel(name), value: name, description: byName.get(name)?.description ?? undefined }),
	);
}

export async function getAnyEntityFields(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	const entity = selectedEntity(this);
	if (!entity) return [];
	const fields = await entityFields(this, entity, 'get');
	return fields
		.map((f) => ({
			name: f.title && f.title !== f.name ? `${f.title} (${f.name})` : f.name,
			value: f.name,
			description: [f.data_type, f.description].filter(Boolean).join(' - ') || undefined,
		}))
		.sort((a, b) => a.name.localeCompare(b.name));
}

/** Maps a CiviCRM field to the closest n8n field type for the resource mapper. */
export function mapFieldType(field: CiviField): FieldType {
	if (Array.isArray(field.options) && field.options.length > 0 && !field.serialize) return 'options';
	if (field.serialize || field.data_type === 'Array') return 'array';
	switch (field.data_type) {
		case 'Integer':
		case 'Float':
		case 'Money':
			return 'number';
		case 'Boolean':
			return 'boolean';
		case 'Date':
		case 'Timestamp':
		case 'Datetime':
			return 'dateTime';
		default:
			return field.input_type === 'Url' ? 'url' : 'string';
	}
}

export async function getAnyEntityMappingColumns(this: ILoadOptionsFunctions): Promise<ResourceMapperFields> {
	const entity = selectedEntity(this);
	const action = currentString(this, 'operation');
	if (!entity || !action) {
		return { fields: [], emptyFieldsNotice: 'Select an entity and an operation first' };
	}
	if (!['create', 'update', 'save'].includes(action)) {
		throw new NodeOperationError(this.getNode(), `The field mapper is only used for create, update and save, not "${action}".`);
	}
	const fields = await entityFields(this, entity, action);
	const mapped: ResourceMapperField[] = fields
		.filter((f) => f.name)
		.map((f) => ({
			id: f.name,
			displayName: f.title && f.title !== f.name ? `${f.title} (${f.name})` : f.name,
			required: action === 'create' && f.required === true,
			defaultMatch: f.name === 'id',
			canBeUsedToMatch: action !== 'create',
			display: true,
			type: mapFieldType(f),
			readOnly: f.readonly === true && f.name !== 'id',
			options: Array.isArray(f.options)
				? f.options.map((o) => ({ name: String(o.label), value: o.id }))
				: undefined,
		}));
	return { fields: mapped, emptyFieldsNotice: `${entity} reports no writable fields for "${action}"` };
}
