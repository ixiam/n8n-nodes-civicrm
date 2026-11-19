import { CiviCrm } from "../../src/nodes/CiviCrm/CiviCrm.node";
import { buildWhere } from "../../src/nodes/CiviCrm/anyEntity/execute";
import { clearDiscoveryCache } from "../../src/nodes/transport/Discovery";
import { resetJwtState } from "../../src/nodes/transport/JwtAuth";
import type { HttpMock, ReqOpts } from "../helpers/context";
import { callsOf, executeContext, httpError, loadOptionsContext, paramsOf } from "../helpers/context";

const node = new CiviCrm();
const lo = node.methods.loadOptions;
const rm = node.methods.resourceMapping;
const route = (o: ReqOpts) => o.url.split("/civicrm/ajax/api4/")[1];

beforeEach(() => {
	clearDiscoveryCache();
	resetJwtState();
});

describe("parameters", () => {
	test("Any Entity is a resource; run-time-only parameters are hidden for it", () => {
		const props = node.description.properties;
		const resource = props.find((p) => p.name === "resource");
		expect(resource?.options?.map((o) => (o as { value: string }).value)).toContain("anyEntity");
		expect(props.find((p) => p.name === "runtimeBearerToken")?.displayOptions?.hide).toEqual({ resource: ["anyEntity"] });
		expect(props.find((p) => p.name === "baseUrlOverride")?.displayOptions?.hide).toEqual({ resource: ["anyEntity"] });
	});

	test("Any Entity has its own Operation with action labels, so it appears in n8n's node picker", () => {
		const op = node.description.properties.find(
			(p) => p.name === "operation" && (p.displayOptions?.show?.resource as string[] | undefined)?.includes("anyEntity"),
		);
		const options = (op?.options ?? []) as Array<{ value: string; action?: string }>;
		expect(options.map((o) => o.value).sort()).toEqual(["create", "delete", "get", "other", "save", "update"]);
		for (const o of options) expect(o.action).toMatch(/any entity/);
		// The built-in "Fields" collection must not leak into Any Entity create/update.
		const fields = node.description.properties.find((p) => p.name === "fields");
		expect(fields?.displayOptions?.hide).toEqual({ resource: ["anyEntity"] });
	});
});

