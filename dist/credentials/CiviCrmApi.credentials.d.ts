import type { ICredentialType, INodeProperties, IHttpRequestMethods } from 'n8n-workflow';
export declare class CiviCrmApi implements ICredentialType {
    name: string;
    displayName: string;
    documentationUrl: string;
    authenticate: {
        type: "generic";
        properties: {
            headers: {
                'X-Civi-Auth': string;
                'Content-Type': string;
            };
        };
    };
    test: {
        request: {
            method: IHttpRequestMethods;
            url: string;
            headers: {
                'X-Civi-Auth': string;
                'Content-Type': string;
            };
            body: {
                params: string;
            };
            json: boolean;
        };
    };
    properties: INodeProperties[];
}
