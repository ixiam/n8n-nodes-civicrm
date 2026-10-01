import type { INode } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

/** Offered by default, in this order. */
export const STANDARD_ACTIONS = ['get', 'create', 'update', 'save', 'delete'];

/** Read-only or narrowly scoped extras that are safe to show by default. */
export const SAFE_EXTRA_ACTIONS = ['getDuplicates', 'getChecksum', 'validateChecksum', 'getCoordinates'];

/** Metadata actions; the node uses them for discovery but never offers them. */
export const META_ACTIONS = ['getFields', 'getActions', 'checkAccess', 'getLinks'];

/** Administrative or special entities, listed only with "Show Advanced". */
export const ADVANCED_ENTITIES = ['Entity', 'System', 'Setting', 'Permission', 'Route', 'Log', 'ApiRestLog'];

const DEFAULT_ACTIONS = new Set([...STANDARD_ACTIONS, ...SAFE_EXTRA_ACTIONS]);

export function isActionOffered(action: string, showAdvanced: boolean): boolean {
	if (META_ACTIONS.includes(action)) return false;
	return showAdvanced || DEFAULT_ACTIONS.has(action);
}

/** Actions listed under "Other Action": the standard ones have their own operations. */
export function isOtherActionOffered(action: string, showAdvanced: boolean): boolean {
	return !STANDARD_ACTIONS.includes(action) && isActionOffered(action, showAdvanced);
}

export function isEntityOffered(entity: string, showAdvanced: boolean): boolean {
	return showAdvanced || !ADVANCED_ENTITIES.includes(entity);
}

/** Same rules at run time, so expressions or AI agents cannot reach hidden actions. */
export function assertAnyEntityAllowed(
	node: INode,
	entity: string,
	action: string,
	showAdvanced: boolean,
	itemIndex: number,
): void {
	if (META_ACTIONS.includes(action)) {
		throw new NodeOperationError(
			node,
			`Action "${action}" is not available in Any Entity. Use Custom API Call > List Fields or Raw API Call instead.`,
			{ itemIndex },
		);
	}
	if (!isEntityOffered(entity, showAdvanced)) {
		throw new NodeOperationError(node, `Entity "${entity}" requires "Show Advanced Entities and Actions".`, { itemIndex });
	}
	if (!isActionOffered(action, showAdvanced)) {
		throw new NodeOperationError(
			node,
			`Action "${action}" can change or remove data in bulk and requires "Show Advanced Entities and Actions".`,
			{ itemIndex },
		);
	}
}

export function actionLabel(action: string): string {
	const spaced = action.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
	return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function sortActions(actions: string[]): string[] {
	const rank = (a: string) => {
		const i = STANDARD_ACTIONS.indexOf(a);
		return i === -1 ? STANDARD_ACTIONS.length : i;
	};
	return [...actions].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}
