import type { INodeProperties } from 'n8n-workflow';
export const genericFields: INodeProperties[] = [
  { displayName: 'Return All', name: 'returnAll', type: 'boolean', default: false, description: 'Whether to return all results or only up to a given limit.', displayOptions: { show: { operation: ['getMany'] } } },
  { displayName: 'Limit', name: 'limit', type: 'number', typeOptions: { minValue: 1, maxValue: 1000 }, default: 100, description: 'Max number of results to return.', displayOptions: { show: { operation: ['getMany'], returnAll: [false] } } },
  { displayName: 'Where (JSON)', name: 'whereJson', type: 'string', default: '', placeholder: `[["first_name","=","Alice"]]`, description: 'JSON array of arrays for filtering. Example: [["first_name","=","Alice"], ["contact_type","=","Individual"]]', displayOptions: { show: { operation: ['getMany'] } } },
];
export const upsertFields: INodeProperties[] = [
  { displayName: 'Fields', name: 'fields', type: 'fixedCollection', typeOptions: { multipleValues: true }, default: {}, description: 'Fields to set for the entity.', options: [{ name: 'field', displayName: 'Field', values: [{ displayName: 'Name', name: 'fieldName', type: 'string', default: '', description: 'Name of the field (e.g. first_name).' }, { displayName: 'Value', name: 'fieldValue', type: 'string', default: '', description: 'Value to set.' }] }], displayOptions: { show: { operation: ['create', 'update'] } } }
];
