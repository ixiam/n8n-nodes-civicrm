import type {
	IDataObject,
	IExecuteFunctions,
	ILoadOptionsFunctions,
	INode,
	INodeExecutionData,
} from "n8n-workflow";
import { startMockCiviServer } from "../helpers/mockServer";
// Imported from src/ (compiled by ts-jest) rather than dist/, so these tests are
// typed and lint-clean. CiviCrm.test.ts covers the built dist/ artifact.
import { CiviCrm } from "../../src/nodes/CiviCrm/CiviCrm.node";
import { normalizeBaseUrlOverride } from "../../src/nodes/transport/GenericFunctions";

const CRED_URL = "https://cred.example";
const node = { name: "CiviCRM" } as INode;

type Params = Record<string, unknown>;

interface ReqOpts {
	url: string;
	method: string;
	headers: Record<string, string>;
	body: { params: string };
}

type HttpMock = jest.Mock<Promise<unknown>, [ReqOpts]>;

const paramsOf = (o: ReqOpts) =>
	JSON.parse(o.body.params) as { where?: unknown[][]; [k: string]: unknown };

/**
 * Mock execute context with per-item parameters.
 *
 * `perItem[i]` overrides `common` for item i, so each item can target a
 * different `baseUrlOverride`. `httpRequest` routes by URL so JWT
 * (Contact/get auto-resolve + AuthxCredential/create) flows can be simulated
 * per instance.
 */
function ctxFor(opts: {
	common?: Params;
	perItem?: Params[];
	credentials?: Record<string, unknown>;
	httpRequest?: HttpMock;
	continueOnFail?: boolean;
}): IExecuteFunctions {
	const perItem = opts.perItem ?? [{}];
	const common: Params = {
		resource: "customApi",
		operation: "raw",
		customEntity: "Contact",
		customAction: "get",
		customParamsJson: "{}",
		...(opts.common ?? {}),
	};

	return {
		getNodeParameter: jest.fn((name: string, index: number, fallback: unknown) => {
			const own = perItem[index] ?? {};
			if (Object.prototype.hasOwnProperty.call(own, name)) return own[name];
			if (Object.prototype.hasOwnProperty.call(common, name)) return common[name];
			return fallback;
		}),
		getCredentials: jest.fn(async () => ({
			baseUrl: CRED_URL,
			apiToken: "shared-key",
			...(opts.credentials ?? {}),
		})),
		helpers: {
			httpRequest: opts.httpRequest ?? jest.fn<Promise<unknown>, [ReqOpts]>(async () => ({ values: [{ id: 1 }] })),
		},
		getInputData: jest.fn(() => perItem.map(() => ({ json: {} }))),
		addExecutionHints: jest.fn(),
		continueOnFail: jest.fn(() => opts.continueOnFail ?? false),
		getExecutionId: () => "1",
		getNode: () => node,
	} as unknown as IExecuteFunctions;
}

const callsOf = (ctx: IExecuteFunctions) =>
	(ctx.helpers.httpRequest as unknown as HttpMock).mock.calls.map((c) => c[0]);
const urls = (ctx: IExecuteFunctions) => callsOf(ctx).map((c) => c.url);
const firstJson = (r: INodeExecutionData[][]) => r[0][0].json as IDataObject;

describe("normalizeBaseUrlOverride", () => {
	test.each([
		["", undefined],
		["   ", undefined],
		[undefined, undefined],
		[null, undefined],
		["https://a.example", "https://a.example"],
		["  https://a.example/  ", "https://a.example"],
		["https://a.example///", "https://a.example"],
		["a.example", "https://a.example"],
		["a.example/", "https://a.example"],
		["a.example:8443", "https://a.example:8443"],
		["http://localhost:8080", "http://localhost:8080"],
		["HTTPS://A.example/sub/", "HTTPS://A.example/sub"],
		["https://a.example/drupal", "https://a.example/drupal"],
	])("%p -> %p", (input, expected) => {
		expect(normalizeBaseUrlOverride(node, input)).toBe(expected);
	});

	test("is idempotent", () => {
		const once = normalizeBaseUrlOverride(node, " a.example/ ");
		expect(normalizeBaseUrlOverride(node, once)).toBe(once);
	});

	test.each(["ftp://a.example", "file:///etc/passwd", "javascript://alert(1)", "ws://a.example"])(
		"rejects non-http(s) scheme %p with a clear NodeOperationError",
		(input) => {
			expect(() => normalizeBaseUrlOverride(node, input)).toThrow(
				/Invalid Base URL Override .*only http:\/\/ and https:\/\//,
			);
			let caught: unknown;
			try {
				normalizeBaseUrlOverride(node, input);
			} catch (e) {
				caught = e;
			}
			expect((caught as Error).constructor.name).toBe("NodeOperationError");
		},
	);

	test("rejects values that are not a valid URL", () => {
		expect(() => normalizeBaseUrlOverride(node, "exa mple.org")).toThrow(/Invalid Base URL Override/);
	});
});

