/**
 * Live tests against a real CiviCRM site. Skipped unless CIVI_IT_URL is set.
 *
 *   CIVI_IT_URL            site root, e.g. http://test01.example
 *   CIVI_IT_ADMIN_KEY      API key of an admin contact
 *   CIVI_IT_ADMIN_USER / CIVI_IT_ADMIN_PASS      CMS login of the same admin
 *   CIVI_IT_LIMITED_KEY    API key of a contact without "generate any authx credential"
 *   CIVI_IT_LIMITED_USER / CIVI_IT_LIMITED_PASS  CMS login of that limited contact
 *
 * Site-key block (optional, skipped unless CIVI_IT_SITE_KEY is set):
 *   CIVI_IT_SITE_KEY       the site's CIVICRM_SITE_KEY
 *   CIVI_IT_SITEKEY_KEY    API key of a contact WITHOUT "authenticate with api key/password"
 *   CIVI_IT_SITEKEY_USER / CIVI_IT_SITEKEY_PASS  CMS login of that contact
 *
 * The site must allow api_key and pass on all three routes and jwt on X-Civi-Auth and
 * Authorization but NOT on _authx (to exercise the JWT refusal path). Runs one request at
 * a time; it creates and then deletes a Tag and a Contact.
 */
import type { IExecuteFunctions, IHttpRequestOptions, ILoadOptionsFunctions, INodeExecutionData } from "n8n-workflow";

import { CiviCrm } from "../../src/nodes/CiviCrm/CiviCrm.node";
import { authenticateRequest } from "../../src/nodes/transport/Auth";
import { clearDiscoveryCache } from "../../src/nodes/transport/Discovery";
import { resetJwtState } from "../../src/nodes/transport/JwtAuth";
import { testNode } from "../helpers/context";

// Connection details come from the environment so no secret is ever committed.
// eslint-disable-next-line @n8n/community-nodes/no-restricted-globals
const env = process.env;
const URL_ = env.CIVI_IT_URL ?? "";
const run = URL_ ? describe : describe.skip;

jest.setTimeout(120000);

/** Minimal stand-in for n8n's httpRequest: form-encoded POST, JSON answer, axios-like errors. */
async function realHttpRequest(opts: { url: string; headers?: Record<string, string>; body?: Record<string, string> }) {
	const res = await fetch(opts.url, {
		method: "POST",
		headers: opts.headers,
		body: new URLSearchParams(opts.body ?? {}).toString(),
	});
	const text = await res.text();
	let data: unknown = text;
	try {
		data = JSON.parse(text);
	} catch {
		// AuthX answers plain text on 401
	}
	if (!res.ok) {
		throw Object.assign(new Error(`Request failed with status code ${res.status}`), {
			response: { status: res.status, data, headers: Object.fromEntries(res.headers.entries()) },
		});
	}
	return data;
}

type Creds = Record<string, unknown>;

const ADMIN_KEY: Creds = { apiToken: env.CIVI_IT_ADMIN_KEY };
const ADMIN_PASS: Creds = { authType: "password", username: env.CIVI_IT_ADMIN_USER, password: env.CIVI_IT_ADMIN_PASS };
const LIMITED_KEY: Creds = { apiToken: env.CIVI_IT_LIMITED_KEY };
const LIMITED_PASS: Creds = { authType: "password", username: env.CIVI_IT_LIMITED_USER, password: env.CIVI_IT_LIMITED_PASS };
const SITE_KEY = env.CIVI_IT_SITE_KEY ?? "";
const SITEKEY_KEY: Creds = { apiToken: env.CIVI_IT_SITEKEY_KEY };
const SITEKEY_PASS: Creds = { authType: "password", username: env.CIVI_IT_SITEKEY_USER, password: env.CIVI_IT_SITEKEY_PASS };
const runSiteKey = URL_ && SITE_KEY ? describe : describe.skip;