describe("discovery (load options)", () => {
	const entities = [
		{ name: "Contact", title: "Contact", description: "People and organisations" },
		{ name: "System", title: "System" },
		{ name: "Sendgrid", title: "Sendgrid" },
	];

	test("entities: administrative ones are hidden unless Show Advanced is on", async () => {
		const httpRequest: HttpMock = jest.fn<Promise<unknown>, [ReqOpts]>(async () => ({ values: entities, count: 3, countFetched: 3 }));
		const plain = await lo.getAnyEntities.call(loadOptionsContext({ current: { anyShowAdvanced: false }, httpRequest }));
		expect(plain.map((o) => o.value)).toEqual(["Contact", "Sendgrid"]);
		const advanced = await lo.getAnyEntities.call(loadOptionsContext({ current: { anyShowAdvanced: true }, httpRequest }));
		expect(advanced.map((o) => o.value)).toEqual(["Contact", "Sendgrid", "System"]);
		// Both calls share one cached Entity.get.
		expect(httpRequest).toHaveBeenCalledTimes(1);
	});

	test("entities: pages the rest when the site silently capped the list", async () => {
		const httpRequest: HttpMock = jest.fn(async (o: ReqOpts) =>
			paramsOf(o).offset === 2
				? { values: [entities[2]], count: 3, countFetched: 1 }
				: { values: entities.slice(0, 2), count: 3, countFetched: 2 },
		);
		const out = await lo.getAnyEntities.call(loadOptionsContext({ current: { anyShowAdvanced: true }, httpRequest }));
		expect(out).toHaveLength(3);
		expect(paramsOf(callsOf(httpRequest)[1])).toMatchObject({ limit: 2, offset: 2 });
	});

	test("Other Action lists only non-standard actions: safe extras by default, bulk/admin with Show Advanced, never meta", async () => {
		const actions = ["autocomplete", "checkAccess", "create", "delete", "get", "getActions", "getDuplicates", "getFields", "mergeDuplicates", "replace", "save", "update"];
		const httpRequest: HttpMock = jest.fn<Promise<unknown>, [ReqOpts]>(async () => ({ values: actions.map((name) => ({ name })) }));
		const ctx = loadOptionsContext({ current: { anyEntity: "Contact", anyShowAdvanced: false }, httpRequest });
		const out = await lo.getAnyEntityActions.call(ctx);
		expect(out.map((o) => o.value)).toEqual(["getDuplicates"]);
		expect(out[0].name).toBe("Get Duplicates");

		const adv = await lo.getAnyEntityActions.call(loadOptionsContext({ current: { anyEntity: "Contact", anyShowAdvanced: true }, httpRequest }));
		expect(adv.map((o) => o.value)).toEqual(["autocomplete", "getDuplicates", "mergeDuplicates", "replace"]);
	});

	test("actions/fields return nothing until an entity is chosen, and reject unsafe names", async () => {
		expect(await lo.getAnyEntityActions.call(loadOptionsContext({ current: {} }))).toEqual([]);
		expect(await lo.getAnyEntityFields.call(loadOptionsContext({ current: { anyEntity: "={{ $json.x }}" } }))).toEqual([]);
		await expect(lo.getAnyEntityFields.call(loadOptionsContext({ current: { anyEntity: "Contact/../x" } }))).rejects.toThrow(/Invalid CiviCRM entity name/);
	});

	test("discovery is cached per identity: another API key on the same site asks again", async () => {
		const httpRequest: HttpMock = jest.fn<Promise<unknown>, [ReqOpts]>(async () => ({ values: [{ name: "get" }] }));
		await lo.getAnyEntityActions.call(loadOptionsContext({ current: { anyEntity: "Contact" }, httpRequest }));
		await lo.getAnyEntityActions.call(loadOptionsContext({ current: { anyEntity: "Contact" }, httpRequest }));
		await lo.getAnyEntityActions.call(loadOptionsContext({ current: { anyEntity: "Contact" }, credentials: { apiToken: "key-2" }, httpRequest }));
		expect(httpRequest).toHaveBeenCalledTimes(2);
	});

	test("mapper columns: types, choice lists, required only for create, id matchable", async () => {
		const fields = [
			{ name: "id", title: "ID", data_type: "Integer", readonly: true },
			{ name: "first_name", title: "First Name", data_type: "String", required: true },
			{ name: "gender_id", title: "Gender", data_type: "Integer", options: [{ id: 1, label: "Female" }, { id: 2, label: "Male" }] },
			{ name: "is_deleted", title: "Deleted", data_type: "Boolean" },
			{ name: "birth_date", title: "Birth Date", data_type: "Date" },
			{ name: "preferred_communication_method", title: "Pref", data_type: "String", serialize: 1, options: [{ id: "1", label: "Phone" }] },
		];
		const httpRequest: HttpMock = jest.fn<Promise<unknown>, [ReqOpts]>(async () => ({ values: fields, count: fields.length, countFetched: fields.length }));
		const create = await rm.getAnyEntityMappingColumns.call(loadOptionsContext({ current: { anyEntity: "Contact", operation: "create" }, httpRequest }));
		const byId = Object.fromEntries(create.fields.map((f) => [f.id, f]));
		expect(byId.first_name).toMatchObject({ type: "string", required: true, canBeUsedToMatch: false });
		expect(byId.gender_id).toMatchObject({ type: "options", options: [{ name: "Female", value: 1 }, { name: "Male", value: 2 }] });
		expect(byId.is_deleted.type).toBe("boolean");
		expect(byId.birth_date.type).toBe("dateTime");
		expect(byId.preferred_communication_method.type).toBe("array");
		expect(paramsOf(callsOf(httpRequest)[0])).toMatchObject({ action: "create", loadOptions: ["id", "label"] });

		const update = await rm.getAnyEntityMappingColumns.call(loadOptionsContext({ current: { anyEntity: "Contact", operation: "update" }, httpRequest }));
		const id = update.fields.find((f) => f.id === "id");
		expect(id).toMatchObject({ defaultMatch: true, canBeUsedToMatch: true, readOnly: false, required: false });
	});
});

