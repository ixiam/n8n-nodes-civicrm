import type { IExecuteFunctions, INodeExecutionData } from "n8n-workflow";

// `n8n-node build` does not emit .d.ts declaration files for dist/, so this is
// imported via `require` (typed as `any`) rather than a typed ES `import` to
// avoid a TS7016 "could not find a declaration file" error in ts-jest.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { CiviCrm } = require("../../dist/src/nodes/CiviCrm/CiviCrm.node");

/**
 * Minimal mock context required by n8n for community node validation.
 *
 * `params` seeds the values returned by `getNodeParameter`; `httpResponses`
 * lets a test return a different mock CiviCRM APIv4 response per call (in
 * call order) instead of the fixed default, so getFields/search flows that
 * make multiple requests can be asserted against distinct payloads.
 */
function mockExecuteContext(
	items: any[],
	params: Record<string, any> = {},
	httpResponses?: any[],
): IExecuteFunctions {
	const defaultParams: Record<string, any> = {
		resource: "contact",
		operation: "getMany",
		returnAll: true,
		whereJson: "[]",
		// Get Many's "Contact Type" filter defaults to "Any" (empty) - no implicit filter.
		contactType: "",
	};
	const merged = { ...defaultParams, ...params };

	let callIndex = 0;
	const httpRequest = httpResponses
		? jest.fn(async () => {
				const response = httpResponses[Math.min(callIndex, httpResponses.length - 1)];
				callIndex += 1;
				return response;
			})
		: jest.fn(async () => ({ values: [{ id: 1 }] }));

	return {
		// Mock de parámetros del nodo
		getNodeParameter: jest.fn((name: string, _index: number, fallback: any) => {
			return Object.prototype.hasOwnProperty.call(merged, name) ? merged[name] : fallback;
		}) as any,

		// Mock de credenciales
		getCredentials: jest.fn(async () => ({
			baseUrl: "https://mock",
			apiToken: "123",
		})) as any,

		// Mock de llamadas HTTP (API4)
		helpers: {
			httpRequest,
		},

		// Items de entrada
		getInputData: jest.fn(() => items),

		addExecutionHints: jest.fn(),
		continueOnFail: jest.fn(() => false),
		getExecutionId: () => "1",
		getNode: () => ({ name: "CiviCRM" }),
	} as unknown as IExecuteFunctions;
}

