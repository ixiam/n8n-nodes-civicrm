import type { INodeProperties } from 'n8n-workflow';
export const genericFields: INodeProperties[] = [
  { displayName: 'Return All', name: 'returnAll', type: 'boolean', default: false, displayOptions: { show: { operation: ['getMany'] } } },
  { displayName: 'Limit', name: 'limit', type: 'number', typeOptions: { minValue: 1, maxValue: 1000 }, default: 100, displayOptions: { show: { operation: ['getMany'], returnAll: [false] } } },
  { displayName: 'Where (JSON)', name: 'whereJson', type: 'string', default: '', placeholder: `[["first_name","=","Alice"]]`, displayOptions: { show: { operation: ['getMany'] } } },
];
export const upsertFields: INodeProperties[] = [
  { displayName: 'Fields', name: 'fields', type: 'fixedCollection', typeOptions: { multipleValues: true }, default: {}, options: [{ name:'field', displayName:'Field', values:[{displayName:'Name',name:'fieldName',type:'string',default:''},{displayName:'Value',name:'fieldValue',type:'string',default:''}]}], displayOptions: { show: { operation: ['create','update'] } } }
];