function ctx(creds: Creds, params: Record<string, unknown>, items: INodeExecutionData[] = [{ json: {} }]) {
	const hints: Array<{ message: string }> = [];
	const lookup = (name: string): { found: boolean; value: unknown } => {
		if (name in params) return { found: true, value: params[name] };
		let cur: unknown = params;
		for (const part of name.split(".")) {
			if (cur && typeof cur === "object" && part in (cur as Record<string, unknown>)) cur = (cur as Record<string, unknown>)[part];
			else return { found: false, value: undefined };
		}
		return { found: true, value: cur };
	};
	const context = {
		getNodeParameter: (name: string, _i: number, fallback?: unknown) => {
			const hit = lookup(name);
			if (hit.found) return hit.value;
			if (fallback === undefined) throw new Error(`Could not get parameter "${name}"`);
			return fallback;
		},
		getCurrentNodeParameter: (name: string) => lookup(name).value,
		getCredentials: async () => ({ baseUrl: URL_, ...creds }),
		helpers: { httpRequest: realHttpRequest },
		getInputData: () => items,
		addExecutionHints: (h: { message: string }) => hints.push(h),
		continueOnFail: () => false,
		getExecutionId: () => "it",
		getNode: () => testNode,
	};
	return { exec: context as unknown as IExecuteFunctions, load: context as unknown as ILoadOptionsFunctions, hints };
}

const node = new CiviCrm();
const WHOAMI = {
	resource: "customApi",
	operation: "raw",
	customEntity: "Contact",
	customAction: "get",
	customParamsJson: '{"select":["id"],"where":[["id","=","user_contact_id"]]}',
};

async function whoAmI(creds: Creds) {
	const c = ctx(creds, WHOAMI);
	const out = await node.execute.call(c.exec);
	return { id: (out[0][0].json.values as Array<{ id: number }>)[0]?.id, hints: c.hints };
}

let adminId = 0;
let limitedId = 0;

run("live CiviCRM: authentication", () => {
	beforeEach(() => {
		resetJwtState();
		clearDiscoveryCache();
	});

	test("reference identities", async () => {
		adminId = (await whoAmI(ADMIN_KEY)).id;
		limitedId = (await whoAmI(LIMITED_KEY)).id;
		expect(adminId).toBeGreaterThan(0);
		expect(limitedId).toBeGreaterThan(0);
		expect(limitedId).not.toBe(adminId);
	});

	const matrix: Array<[string, Creds, () => number]> = [
		["admin API key", ADMIN_KEY, () => adminId],
		["admin password", ADMIN_PASS, () => adminId],
		["limited API key", LIMITED_KEY, () => limitedId],
		["limited password", LIMITED_PASS, () => limitedId],
	];
	for (const [label, creds, expected] of matrix) {
		for (const flow of ["xheader", "header", "param"]) {
			test(`${label} via ${flow}`, async () => {
				expect((await whoAmI({ ...creds, authFlow: flow })).id).toBe(expected());
			});
		}
	}

	test("credential test hook (authenticate + test request) signs in on every route", async () => {
		for (const flow of ["xheader", "header", "param"]) {
			const req = await authenticateRequest({ ...ADMIN_PASS, authFlow: flow }, {
				baseURL: URL_ + "/",
				url: "/civicrm/ajax/api4/Contact/get",
				method: "POST",
				headers: { "Content-Type": "application/x-www-form-urlencoded" },
				body: { params: JSON.stringify({ select: ["id"], where: [["id", "=", "user_contact_id"]], limit: 1 }) },
			} as IHttpRequestOptions);
			const res = (await realHttpRequest({
				url: `${req.baseURL}${req.url}`,
				headers: req.headers as Record<string, string>,
				body: req.body as Record<string, string>,
			})) as { values: Array<{ id: number }> };
			expect(res.values[0].id).toBe(adminId);
		}
	});

	test("JWT session (admin, X-Civi-Auth and Authorization): no warnings", async () => {
		for (const flow of ["xheader", "header"]) {
			resetJwtState();
			const r = await whoAmI({ ...ADMIN_KEY, authFlow: flow, enableJwtAuth: true, jwtExpiry: 120 });
			expect(r.id).toBe(adminId);
			expect(r.hints).toEqual([]);
		}
	});

	test("JWT on a route that refuses JWTs (_authx): falls back to the key with a clear warning", async () => {
		const r = await whoAmI({ ...ADMIN_PASS, authFlow: "param", enableJwtAuth: true, jwtExpiry: 120 });
		expect(r.id).toBe(adminId);
		expect(r.hints.map((h) => h.message).join(" ")).toMatch(/not allowed/);
	});

	test("JWT for a contact without 'generate any authx credential': falls back with a clear warning", async () => {
		const r = await whoAmI({ ...LIMITED_KEY, enableJwtAuth: true, jwtExpiry: 120 });
		expect(r.id).toBe(limitedId);
		expect(r.hints.map((h) => h.message).join(" ")).toMatch(/generate any authx credential/);
	});

	test("runtime bearer token acts as its own user", async () => {
		const mint = ctx(ADMIN_KEY, {
			resource: "customApi",
			operation: "raw",
			customEntity: "AuthxCredential",
			customAction: "create",
			customParamsJson: JSON.stringify({ contactId: limitedId, ttl: 120 }),
		});
		const cred = ((await node.execute.call(mint.exec))[0][0].json.values as Array<{ cred: string }>)[0].cred;
		const token = cred.replace(/^Bearer /, "");
		const c = ctx(ADMIN_KEY, { ...WHOAMI, runtimeBearerToken: token });
		const out = await node.execute.call(c.exec);
		expect((out[0][0].json.values as Array<{ id: number }>)[0].id).toBe(limitedId);
	});

	test("errors are actionable", async () => {
		await expect(whoAmI({ apiToken: "definitely-wrong" })).rejects.toThrow("CiviCRM rejected the credential");
		// CiviCRM answers a malformed JWT with an HTML error page: only its message is kept.
		const malformed = ctx(ADMIN_KEY, { ...WHOAMI, runtimeBearerToken: "x.y.z" });
		await expect(node.execute.call(malformed.exec)).rejects.toThrow("CiviCRM error: Syntax error, malformed JSON");

		const mint = ctx(ADMIN_KEY, {
			resource: "customApi",
			operation: "raw",
			customEntity: "AuthxCredential",
			customAction: "create",
			customParamsJson: JSON.stringify({ contactId: adminId, ttl: 120 }),
		});
		const token = ((await node.execute.call(mint.exec))[0][0].json.values as Array<{ cred: string }>)[0].cred.replace(/^Bearer /, "");
		const refused = ctx({ ...ADMIN_KEY, authFlow: "param" }, { ...WHOAMI, runtimeBearerToken: token });
		await expect(node.execute.call(refused.exec)).rejects.toThrow("CiviCRM does not accept JWTs sent via the _authx parameter");
	});
});