describe("Base URL Override in execute()", () => {
	test("parameter is defined with the expected name/default and no displayOptions (visible everywhere)", () => {
		const prop = new CiviCrm().description.properties.find((p) => p.name === "baseUrlOverride");
		if (!prop) throw new Error("baseUrlOverride property not found");
		expect(prop.displayName).toBe("Base URL Override");
		expect(prop.type).toBe("string");
		expect(prop.default).toBe("");
		expect(prop.placeholder).toBe("https://example.org");
		expect(prop.displayOptions).toBeUndefined();
	});

	test("empty override -> credential Base URL (unchanged behavior)", async () => {
		const ctx = ctxFor({ perItem: [{ baseUrlOverride: "" }] });
		await new CiviCrm().execute.call(ctx);
		expect(urls(ctx)).toEqual([`${CRED_URL}/civicrm/ajax/api4/Contact/get`]);
	});

	test("parameter absent (old saved workflow) -> credential Base URL", async () => {
		const ctx = ctxFor({ perItem: [{}] });
		await new CiviCrm().execute.call(ctx);
		expect(urls(ctx)).toEqual([`${CRED_URL}/civicrm/ajax/api4/Contact/get`]);
	});

	test("override is used per item, normalized, with the same API key", async () => {
		const ctx = ctxFor({
			perItem: [
				{ baseUrlOverride: "a.example/" },
				{ baseUrlOverride: " https://b.example// " },
				{ baseUrlOverride: "" },
			],
		});
		await new CiviCrm().execute.call(ctx);

		expect(urls(ctx)).toEqual([
			"https://a.example/civicrm/ajax/api4/Contact/get",
			"https://b.example/civicrm/ajax/api4/Contact/get",
			`${CRED_URL}/civicrm/ajax/api4/Contact/get`,
		]);
		for (const call of (ctx.helpers.httpRequest as jest.Mock).mock.calls) {
			expect(call[0].headers["X-Civi-Auth"]).toBe("Bearer shared-key");
		}
	});

	test("override applies to fixed resources, including every sub-request (Contact create)", async () => {
		const ctx = ctxFor({
			common: {
				resource: "contact",
				operation: "create",
				contactType: "Individual",
				fields: { field: [{ fieldName: "first_name", fieldValue: "Ada" }] },
			},
			perItem: [{ baseUrlOverride: "https://c.example" }],
			httpRequest: jest.fn<Promise<unknown>, [ReqOpts]>(async () => ({ values: [{ id: 77 }] })),
		});
		await new CiviCrm().execute.call(ctx);

		const called = urls(ctx);
		expect(called.length).toBeGreaterThan(1);
		for (const u of called) expect(u.startsWith("https://c.example/civicrm/ajax/api4/")).toBe(true);
	});

	test("override is combined with the runtime bearer token (token sent to the override host)", async () => {
		const ctx = ctxFor({
			perItem: [{ baseUrlOverride: "https://d.example", runtimeBearerToken: "user-jwt" }],
		});
		await new CiviCrm().execute.call(ctx);
		const call = callsOf(ctx)[0];
		expect(call.url).toBe("https://d.example/civicrm/ajax/api4/Contact/get");
		expect(call.headers["X-Civi-Auth"]).toBe("Bearer user-jwt");
	});

	test("invalid scheme throws a NodeOperationError before any request is made", async () => {
		const ctx = ctxFor({ perItem: [{ baseUrlOverride: "ftp://e.example" }] });
		await expect(new CiviCrm().execute.call(ctx)).rejects.toThrow(/Invalid Base URL Override/);
		expect(ctx.helpers.httpRequest).not.toHaveBeenCalled();
	});

	test("invalid scheme with continueOnFail only fails that item", async () => {
		const ctx = ctxFor({
			perItem: [{ baseUrlOverride: "ftp://e.example" }, { baseUrlOverride: "f.example" }],
			continueOnFail: true,
		});
		const result = await new CiviCrm().execute.call(ctx);
		expect(firstJson(result).error).toMatch(/Invalid Base URL Override/);
		expect(urls(ctx)).toEqual(["https://f.example/civicrm/ajax/api4/Contact/get"]);
	});

	test("Raw API Call returns the full response (countMatched) when values is empty", async () => {
		const response = { values: [], count: 0, countFetched: 0, countMatched: 1234 };
		const ctx = ctxFor({
			common: { customParamsJson: '{"select":["row_count"]}' },
			perItem: [{ baseUrlOverride: "https://g.example" }],
			httpRequest: jest.fn<Promise<unknown>, [ReqOpts]>(async () => response),
		});
		const result = await new CiviCrm().execute.call(ctx);
		expect(firstJson(result)).toEqual(response);
		const call = callsOf(ctx)[0];
		expect(call.url).toBe("https://g.example/civicrm/ajax/api4/Contact/get");
		expect(JSON.parse(call.body.params)).toEqual({ select: ["row_count"] });
	});
});

