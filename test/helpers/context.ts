import type { IExecuteFunctions, ILoadOptionsFunctions, INode, INodeExecutionData } from "n8n-workflow";

export interface ReqOpts {
	url: string;
	method: string;
	headers: Record<string, string>;
	body: Record<string, string>;
}

export type HttpMock = jest.Mock<Promise<unknown>, [ReqOpts]>;

export const testNode = { name: "CiviCRM" } as INode;

export const paramsOf = (o: ReqOpts) => JSON.parse(o.body.params) as Record<string, unknown>;

/** Resolves dotted parameter names (e.g. "anyFilters.filter") against nested objects. */
function lookup(source: Record<string, unknown>, name: string): { found: boolean; value: unknown } {
	if (Object.prototype.hasOwnProperty.call(source, name)) return { found: true, value: source[name] };
	let current: unknown = source;
	for (const part of name.split(".")) {
		if (current && typeof current === "object" && part in (current as Record<string, unknown>)) {
			current = (current as Record<string, unknown>)[part];
		} else {
			return { found: false, value: undefined };
		}
	}
	return { found: true, value: current };
}

export function executeContext(opts: {
	params?: Record<string, unknown>;
	perItem?: Array<Record<string, unknown>>;
	items?: INodeExecutionData[];
	credentials?: Record<string, unknown>;
	httpRequest?: HttpMock;
	continueOnFail?: boolean;
}): IExecuteFunctions {
	const items = opts.items ?? (opts.perItem ?? [{}]).map(() => ({ json: {} }));
	const params = opts.params ?? {};
	return {
		getNodeParameter: jest.fn((name: string, index: number, fallback?: unknown) => {
			const own = lookup(opts.perItem?.[index] ?? {}, name);
			if (own.found) return own.value;
			const common = lookup(params, name);
			if (common.found) return common.value;
			if (fallback === undefined) throw new Error(`Could not get parameter "${name}"`);
			return fallback;
		}),
		getCredentials: jest.fn(async () => ({ baseUrl: "https://civi.test", apiToken: "key-1", ...(opts.credentials ?? {}) })),
		helpers: { httpRequest: opts.httpRequest ?? jest.fn(async () => ({ values: [{ id: 1 }] })) },
		getInputData: jest.fn(() => items),
		addExecutionHints: jest.fn(),
		continueOnFail: jest.fn(() => opts.continueOnFail ?? false),
		getExecutionId: () => "1",
		getNode: () => testNode,
	} as unknown as IExecuteFunctions;
}

export function loadOptionsContext(opts: {
	current?: Record<string, unknown>;
	credentials?: Record<string, unknown>;
	httpRequest?: HttpMock;
}): ILoadOptionsFunctions {
	const current = opts.current ?? {};
	return {
		getCurrentNodeParameter: jest.fn((name: string) => current[name]),
		getCredentials: jest.fn(async () => ({ baseUrl: "https://civi.test", apiToken: "key-1", ...(opts.credentials ?? {}) })),
		helpers: { httpRequest: opts.httpRequest ?? jest.fn(async () => ({ values: [] })) },
		getNode: () => testNode,
	} as unknown as ILoadOptionsFunctions;
}

export const callsOf = (mock: HttpMock) => mock.mock.calls.map((c) => c[0]);

/** Builds an error shaped like n8n's httpRequest failures. */
export function httpError(status: number, data: unknown, headers: Record<string, string> = {}) {
	return Object.assign(new Error(`Request failed with status code ${status}`), { response: { status, data, headers } });
}