run("live CiviCRM: Any Entity", () => {
	const lo = node.methods.loadOptions;

	beforeEach(() => clearDiscoveryCache());

	test("discovery lists the site's entities and per-user actions", async () => {
		const entities = await lo.getAnyEntities.call(ctx(ADMIN_KEY, { anyShowAdvanced: false }).load);
		const names = entities.map((e) => e.value);
		expect(names).toEqual(expect.arrayContaining(["Contact", "Tag", "Sendgrid"]));
		expect(names).not.toContain("System");

		const admin = await lo.getAnyEntityActions.call(ctx(ADMIN_KEY, { anyEntity: "Contact", anyShowAdvanced: true }).load);
		const limited = await lo.getAnyEntityActions.call(ctx(LIMITED_KEY, { anyEntity: "Contact", anyShowAdvanced: true }).load);
		expect(admin.length).toBeGreaterThan(limited.length);

		const fields = await lo.getAnyEntityFields.call(ctx(ADMIN_KEY, { anyEntity: "Tag" }).load);
		expect(fields.map((f) => f.value)).toEqual(expect.arrayContaining(["id", "name", "description"]));

		const mapper = await node.methods.resourceMapping.getAnyEntityMappingColumns.call(
			ctx(ADMIN_KEY, { anyEntity: "Contact", operation: "create" }).load,
		);
		expect(mapper.fields.find((f) => f.id === "gender_id")?.type).toBe("options");
	});

	test("Tag lifecycle: create, get with filters, update, save (upsert by name), delete", async () => {
		const name = `n8n-it-${Date.now()}`;
		const base = { resource: "anyEntity", anyEntity: "Tag" };
		const mapped = (value: Record<string, unknown>, matchingColumns: string[] = []) => ({
			mappingMode: "defineBelow",
			value,
			matchingColumns,
			schema: [],
		});

		const created = await node.execute.call(ctx(ADMIN_KEY, { ...base, operation: "create", anyValues: mapped({ name, description: "created" }) }).exec);
		const id = created[0][0].json.id as number;
		expect(id).toBeGreaterThan(0);

		try {
			const got = await node.execute.call(ctx(ADMIN_KEY, {
				...base,
				operation: "get",
				anySelect: ["id", "name", "description"],
				anyFilters: { filter: [{ field: "name", operator: "=", value: name }] },
				anyReturnAll: false,
				anyLimit: 5,
			}).exec);
			expect(got[0].map((r) => r.json)).toEqual([{ id, name, description: "created" }]);

			await node.execute.call(ctx(ADMIN_KEY, { ...base, operation: "update", anyValues: mapped({ id, description: "updated" }, ["id"]) }).exec);
			await node.execute.call(ctx(ADMIN_KEY, { ...base, operation: "save", anyValues: mapped({ name, description: "saved" }, ["name"]) }).exec);

			const after = await node.execute.call(ctx(ADMIN_KEY, {
				...base,
				operation: "get",
				anySelect: ["id", "description"],
				anyFilters: { filter: [{ field: "id", operator: "=", value: String(id) }] },
				anyReturnAll: false,
				anyLimit: 5,
			}).exec);
			expect(after[0].map((r) => r.json)).toEqual([{ id, description: "saved" }]);
		} finally {
			await node.execute.call(ctx(ADMIN_KEY, { ...base, operation: "delete", anyDeleteId: id }).exec);
		}
		const gone = await node.execute.call(ctx(ADMIN_KEY, {
			...base,
			operation: "get",
			anyFilters: { filter: [{ field: "name", operator: "=", value: name }] },
			anyReturnAll: false,
			anyLimit: 5,
		}).exec);
		expect(gone[0]).toEqual([]);
	});

	test("Return All pages through more than 100 rows", async () => {
		const out = await node.execute.call(ctx(ADMIN_KEY, {
			resource: "anyEntity",
			anyEntity: "Country",
			operation: "get",
			anySelect: ["id"],
			anyReturnAll: true,
		}).exec);
		expect(out[0].length).toBeGreaterThan(100);
	});

	test("a safe extra action runs; a hidden bulk action is refused without Show Advanced", async () => {
		const params = { resource: "anyEntity", anyEntity: "Contact", operation: "other", anyAction: "getDuplicates", anyParamsJson: '{"dedupeRule":"IndividualSupervised","values":{"first_name":"Nobody","last_name":"N8n-it"}}' };
		await expect(node.execute.call(ctx(ADMIN_KEY, params).exec)).resolves.toBeDefined();
		await expect(node.execute.call(ctx(ADMIN_KEY, { ...params, operation: "other", anyAction: "replace" }).exec)).rejects.toThrow(/Show Advanced/);
	});
});