describe("Base URL Override with JWT auth (cache isolation)", () => {
	/** Each instance issues a distinct JWT: "jwt-for-<host>". */
	function jwtRouter() {
		return jest.fn(async (opts: ReqOpts) => {
			const { host } = new URL(opts.url);
			if (opts.url.endsWith("/Contact/get") && paramsOf(opts).where?.[0]?.[0] === "api_key") {
				return { values: [{ id: 5 }] };
			}
			if (opts.url.endsWith("/AuthxCredential/create")) {
				return { values: [{ cred: `Bearer jwt-for-${host}` }] };
			}
			return { values: [{ id: 1, host }] };
		});
	}

	const jwtCreds = { enableJwtAuth: true, jwtExpiry: 3600, jwtHeaderMode: "xheader" };

	test("auto-resolve, AuthxCredential/create and data calls all go to the override host; tokens never cross instances", async () => {
		const httpRequest = jwtRouter();
		const ctx = ctxFor({
			credentials: jwtCreds,
			perItem: [
				{ baseUrlOverride: "https://jwt-a.example" },
				{ baseUrlOverride: "https://jwt-b.example" },
				{ baseUrlOverride: "https://jwt-a.example" },
			],
			httpRequest,
		});
		await new CiviCrm().execute.call(ctx);

		const calls = httpRequest.mock.calls.map((c) => c[0]);

		// No request at all to the credential URL.
		expect(calls.some((c) => c.url.startsWith(CRED_URL))).toBe(false);

		// Each instance minted its own JWT exactly once (item 3 reuses A's cached one).
		const mints = calls.filter((c) => c.url.endsWith("/AuthxCredential/create")).map((c) => c.url);
		expect(mints).toEqual([
			"https://jwt-a.example/civicrm/ajax/api4/AuthxCredential/create",
			"https://jwt-b.example/civicrm/ajax/api4/AuthxCredential/create",
		]);

		// Every JWT-authenticated data request carries the JWT of its own host.
		const dataCalls = calls.filter((c) => /\/Contact\/get$/.test(c.url) && c.headers["X-Civi-Auth"]?.startsWith("Bearer jwt-for-"));
		expect(dataCalls).toHaveLength(3);
		for (const c of dataCalls) {
			const { host } = new URL(c.url);
			expect(c.headers["X-Civi-Auth"]).toBe(`Bearer jwt-for-${host}`);
		}
	});

	test("empty override with JWT still uses the credential URL for the whole JWT flow", async () => {
		const httpRequest = jwtRouter();
		const ctx = ctxFor({ credentials: jwtCreds, perItem: [{ baseUrlOverride: "" }], httpRequest });
		await new CiviCrm().execute.call(ctx);
		for (const c of httpRequest.mock.calls) expect(c[0].url.startsWith(`${CRED_URL}/`)).toBe(true);
	});

	test("JWT empty-response fallback to API key also goes to the override host", async () => {
		const httpRequest: HttpMock = jest.fn(async (opts: ReqOpts) => {
			if (opts.url.endsWith("/AuthxCredential/create")) return { values: [{ cred: "Bearer jwt-x" }] };
			if (paramsOf(opts).where?.[0]?.[0] === "api_key") return { values: [{ id: 9 }] };
			// JWT data request returns nothing -> node retries with API key
			if (opts.headers["X-Civi-Auth"] === "Bearer jwt-x") return { values: [], countMatched: 0 };
			return { values: [], countMatched: 42 };
		});
		const ctx = ctxFor({
			credentials: jwtCreds,
			perItem: [{ baseUrlOverride: "jwt-fallback.example" }],
			httpRequest,
		});
		const result = await new CiviCrm().execute.call(ctx);

		for (const c of httpRequest.mock.calls) {
			expect(c[0].url.startsWith("https://jwt-fallback.example/")).toBe(true);
		}
		const last = httpRequest.mock.calls[httpRequest.mock.calls.length - 1][0];
		expect(last.headers["X-Civi-Auth"]).toBe("Bearer shared-key");
		expect(firstJson(result)).toEqual({ values: [], countMatched: 42 });
	});
});

