import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	ResourceMapperValue,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import { assertApiName, civicrmApiRequest, fetchAllPages } from '../../transport/GenericFunctions';
import { assertAnyEntityAllowed, STANDARD_ACTIONS } from './policy';

const NO_VALUE_OPERATORS = ['IS NULL', 'IS NOT NULL', 'IS EMPTY', 'IS NOT EMPTY'];
const LIST_OPERATORS = ['IN', 'NOT IN', 'BETWEEN', 'NOT BETWEEN'];

interface FilterRow {
	field?: string;
	operator?: string;
	value?: unknown;
}

function parseList(value: unknown): unknown[] {
	if (Array.isArray(value)) return value;
	const text = String(value ?? '').trim();
	if (text.startsWith('[')) {
		try {
			const parsed = JSON.parse(text);
			if (Array.isArray(parsed)) return parsed;
		} catch {
			// Not JSON: fall through to comma-separated values.
		}
	}
	return text === '' ? [] : text.split(',').map((v) => v.trim());
}

function parseJson<T>(ctx: IExecuteFunctions, raw: unknown, label: string, itemIndex: number, fallback: T): T {
	if (raw === undefined || raw === null || raw === '') return fallback;
	if (typeof raw === 'object') return raw as T;
	try {
		return JSON.parse(String(raw)) as T;
	} catch {
		throw new NodeOperationError(ctx.getNode(), `Invalid JSON in "${label}"`, { itemIndex });
	}
}

/** Builds APIv4 where clauses from the Filters rows plus the optional Where (JSON). */
export function buildWhere(rows: FilterRow[], extra: unknown[] = []): unknown[] {
	const clauses: unknown[] = [];
	for (const row of rows) {
		const field = String(row.field ?? '').trim();
		if (!field) continue;
		const operator = String(row.operator ?? '=').trim() || '=';
		if (NO_VALUE_OPERATORS.includes(operator)) clauses.push([field, operator]);
		else if (LIST_OPERATORS.includes(operator)) clauses.push([field, operator, parseList(row.value)]);
		else clauses.push([field, operator, row.value ?? '']);
	}
	return [...clauses, ...extra];
}

function whereFor(ctx: IExecuteFunctions, i: number): unknown[] {
	const rows = ctx.getNodeParameter('anyFilters.filter', i, []) as FilterRow[];
	const extra = parseJson<unknown[]>(ctx, ctx.getNodeParameter('anyOptions.whereJson', i, '[]'), 'Where (JSON)', i, []);
	if (!Array.isArray(extra)) {
		throw new NodeOperationError(ctx.getNode(), '"Where (JSON)" must be a JSON array', { itemIndex: i });
	}
	return buildWhere(rows, extra);
}

/** Values from the field mapper; null means "not set" and is left out. */
function mappedValues(ctx: IExecuteFunctions, i: number, item: INodeExecutionData) {
	const mapper = ctx.getNodeParameter('anyValues', i) as ResourceMapperValue;
	let raw: IDataObject;
	if (mapper.mappingMode === 'autoMapInputData') {
		const known = new Set((mapper.schema ?? []).filter((f) => !f.removed).map((f) => f.id));
		raw = Object.fromEntries(Object.entries(item.json).filter(([key]) => known.has(key)));
	} else {
		raw = (mapper.value ?? {}) as IDataObject;
	}
	const values = Object.fromEntries(
		Object.entries(raw).filter(([, value]) => value !== null && value !== undefined),
	) as IDataObject;
	return { values, matching: mapper.matchingColumns ?? [] };
}

export async function executeAnyEntity(
	this: IExecuteFunctions,
	i: number,
	item: INodeExecutionData,
): Promise<INodeExecutionData[]> {
	const node = this.getNode();
	const entity = assertApiName(node, 'entity', this.getNodeParameter('anyEntity', i) as string, i);
	const operation = this.getNodeParameter('operation', i, 'get') as string;
	if (![...STANDARD_ACTIONS, 'other'].includes(operation)) {
		throw new NodeOperationError(node, `Unknown Any Entity operation "${operation}"`, { itemIndex: i });
	}
	const action =
		operation === 'other' ? assertApiName(node, 'action', this.getNodeParameter('anyAction', i) as string, i) : operation;
	const showAdvanced = this.getNodeParameter('anyShowAdvanced', i, false) as boolean;
	assertAnyEntityAllowed(node, entity, action, showAdvanced, i);

	const path = `/civicrm/ajax/api4/${entity}/${action}`;
	const toItems = (rows: IDataObject[]) => rows.map((json) => ({ json, pairedItem: { item: i } }));
	const request = async (params: IDataObject) =>
		await civicrmApiRequest.call(this, 'POST', path, params, undefined, undefined, i);

	switch (operation) {
		case 'get': {
			const params: IDataObject = {};
			const select = this.getNodeParameter('anySelect', i, []) as string[];
			if (select.length) params.select = select;
			const where = whereFor(this, i);
			if (where.length) params.where = where;
			const sortRows = this.getNodeParameter('anySort.sort', i, []) as Array<{ field?: string; direction?: string }>;
			const orderBy = Object.fromEntries(
				sortRows.filter((s) => s.field).map((s) => [s.field as string, s.direction === 'DESC' ? 'DESC' : 'ASC']),
			);
			if (Object.keys(orderBy).length) params.orderBy = orderBy;

			if (this.getNodeParameter('anyReturnAll', i, false) as boolean) {
				return toItems(await fetchAllPages.call(this, path, params, { itemIndex: i }));
			}
			const limit = this.getNodeParameter('anyLimit', i, 50) as number;
			return toItems((await request({ ...params, limit }))?.values ?? []);
		}

		case 'create': {
			const { values } = mappedValues(this, i, item);
			return toItems((await request({ values }))?.values ?? []);
		}

		case 'update': {
			const { values, matching } = mappedValues(this, i, item);
			const keys = matching.length ? matching : ['id'];
			const where = keys.map((key) => {
				if (values[key] === undefined || values[key] === '') {
					throw new NodeOperationError(node, `Update needs a value for the match field "${key}"`, { itemIndex: i });
				}
				return [key, '=', values[key]];
			});
			const changes = Object.fromEntries(Object.entries(values).filter(([key]) => !keys.includes(key)));
			if (!Object.keys(changes).length) {
				throw new NodeOperationError(node, 'Update has no fields to change besides the match fields', { itemIndex: i });
			}
			return toItems((await request({ values: changes, where }))?.values ?? []);
		}

		case 'save': {
			const { values, matching } = mappedValues(this, i, item);
			const params: IDataObject = { records: [values] };
			const match = matching.filter((key) => key !== 'id');
			if (match.length) params.match = match;
			return toItems((await request(params))?.values ?? []);
		}

		case 'delete': {
			const id = Number(this.getNodeParameter('anyDeleteId', i, 0));
			const where = id > 0 ? [['id', '=', id]] : whereFor(this, i);
			if (!where.length) {
				throw new NodeOperationError(node, 'Delete needs a Record ID or at least one filter', { itemIndex: i });
			}
			return toItems((await request({ where }))?.values ?? []);
		}

		default: {
			const params = parseJson<IDataObject>(this, this.getNodeParameter('anyParamsJson', i, '{}'), 'Params (JSON)', i, {});
			if (typeof params !== 'object' || Array.isArray(params)) {
				throw new NodeOperationError(node, '"Params (JSON)" must be a JSON object', { itemIndex: i });
			}
			const response = await request(params);
			if (Array.isArray(response?.values)) return toItems(response.values);
			return [{ json: (response ?? {}) as IDataObject, pairedItem: { item: i } }];
		}
	}
}