run("live CiviCRM: built-in Contact (regression)", () => {
	test("create with email/phone/address on location type Main, get, update, delete", async () => {
		const base = { resource: "contact", isPrimaryEmail: true, isPrimaryPhone: true, isPrimaryAddress: true, emailLocation: "Main", phoneLocation: "Main", addressLocation: "Main", contactType: "Individual" };
		const stamp = Date.now();
		const created = await node.execute.call(ctx(ADMIN_PASS, {
			...base,
			operation: "create",
			fields: { field: [
				{ fieldName: "first_name", fieldValue: "N8n" },
				{ fieldName: "last_name", fieldValue: `It${stamp}` },
				{ fieldName: "email", fieldValue: `it${stamp}@example.com` },
				{ fieldName: "phone", fieldValue: "+34 600 000 000" },
				{ fieldName: "address.city", fieldValue: "Bilbao" },
				{ fieldName: "birth_date", fieldValue: "31/12/1990" },
			] },
		}).exec);
		const contact = created[0][0].json as { id: number; birth_date: string; emails: Array<{ email: string; location_type_id: number }>; phones: unknown[]; addresses: Array<{ city: string }> };
		try {
			expect(contact.id).toBeGreaterThan(0);
			expect(contact.birth_date).toBe("1990-12-31");
			expect(contact.emails[0].email).toBe(`it${stamp}@example.com`);
			expect(contact.phones).toHaveLength(1);
			expect(contact.addresses[0].city).toBe("Bilbao");

			const updated = await node.execute.call(ctx(ADMIN_PASS, {
				...base,
				operation: "update",
				id: contact.id,
				fields: { field: [{ fieldName: "first_name", fieldValue: "Updated" }, { fieldName: "address.city", fieldValue: "Donostia" }] },
			}).exec);
			expect(updated[0][0].json.first_name).toBe("Updated");
			expect((updated[0][0].json.addresses as Array<{ city: string }>)[0].city).toBe("Donostia");
		} finally {
			// The built-in delete moves the contact to the trash; purge it so the site stays clean.
			await node.execute.call(ctx(ADMIN_PASS, { resource: "contact", operation: "delete", id: contact.id }).exec);
			await node.execute.call(ctx(ADMIN_PASS, {
				resource: "customApi",
				operation: "raw",
				customEntity: "Contact",
				customAction: "delete",
				customParamsJson: JSON.stringify({ where: [["id", "=", contact.id], ["is_deleted", "=", true]], useTrash: false }),
			}).exec);
		}
	});
});