describe("loadOptions ignores the override (no item context)", () => {
	test("loadOptionValues uses the credential Base URL", async () => {
		const httpRequest = jest.fn(async () => ({ values: [{ id: 1, label: "One" }] }));
		const ctx = {
			getCredentials: jest.fn(async () => ({ baseUrl: `${CRED_URL}/`, apiToken: "shared-key" })),
			getNodeParameter: jest.fn(() => "https://should-not-be-used.example"),
			helpers: { httpRequest },
		} as unknown as ILoadOptionsFunctions;

		const res = await new CiviCrm().methods.loadOptions.loadOptionValues.call(ctx);
		expect(res).toEqual([{ name: "One", value: 1 }]);
		expect((httpRequest.mock.calls[0] as unknown as [ReqOpts])[0].url).toBe(`${CRED_URL}/civicrm/ajax/api4/OptionValue/get`);
	});
});

describe("Base URL Override against a real HTTP mock server", () => {
	// Minimal shape of the http.Server returned by the helper (a type import of
	// "http" is flagged by the n8n Cloud lint rules, even in tests).
	type ClosableServer = { close: (cb: () => void) => void };
	let server: ClosableServer;
	let lastRequest: () => unknown;
	const port = 5577;

	beforeAll(async () => {
		const started = (await startMockCiviServer(port)) as { server: ClosableServer; lastRequest: () => unknown };
		server = started.server;
		lastRequest = started.lastRequest;
	});
	afterAll(() => new Promise<void>((r) => server.close(() => r())));

	test("an http:// override reaches the given instance over the wire", async () => {
		const seenUrls: string[] = [];
		const httpRequest: HttpMock = jest.fn(async (opts: ReqOpts) => {
			seenUrls.push(opts.url);
			const res = await fetch(opts.url, {
				method: opts.method,
				headers: { ...opts.headers },
				body: `params=${encodeURIComponent(opts.body.params)}`,
			});
			return res.json();
		});
		const ctx = ctxFor({
			common: { customParamsJson: '{"limit":3}' },
			perItem: [{ baseUrlOverride: `http://127.0.0.1:${port}/` }],
			httpRequest,
		});
		const result = await new CiviCrm().execute.call(ctx);

		expect(seenUrls).toEqual([`http://127.0.0.1:${port}/civicrm/ajax/api4/Contact/get`]);
		expect(lastRequest()).toEqual({ limit: 3 });
		expect((firstJson(result).values as IDataObject[])[0].id).toBe(999);
	});
});
