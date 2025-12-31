import type { INodeType, ICredentialType } from 'n8n-workflow';

import CiviCrmNode from './nodes/CiviCrm/CiviCrm.node';
import { CiviCrmApi } from './credentials/CiviCrmApi.credentials';

export const nodes: INodeType[] = [
	new CiviCrmNode(),
];

export const credentials: ICredentialType[] = [
	new CiviCrmApi(),
];