runSiteKey("live CiviCRM: site-key guard", () => {
	let siteKeyId = 0;

	beforeEach(() => {
		resetJwtState();
		clearDiscoveryCache();
	});

	test("without the site key, a contact lacking the authenticate permission is refused with a clear message", async () => {
		await expect(whoAmI(SITEKEY_KEY)).rejects.toThrow(/valid Site Key/);
		await expect(whoAmI(SITEKEY_PASS)).rejects.toThrow(/valid Site Key/);
	});

	test("a wrong site key is refused the same way", async () => {
		await expect(whoAmI({ ...SITEKEY_KEY, siteKey: "not-the-site-key" })).rejects.toThrow(/valid Site Key/);
	});

	for (const flow of ["xheader", "header", "param"]) {
		test(`API key + site key via ${flow}`, async () => {
			siteKeyId = (await whoAmI({ ...SITEKEY_KEY, authFlow: flow, siteKey: SITE_KEY })).id;
			expect(siteKeyId).toBeGreaterThan(0);
		});
	}

	test("username/password + site key", async () => {
		expect((await whoAmI({ ...SITEKEY_PASS, authFlow: "header", siteKey: SITE_KEY })).id).toBe(siteKeyId);
	});

	test("credential test hook sends the site key", async () => {
		const req = await authenticateRequest({ ...SITEKEY_KEY, siteKey: SITE_KEY }, {
			baseURL: URL_,
			url: "/civicrm/ajax/api4/Contact/get",
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: { params: JSON.stringify({ select: ["id"], where: [["id", "=", "user_contact_id"]], limit: 1 }) },
		} as IHttpRequestOptions);
		const res = (await realHttpRequest({
			url: `${req.baseURL}${req.url}`,
			headers: req.headers as Record<string, string>,
			body: req.body as Record<string, string>,
		})) as { values: Array<{ id: number }> };
		expect(res.values[0].id).toBe(siteKeyId);
	});

	test("Any Entity discovery and a read work with the site key", async () => {
		const creds = { ...SITEKEY_KEY, siteKey: SITE_KEY };
		const entities = await node.methods.loadOptions.getAnyEntities.call(ctx(creds, { anyShowAdvanced: false }).load);
		expect(entities.map((e) => e.value)).toContain("Contact");
		const out = await node.execute.call(ctx(creds, {
			resource: "anyEntity",
			anyEntity: "Contact",
			operation: "get",
			anySelect: ["id"],
			anyFilters: { filter: [{ field: "id", operator: "=", value: String(siteKeyId) }] },
			anyReturnAll: false,
			anyLimit: 1,
		}).exec);
		expect(out[0].map((r) => r.json)).toEqual([{ id: siteKeyId }]);
	});

	test("sending the site key does not affect contacts that already pass the permission guard", async () => {
		expect((await whoAmI({ ...ADMIN_KEY, siteKey: SITE_KEY })).id).toBe(adminId || (await whoAmI(ADMIN_KEY)).id);
	});
});
