import type { IExecuteFunctions, ILoadOptionsFunctions, INodeExecutionData, INodeType, INodeTypeDescription } from 'n8n-workflow';
export declare class CiviCrm implements INodeType {
    description: INodeTypeDescription;
    methods: {
        loadOptions: {
            loadOptionValues(this: ILoadOptionsFunctions): Promise<{
                name: string;
                value: number;
            }[]>;
        };
    };
    execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]>;
}
export default CiviCrm;