describe("CiviCRM Node (n8n validation tests)", () => {
	test("Node loads metadata", () => {
		const node = new CiviCrm();

		expect(node.description).toBeDefined();
		expect(node.description.displayName).toBe("CiviCRM");
		expect(Array.isArray(node.description.properties)).toBe(true);
	});

	test("Node executes minimal GET MANY", async () => {
		const node = new CiviCrm();

		const ctx = mockExecuteContext([{ json: {} }]);

		const result = await node.execute.call(ctx);

		// result es INodeExecutionData[][]
		expect(result).toBeDefined();
		expect(Array.isArray(result)).toBe(true);
		expect(Array.isArray(result[0])).toBe(true);

		const firstItem = result[0][0] as INodeExecutionData;

		expect(firstItem.json).toBeDefined();
		expect(firstItem.json.id).toBe(1);
	});

	describe("Custom API resource — Raw API Call (unchanged legacy behavior)", () => {
		test("still posts to {Entity}/{Action} with hand-typed params when operation is the new 'raw' default", async () => {
			const node = new CiviCrm();

			const ctx = mockExecuteContext(
				[{ json: {} }],
				{
					resource: "customApi",
					operation: "raw",
					customEntity: "Contribution",
					customAction: "get",
					customParamsJson: '{"limit": 5}',
				},
				[{ values: [{ id: 42 }], count: 1 }],
			);

			const result = await node.execute.call(ctx);

			expect((ctx.helpers.httpRequest as jest.Mock).mock.calls[0][0].url).toBe(
				"https://mock/civicrm/ajax/api4/Contribution/get",
			);
			expect(result[0][0].json).toEqual({ values: [{ id: 42 }], count: 1 });
		});

		test("still resolves to the raw path for a legacy operation value (e.g. 'get') saved before this feature existed", async () => {
			const node = new CiviCrm();

			const ctx = mockExecuteContext(
				[{ json: {} }],
				{
					resource: "customApi",
					operation: "get", // legacy value, predates customApiOperationProp
					customEntity: "Event",
					customAction: "get",
					customParamsJson: "{}",
				},
				[{ values: [{ id: 7 }] }],
			);

			await node.execute.call(ctx);

			expect((ctx.helpers.httpRequest as jest.Mock).mock.calls[0][0].url).toBe(
				"https://mock/civicrm/ajax/api4/Event/get",
			);
		});
	});

	describe("Custom API resource — List Fields (getFields)", () => {
		test("calls {Entity}/getFields and emits one output item per field", async () => {
			const node = new CiviCrm();

			const ctx = mockExecuteContext(
				[{ json: {} }],
				{
					resource: "customApi",
					operation: "getFields",
					customEntity: "Contribution",
					getFieldsAction: "get",
				},
				[
					{
						values: [
							{ name: "id", data_type: "Integer" },
							{ name: "total_amount", data_type: "Money" },
							{ name: "custom_12", data_type: "String" },
						],
					},
				],
			);

			const result = await node.execute.call(ctx);

			const call = (ctx.helpers.httpRequest as jest.Mock).mock.calls[0][0];
			expect(call.url).toBe("https://mock/civicrm/ajax/api4/Contribution/getFields");
			expect(JSON.parse(call.body.params)).toEqual({ action: "get", loadOptions: true });

			expect(result[0]).toHaveLength(3);
			expect(result[0].map((r: INodeExecutionData) => r.json.name)).toEqual([
				"id",
				"total_amount",
				"custom_12",
			]);
		});
	});

	describe("Custom API resource — Dynamic Search (search)", () => {
		test("calls {Entity}/get with the configured select/where/limit and emits one item per result row", async () => {
			const node = new CiviCrm();

			const ctx = mockExecuteContext(
				[{ json: {} }],
				{
					resource: "customApi",
					operation: "search",
					customEntity: "Contribution",
					searchSelectJson: '["id","total_amount"]',
					searchWhereJson: '[["contact_id","=",123]]',
					searchReturnAll: false,
					searchLimit: 50,
				},
				[
					{
						values: [
							{ id: 1, total_amount: 10 },
							{ id: 2, total_amount: 20 },
						],
					},
				],
			);

			const result = await node.execute.call(ctx);

			const call = (ctx.helpers.httpRequest as jest.Mock).mock.calls[0][0];
			expect(call.url).toBe("https://mock/civicrm/ajax/api4/Contribution/get");
			expect(JSON.parse(call.body.params)).toEqual({
				select: ["id", "total_amount"],
				where: [["contact_id", "=", 123]],
				limit: 50,
			});

			expect(result[0]).toHaveLength(2);
			expect(result[0][0].json).toEqual({ id: 1, total_amount: 10 });
			expect(result[0][1].json).toEqual({ id: 2, total_amount: 20 });
		});

		test("paginates in pages of 500 when Return All is enabled", async () => {
			const node = new CiviCrm();

			const page1 = { values: Array.from({ length: 500 }, (_, idx) => ({ id: idx + 1 })) };
			const page2 = { values: [{ id: 501 }] };

			const ctx = mockExecuteContext(
				[{ json: {} }],
				{
					resource: "customApi",
					operation: "search",
					customEntity: "Contribution",
					searchSelectJson: '["id"]',
					searchWhereJson: "",
					searchReturnAll: true,
				},
				[page1, page2],
			);

			const result = await node.execute.call(ctx);

			expect(ctx.helpers.httpRequest as jest.Mock).toHaveBeenCalledTimes(2);
			expect(result[0]).toHaveLength(501);
		});

		test("throws a clear error on invalid Select/Where JSON", async () => {
			const node = new CiviCrm();

			const ctx = mockExecuteContext([{ json: {} }], {
				resource: "customApi",
				operation: "search",
				customEntity: "Contribution",
				searchSelectJson: "{not valid json",
			});

			await expect(node.execute.call(ctx)).rejects.toThrow('Invalid JSON in "Select (JSON)"');
		});
	});

	// Issue #25: per-user permissions via a runtime-supplied Authx JWT.
	// `runtimeBearerToken` must be used exactly as given (header per jwtHeaderMode, default X-Civi-Auth)
	// with none of the credential-based JWT auto-resolve/API key logic - and an
	// empty/denied result with it must never trigger the API-key fallback that
	// exists for the credential-based path.
	describe("Runtime Bearer Token (issue #25 - per-user JWT)", () => {
		test("Dynamic Search: uses the runtime JWT as-is (X-Civi-Auth by default) and never touches the credential's API key", async () => {
			const node = new CiviCrm();

			const ctx = mockExecuteContext(
				[{ json: {} }],
				{
					resource: "customApi",
					operation: "search",
					customEntity: "Contribution",
					searchSelectJson: '["id","total_amount"]',
					searchWhereJson: "[]",
					searchReturnAll: false,
					searchLimit: 50,
					runtimeBearerToken: "runtime.jwt.for.contact-49",
				},
				[{ values: [{ id: 1, total_amount: 10 }] }],
			);

			await node.execute.call(ctx);

			expect(ctx.helpers.httpRequest as jest.Mock).toHaveBeenCalledTimes(1);
			const call = (ctx.helpers.httpRequest as jest.Mock).mock.calls[0][0];
			expect(call.url).toBe("https://mock/civicrm/ajax/api4/Contribution/get");
			expect(call.headers["X-Civi-Auth"]).toBe("Bearer runtime.jwt.for.contact-49");
			// Default jwtHeaderMode is xheader: no Authorization header (many nginx +
			// PHP-FPM setups drop it), and never the API key alongside the JWT.
			expect(call.headers.Authorization).toBeUndefined();
		});

		test("runtime JWT honors the credential's jwtHeaderMode ('both' sends X-Civi-Auth and Authorization)", async () => {
			const node = new CiviCrm();

			const ctx = mockExecuteContext(
				[{ json: {} }],
				{
					resource: "customApi",
					operation: "search",
					customEntity: "Contact",
					searchSelectJson: '["id"]',
					searchWhereJson: "[]",
					searchReturnAll: false,
					searchLimit: 5,
					runtimeBearerToken: "runtime.jwt.for.contact-49",
				},
				[{ values: [{ id: 1 }] }],
			);
			(ctx.getCredentials as jest.Mock).mockResolvedValue({ baseUrl: "https://mock", apiToken: "123", jwtHeaderMode: "both" });

			await node.execute.call(ctx);

			const call = (ctx.helpers.httpRequest as jest.Mock).mock.calls[0][0];
			expect(call.headers["X-Civi-Auth"]).toBe("Bearer runtime.jwt.for.contact-49");
			expect(call.headers.Authorization).toBe("Bearer runtime.jwt.for.contact-49");
		});

		test("Custom API Call (raw): uses the runtime JWT as-is instead of the credential", async () => {
			const node = new CiviCrm();

			const ctx = mockExecuteContext(
				[{ json: {} }],
				{
					resource: "customApi",
					operation: "raw",
					customEntity: "Contribution",
					customAction: "get",
					customParamsJson: '{"limit": 5}',
					runtimeBearerToken: "runtime.jwt.for.contact-49",
				},
				[{ values: [], count: 0 }],
			);

			await node.execute.call(ctx);

			const call = (ctx.helpers.httpRequest as jest.Mock).mock.calls[0][0];
			expect(call.headers["X-Civi-Auth"]).toBe("Bearer runtime.jwt.for.contact-49");
			expect(call.headers.Authorization).toBeUndefined();
		});

		test("empty response with a runtime JWT is returned as-is - NOT retried with the API key", async () => {
			const node = new CiviCrm();

			const ctx = mockExecuteContext(
				[{ json: {} }],
				{
					resource: "customApi",
					operation: "raw",
					customEntity: "Contribution",
					customAction: "get",
					customParamsJson: "{}",
					runtimeBearerToken: "runtime.jwt.for.contact-49",
				},
				// Only one response queued: if the node retried, the mock would
				// just replay this same (empty) response again, so asserting the
				// call count is what actually proves no retry happened.
				[{ values: [], count: 0 }],
			);

			const result = await node.execute.call(ctx);

			expect(ctx.helpers.httpRequest as jest.Mock).toHaveBeenCalledTimes(1);
			expect(result[0][0].json).toEqual({ values: [], count: 0 });
		});

		test("an error with a runtime JWT is thrown as-is - NOT retried with the API key", async () => {
			const node = new CiviCrm();

			const ctx = mockExecuteContext(
				[{ json: {} }],
				{
					resource: "customApi",
					operation: "raw",
					customEntity: "Contribution",
					customAction: "get",
					customParamsJson: "{}",
					runtimeBearerToken: "runtime.jwt.for.contact-49",
				},
			);
			(ctx.helpers.httpRequest as jest.Mock).mockRejectedValueOnce(
				Object.assign(new Error("Request failed with status code 403"), {
					response: { status: 403, data: { error_message: "Permission denied" } },
				}),
			);

			await expect(node.execute.call(ctx)).rejects.toThrow();
			expect(ctx.helpers.httpRequest as jest.Mock).toHaveBeenCalledTimes(1);
		});

		test("without the parameter, behavior is unchanged (regression): falls back to the credential's API key header as before", async () => {
			const node = new CiviCrm();

			const ctx = mockExecuteContext(
				[{ json: {} }],
				{
					resource: "customApi",
					operation: "raw",
					customEntity: "Contribution",
					customAction: "get",
					customParamsJson: "{}",
					// runtimeBearerToken intentionally omitted
				},
				[{ values: [{ id: 42 }], count: 1 }],
			);

			await node.execute.call(ctx);

			const call = (ctx.helpers.httpRequest as jest.Mock).mock.calls[0][0];
			// Mock credentials have no enableJwtAuth, so this is the pre-existing
			// API key path (X-Civi-Auth), completely untouched by this feature.
			expect(call.headers["X-Civi-Auth"]).toBe("Bearer 123");
			expect(call.headers.Authorization).toBeUndefined();
		});

		test("a blank/whitespace-only runtime token is treated as not provided (falls back to credential, no empty Authorization header)", async () => {
			const node = new CiviCrm();

			const ctx = mockExecuteContext(
				[{ json: {} }],
				{
					resource: "customApi",
					operation: "raw",
					customEntity: "Contribution",
					customAction: "get",
					customParamsJson: "{}",
					runtimeBearerToken: "   ",
				},
				[{ values: [{ id: 42 }], count: 1 }],
			);

			await node.execute.call(ctx);

			const call = (ctx.helpers.httpRequest as jest.Mock).mock.calls[0][0];
			expect(call.headers["X-Civi-Auth"]).toBe("Bearer 123");
			expect(call.headers.Authorization).toBeUndefined();
		});
	});

	// Issue #30: the fixed-resource create/update/delete branches (shared by
	// Contact/Membership/Group/Relationship/Activity) never threaded
	// `runtimeBearerToken` through to civicrmApiRequest, meaning every write
	// always ran as the client's admin credential regardless of the real
	// logged-in user's actual CiviCRM permissions - defeating issue #25 for
	// writes. Scope here is Contact only, per the fix's own scope.
	describe("Runtime Bearer Token on write operations (issue #30 fix)", () => {
		// The node keeps a module-level location-type cache keyed by baseUrl
		// (see getLocationTypeMap in CiviCrm.node.ts), and every mock credential
		// in this file uses the same "https://mock" baseUrl. Contact create/
		// update always consults that cache (a one-off OptionValue/get lookup,
		// always via the admin credential - it's shared installation metadata,
		// not per-user data, so it is intentionally excluded from the 19 sites
		// fixed for issue #30). Resetting the module per test keeps each test's
		// call-count assertions deterministic regardless of execution order or
		// what other tests in this file touched "contact" create/update first.
		let FreshCiviCrm: any;

		beforeEach(() => {
			jest.resetModules();
			jest.isolateModules(() => {
				// eslint-disable-next-line @typescript-eslint/no-var-requires
				FreshCiviCrm = require("../../dist/src/nodes/CiviCrm/CiviCrm.node").CiviCrm;
			});
		});

		test("Create Contact: uses the runtime JWT as-is on both the create call and the final re-fetch, with no other calls in between", async () => {
			const node = new FreshCiviCrm();

			const ctx = mockExecuteContext(
				[{ json: {} }],
				{
					resource: "contact",
					operation: "create",
					// No email/phone/address supplied and primary-flags off, so the
					// only calls are the (unrelated, admin-credential) location-type
					// lookup, Contact/create, and the final Contact/get - this is what
					// makes "exactly N calls" assertable for a write branch that
					// otherwise also does conditional subentity calls.
					isPrimaryEmail: false,
					isPrimaryPhone: false,
					isPrimaryAddress: false,
					runtimeBearerToken: "runtime.jwt.for.contact-49",
				},
				[
					{ values: [] }, // location-type map lookup (always admin credential, not per-user data)
					{ values: [{ id: 99 }] },
					{ values: [{ id: 99, display_name: "New Contact" }] },
				],
			);

			const result = await node.execute.call(ctx);

			const calls = (ctx.helpers.httpRequest as jest.Mock).mock.calls;
			expect(calls).toHaveLength(3);
			expect(calls[0][0].url).toBe("https://mock/civicrm/ajax/api4/OptionValue/get");
			expect(calls[1][0].url).toBe("https://mock/civicrm/ajax/api4/Contact/create");
			expect(calls[1][0].headers["X-Civi-Auth"]).toBe("Bearer runtime.jwt.for.contact-49");
			expect(calls[1][0].headers.Authorization).toBeUndefined();
			expect(calls[2][0].url).toBe("https://mock/civicrm/ajax/api4/Contact/get");
			expect(calls[2][0].headers["X-Civi-Auth"]).toBe("Bearer runtime.jwt.for.contact-49");
			expect(result[0][0].json).toEqual({ id: 99, display_name: "New Contact" });
		});

		test("Update Contact: uses the runtime JWT as-is on both the update call and the final re-fetch", async () => {
			const node = new FreshCiviCrm();

			const ctx = mockExecuteContext(
				[{ json: {} }],
				{
					resource: "contact",
					operation: "update",
					id: 49,
					runtimeBearerToken: "runtime.jwt.for.contact-49",
				},
				[
					{ values: [] }, // location-type map lookup (admin credential, fresh cache)
					{},
					{ values: [{ id: 49, display_name: "Marketing Test" }] },
				],
			);

			await node.execute.call(ctx);

			const calls = (ctx.helpers.httpRequest as jest.Mock).mock.calls;
			expect(calls).toHaveLength(3);
			expect(calls[0][0].url).toBe("https://mock/civicrm/ajax/api4/OptionValue/get");
			expect(calls[1][0].url).toBe("https://mock/civicrm/ajax/api4/Contact/update");
			expect(calls[1][0].headers["X-Civi-Auth"]).toBe("Bearer runtime.jwt.for.contact-49");
			expect(calls[1][0].headers.Authorization).toBeUndefined();
			expect(calls[2][0].url).toBe("https://mock/civicrm/ajax/api4/Contact/get");
			expect(calls[2][0].headers["X-Civi-Auth"]).toBe("Bearer runtime.jwt.for.contact-49");
		});

		test("Delete Contact: uses the runtime JWT as-is on the single delete call", async () => {
			const node = new FreshCiviCrm();

			const ctx = mockExecuteContext(
				[{ json: {} }],
				{
					resource: "contact",
					operation: "delete",
					id: 49,
					runtimeBearerToken: "runtime.jwt.for.contact-49",
				},
				[{}],
			);

			const result = await node.execute.call(ctx);

			const calls = (ctx.helpers.httpRequest as jest.Mock).mock.calls;
			expect(calls).toHaveLength(1);
			expect(calls[0][0].url).toBe("https://mock/civicrm/ajax/api4/Contact/delete");
			expect(calls[0][0].headers["X-Civi-Auth"]).toBe("Bearer runtime.jwt.for.contact-49");
			expect(calls[0][0].headers.Authorization).toBeUndefined();
			expect(result[0][0].json).toMatchObject({ success: true, deleted_id: 49 });
		});

		test("Create Contact: a permission-denied (empty) response with a runtime JWT throws instead of silently falling back to the admin credential", async () => {
			const node = new FreshCiviCrm();

			const ctx = mockExecuteContext(
				[{ json: {} }],
				{
					resource: "contact",
					operation: "create",
					isPrimaryEmail: false,
					isPrimaryPhone: false,
					isPrimaryAddress: false,
					runtimeBearerToken: "runtime.jwt.for.contact-49",
				},
				[
					{ values: [] }, // location-type map lookup, unrelated to the denial below
					// No `values` in the create response, as CiviCRM returns for a
					// denied create - this must surface as a loud error, never a
					// silent retry with the credential's admin API key.
					{},
				],
			);

			await expect(node.execute.call(ctx)).rejects.toThrow("Failed to create contact.");
			// Location lookup + the single denied create call - no retry, no
			// further calls (e.g. no attempt at the final re-fetch).
			expect(ctx.helpers.httpRequest as jest.Mock).toHaveBeenCalledTimes(2);
			const calls = (ctx.helpers.httpRequest as jest.Mock).mock.calls;
			expect(calls[1][0].url).toBe("https://mock/civicrm/ajax/api4/Contact/create");
			expect(calls[1][0].headers["X-Civi-Auth"]).toBe("Bearer runtime.jwt.for.contact-49");
		});

		test("Update Contact: a 403 error with a runtime JWT during the update call is thrown as-is - NOT retried with the API key, and no further calls (e.g. final re-fetch) happen", async () => {
			const node = new FreshCiviCrm();

			const ctx = mockExecuteContext(
				[{ json: {} }],
				{
					resource: "contact",
					operation: "update",
					id: 49,
					runtimeBearerToken: "runtime.jwt.for.contact-49",
				},
			);
			// The location lookup (1st call) resolves normally; only the 2nd
			// call (the actual update) rejects.
			(ctx.helpers.httpRequest as jest.Mock).mockImplementationOnce(async () => ({ values: [] }));
			(ctx.helpers.httpRequest as jest.Mock).mockRejectedValueOnce(
				Object.assign(new Error("Request failed with status code 403"), {
					response: { status: 403, data: { error_message: "Permission denied" } },
				}),
			);

			await expect(node.execute.call(ctx)).rejects.toThrow();
			expect(ctx.helpers.httpRequest as jest.Mock).toHaveBeenCalledTimes(2);
			const calls = (ctx.helpers.httpRequest as jest.Mock).mock.calls;
			expect(calls[1][0].url).toBe("https://mock/civicrm/ajax/api4/Contact/update");
			expect(calls[1][0].headers["X-Civi-Auth"]).toBe("Bearer runtime.jwt.for.contact-49");
		});

		test("Update Contact: without the runtimeBearerToken parameter, the old admin-credential path still works (regression)", async () => {
			const node = new FreshCiviCrm();

			const ctx = mockExecuteContext(
				[{ json: {} }],
				{
					resource: "contact",
					operation: "update",
					id: 2,
					// runtimeBearerToken intentionally omitted
				},
				[
					{ values: [] }, // location-type map lookup
					{},
					{ values: [{ id: 2, display_name: "Admin Contact" }] },
				],
			);

			await node.execute.call(ctx);

			const calls = (ctx.helpers.httpRequest as jest.Mock).mock.calls;
			expect(calls).toHaveLength(3);
			for (const call of calls) {
				expect(call[0].headers["X-Civi-Auth"]).toBe("Bearer 123");
				expect(call[0].headers.Authorization).toBeUndefined();
			}
		});

		test("Delete Contact: without the runtimeBearerToken parameter, the old admin-credential path still works (regression)", async () => {
			const node = new FreshCiviCrm();

			const ctx = mockExecuteContext(
				[{ json: {} }],
				{
					resource: "contact",
					operation: "delete",
					id: 2,
					// runtimeBearerToken intentionally omitted
				},
				[{}],
			);

			await node.execute.call(ctx);

			const call = (ctx.helpers.httpRequest as jest.Mock).mock.calls[0][0];
			expect(call.headers["X-Civi-Auth"]).toBe("Bearer 123");
			expect(call.headers.Authorization).toBeUndefined();
		});
	});
});