describe("execution", () => {
	const any = (operation: string, extra: Record<string, unknown> = {}) => ({ resource: "anyEntity", anyEntity: "Tag", operation, ...extra });

	test("get: select, filters (incl. IN and IS NULL), Where (JSON), sort and limit", async () => {
		const httpRequest: HttpMock = jest.fn<Promise<unknown>, [ReqOpts]>(async () => ({ values: [{ id: 1 }, { id: 2 }] }));
		const ctx = executeContext({
			params: any("get", {
				anySelect: ["id", "name"],
				anyFilters: { filter: [
					{ field: "name", operator: "LIKE", value: "n8n%" },
					{ field: "id", operator: "IN", value: "1, 2" },
					{ field: "description", operator: "IS NULL", value: "ignored" },
				] },
				anyOptions: { whereJson: '[["is_selectable","=",true]]' },
				anySort: { sort: [{ field: "name", direction: "DESC" }] },
				anyReturnAll: false,
				anyLimit: 5,
			}),
			httpRequest,
		});
		const out = await node.execute.call(ctx);
		expect(out[0]).toEqual([{ json: { id: 1 }, pairedItem: { item: 0 } }, { json: { id: 2 }, pairedItem: { item: 0 } }]);
		const [call] = callsOf(httpRequest);
		expect(route(call)).toBe("Tag/get");
		expect(paramsOf(call)).toEqual({
			select: ["id", "name"],
			where: [["name", "LIKE", "n8n%"], ["id", "IN", ["1", "2"]], ["description", "IS NULL"], ["is_selectable", "=", true]],
			orderBy: { name: "DESC" },
			limit: 5,
		});
		expect(call.headers["X-Civi-Auth"]).toBe("Bearer key-1");
	});

	test("get with Return All drops to pages of 100 when the site caps rows", async () => {
		const httpRequest: HttpMock = jest.fn(async (o: ReqOpts) => {
			const { limit, offset } = paramsOf(o) as { limit: number; offset: number };
			if (limit > 100) throw httpError(400, "HTTP 400 API REST request over the maximum rows allowed.");
			const total = 150;
			const count = Math.max(0, Math.min(limit, total - offset));
			return { values: Array.from({ length: count }, (_, k) => ({ id: offset + k + 1 })) };
		});
		const ctx = executeContext({ params: any("get", { anyReturnAll: true }), httpRequest });
		const out = await node.execute.call(ctx);
		expect(out[0]).toHaveLength(150);
		expect(callsOf(httpRequest).map((c) => (paramsOf(c) as { limit: number }).limit)).toEqual([500, 100, 100]);
	});

	test("create sends mapped values (unset fields left out)", async () => {
		const httpRequest: HttpMock = jest.fn<Promise<unknown>, [ReqOpts]>(async () => ({ values: [{ id: 7, name: "x" }] }));
		const ctx = executeContext({
			params: any("create", { anyValues: { mappingMode: "defineBelow", value: { name: "x", description: null }, matchingColumns: [], schema: [] } }),
			httpRequest,
		});
		const out = await node.execute.call(ctx);
		expect(paramsOf(callsOf(httpRequest)[0])).toEqual({ values: { name: "x" } });
		expect(out[0][0].json).toEqual({ id: 7, name: "x" });
	});

	test("create with auto-mapping takes only known fields from the input item", async () => {
		const httpRequest: HttpMock = jest.fn<Promise<unknown>, [ReqOpts]>(async () => ({ values: [{ id: 8 }] }));
		const ctx = executeContext({
			params: any("create", {
				anyValues: { mappingMode: "autoMapInputData", value: null, matchingColumns: [], schema: [{ id: "name" }, { id: "gone", removed: true }] },
			}),
			items: [{ json: { name: "auto", gone: "no", other: "no" } }],
			httpRequest,
		});
		await node.execute.call(ctx);
		expect(paramsOf(callsOf(httpRequest)[0])).toEqual({ values: { name: "auto" } });
	});

	test("update matches on the match fields and sends the rest", async () => {
		const httpRequest: HttpMock = jest.fn<Promise<unknown>, [ReqOpts]>(async () => ({ values: [{ id: 3 }] }));
		const ctx = executeContext({
			params: any("update", { anyValues: { mappingMode: "defineBelow", value: { id: 3, name: "new" }, matchingColumns: ["id"], schema: [] } }),
			httpRequest,
		});
		await node.execute.call(ctx);
		expect(paramsOf(callsOf(httpRequest)[0])).toEqual({ values: { name: "new" }, where: [["id", "=", 3]] });
	});

	test("update refuses to run without a value for the match field", async () => {
		const ctx = executeContext({
			params: any("update", { anyValues: { mappingMode: "defineBelow", value: { name: "new" }, matchingColumns: ["id"], schema: [] } }),
		});
		await expect(node.execute.call(ctx)).rejects.toThrow(/match field "id"/);
	});

	test("save passes non-id match fields as APIv4 match", async () => {
		const httpRequest: HttpMock = jest.fn<Promise<unknown>, [ReqOpts]>(async () => ({ values: [{ id: 4 }] }));
		const ctx = executeContext({
			params: any("save", { anyValues: { mappingMode: "defineBelow", value: { name: "k", label: "L" }, matchingColumns: ["name"], schema: [] } }),
			httpRequest,
		});
		await node.execute.call(ctx);
		expect(paramsOf(callsOf(httpRequest)[0])).toEqual({ records: [{ name: "k", label: "L" }], match: ["name"] });
	});

	test("delete by ID, by filters, and never without either", async () => {
		const httpRequest: HttpMock = jest.fn<Promise<unknown>, [ReqOpts]>(async () => ({ values: [{ id: 9 }] }));
		await node.execute.call(executeContext({ params: any("delete", { anyDeleteId: 9 }), httpRequest }));
		expect(paramsOf(callsOf(httpRequest)[0])).toEqual({ where: [["id", "=", 9]] });

		await node.execute.call(executeContext({ params: any("delete", { anyDeleteId: 0, anyFilters: { filter: [{ field: "name", operator: "=", value: "tmp" }] } }), httpRequest }));
		expect(paramsOf(callsOf(httpRequest)[1])).toEqual({ where: [["name", "=", "tmp"]] });

		const empty = executeContext({ params: any("delete", { anyDeleteId: 0 }), httpRequest });
		await expect(node.execute.call(empty)).rejects.toThrow(/Record ID or at least one filter/);
		expect(httpRequest).toHaveBeenCalledTimes(2);
	});

	test("other allowed actions pass Params (JSON) and emit one item per value", async () => {
		const httpRequest: HttpMock = jest.fn<Promise<unknown>, [ReqOpts]>(async () => ({ values: [{ id: 11 }, { id: 12 }] }));
		const ctx = executeContext({
			params: { resource: "anyEntity", anyEntity: "Contact", operation: "other", anyAction: "getDuplicates", anyParamsJson: '{"values":{"email_primary.email":"a@b.c"}}' },
			httpRequest,
		});
		const out = await node.execute.call(ctx);
		expect(route(callsOf(httpRequest)[0])).toBe("Contact/getDuplicates");
		expect(paramsOf(callsOf(httpRequest)[0])).toEqual({ values: { "email_primary.email": "a@b.c" } });
		expect(out[0]).toHaveLength(2);
	});

	test.each([
		["Contact", "mergeDuplicates", /requires "Show Advanced/],
		["Contact", "replace", /requires "Show Advanced/],
		["System", "get", /Entity "System" requires/],
		["Contact", "getFields", /not available in Any Entity/],
		["Contact/../x", "get", /Invalid CiviCRM entity name/],
	])("%s.%s is refused at run time without a request", async (entity, action, message) => {
		const httpRequest: HttpMock = jest.fn<Promise<unknown>, [ReqOpts]>(async () => ({ values: [] }));
		const operation = ["get", "create", "update", "save", "delete"].includes(action) ? action : "other";
		const ctx = executeContext({ params: { resource: "anyEntity", anyEntity: entity, operation, anyAction: action, anyShowAdvanced: false }, httpRequest });
		await expect(node.execute.call(ctx)).rejects.toThrow(message);
		expect(httpRequest).not.toHaveBeenCalled();
	});

	test("n8n's injected Custom API Call operation never runs a request (it belongs to the HTTP Request node)", async () => {
		const httpRequest: HttpMock = jest.fn<Promise<unknown>, [ReqOpts]>(async () => ({ values: [] }));
		for (const resource of ["contact", "anyEntity"]) {
			const ctx = executeContext({ params: { resource, operation: "__CUSTOM_API_CALL__", id: 1 }, httpRequest });
			await expect(node.execute.call(ctx)).rejects.toThrow(/HTTP Request node/);
		}
		expect(httpRequest).not.toHaveBeenCalled();
	});

	test("Show Advanced allows bulk actions", async () => {
		const httpRequest: HttpMock = jest.fn<Promise<unknown>, [ReqOpts]>(async () => ({ values: [] }));
		const ctx = executeContext({
			params: { resource: "anyEntity", anyEntity: "Contact", operation: "other", anyAction: "replace", anyShowAdvanced: true, anyParamsJson: '{"where":[["id","=",1]],"records":[]}' },
			httpRequest,
		});
		await node.execute.call(ctx);
		expect(route(callsOf(httpRequest)[0])).toBe("Contact/replace");
	});

	test("continueOnFail keeps going after a failing item", async () => {
		const httpRequest: HttpMock = jest.fn<Promise<unknown>, [ReqOpts]>(async () => {
			throw httpError(500, { error_message: "Sendgrid API KEY is not defined" });
		});
		const ctx = executeContext({
			params: { resource: "anyEntity", anyEntity: "SendgridDomain", operation: "get", anyLimit: 1 },
			httpRequest,
			continueOnFail: true,
		});
		const out = await node.execute.call(ctx);
		expect(out[0][0].json.error).toMatch(/Sendgrid API KEY is not defined/);
	});
});

describe("buildWhere", () => {
	test("BETWEEN accepts a JSON array; empty field rows are skipped", () => {
		expect(buildWhere([{ field: "id", operator: "BETWEEN", value: "[1,5]" }, { field: "", operator: "=", value: "x" }])).toEqual([["id", "BETWEEN", [1, 5]]]);
	});
});
