import { CiviCrm } from "../../src/nodes/CiviCrm/CiviCrm.node";
import { resetJwtState } from "../../src/nodes/transport/JwtAuth";
import type { HttpMock, ReqOpts } from "../helpers/context";
import { callsOf, executeContext, httpError, paramsOf } from "../helpers/context";

const RAW = { resource: "customApi", operation: "raw", customEntity: "Contact", customAction: "get", customParamsJson: "{}" };
const basic = (u: string, p: string) => `Basic ${Buffer.from(`${u}:${p}`).toString("base64")}`;
const isWhoAmI = (o: ReqOpts) => o.url.endsWith("/Contact/get") && (paramsOf(o).where as unknown[][] | undefined)?.[0]?.[2] === "user_contact_id";

beforeEach(() => resetJwtState());

describe("credential types and routes", () => {
	test("username/password via _authx: Basic credential in the POST body, no auth header", async () => {
		const httpRequest: HttpMock = jest.fn<Promise<unknown>, [ReqOpts]>(async () => ({ values: [] }));
		const ctx = executeContext({
			params: RAW,
			credentials: { authType: "password", username: "mock-admin", password: "mock-pass", authFlow: "param" },
			httpRequest,
		});
		await new CiviCrm().execute.call(ctx);
		const [call] = callsOf(httpRequest);
		expect(call.body._authx).toBe(basic("mock-admin", "mock-pass"));
		expect(call.headers["X-Civi-Auth"]).toBeUndefined();
		expect(call.headers.Authorization).toBeUndefined();
		expect(call.headers["X-Requested-With"]).toBe("XMLHttpRequest");
	});

	test("API key via Authorization header also sends X-Requested-With (needed by CiviCRM's CSRF check)", async () => {
		const httpRequest: HttpMock = jest.fn<Promise<unknown>, [ReqOpts]>(async () => ({ values: [] }));
		const ctx = executeContext({ params: RAW, credentials: { authFlow: "header" }, httpRequest });
		await new CiviCrm().execute.call(ctx);
		const [call] = callsOf(httpRequest);
		expect(call.headers.Authorization).toBe("Bearer key-1");
		expect(call.headers["X-Requested-With"]).toBe("XMLHttpRequest");
	});

	test("site key is sent as X-Civi-Key", async () => {
		const httpRequest: HttpMock = jest.fn<Promise<unknown>, [ReqOpts]>(async () => ({ values: [] }));
		const ctx = executeContext({ params: RAW, credentials: { siteKey: "the-site-key" }, httpRequest });
		await new CiviCrm().execute.call(ctx);
		expect(callsOf(httpRequest)[0].headers["X-Civi-Key"]).toBe("the-site-key");
	});

	test("runtime bearer token follows the credential route (_authx)", async () => {
		const httpRequest: HttpMock = jest.fn<Promise<unknown>, [ReqOpts]>(async () => ({ values: [] }));
		const ctx = executeContext({ params: { ...RAW, runtimeBearerToken: "user.jwt" }, credentials: { authFlow: "param" }, httpRequest });
		await new CiviCrm().execute.call(ctx);
		const [call] = callsOf(httpRequest);
		expect(call.body._authx).toBe("Bearer user.jwt");
		expect(callsOf(httpRequest)).toHaveLength(1);
	});
});

describe("JWT sessions", () => {
	test("password credential: identify contact and mint with Basic, then use the JWT; the token is reused", async () => {
		const httpRequest: HttpMock = jest.fn(async (o: ReqOpts) => {
			if (isWhoAmI(o)) return { values: [{ id: 2 }] };
			if (o.url.endsWith("/AuthxCredential/create")) return { values: [{ cred: "Bearer jwt-2" }] };
			return { values: [{ id: 10 }] };
		});
		const ctx = executeContext({
			params: RAW,
			perItem: [{}, {}],
			credentials: { authType: "password", username: "root", password: "pw", enableJwtAuth: true, jwtExpiry: 600 },
			httpRequest,
		});
		await new CiviCrm().execute.call(ctx);

		const calls = callsOf(httpRequest);
		expect(calls.map((c) => c.url.split("/api4/")[1])).toEqual(["Contact/get", "AuthxCredential/create", "Contact/get", "Contact/get"]);
		expect(calls[0].headers["X-Civi-Auth"]).toBe(basic("root", "pw"));
		expect(calls[1].headers["X-Civi-Auth"]).toBe(basic("root", "pw"));
		expect(paramsOf(calls[1])).toEqual({ contactId: 2, ttl: 600 });
		expect(calls[2].headers["X-Civi-Auth"]).toBe("Bearer jwt-2");
		expect(calls[3].headers["X-Civi-Auth"]).toBe("Bearer jwt-2");
		// The API key search of 3.x never happens: no secret inside request params.
		for (const c of calls) expect(c.body.params).not.toContain("pw");
	});

	test("a refused mint warns once, uses the stored credential, and pauses JWT for the next calls", async () => {
		const httpRequest: HttpMock = jest.fn(async (o: ReqOpts) => {
			if (isWhoAmI(o)) return { values: [{ id: 4 }] };
			if (o.url.endsWith("/AuthxCredential/create")) throw httpError(403, { error_message: "Permission denied" });
			return { values: [] };
		});
		const ctx = executeContext({ params: RAW, perItem: [{}, {}], credentials: { enableJwtAuth: true }, httpRequest });
		await new CiviCrm().execute.call(ctx);

		const mints = callsOf(httpRequest).filter((c) => c.url.endsWith("/AuthxCredential/create"));
		expect(mints).toHaveLength(1);
		const data = callsOf(httpRequest).filter((c) => !isWhoAmI(c) && !c.url.endsWith("/AuthxCredential/create"));
		expect(data.map((c) => c.headers["X-Civi-Auth"])).toEqual(["Bearer key-1", "Bearer key-1"]);
		expect(ctx.addExecutionHints).toHaveBeenCalledWith(
			expect.objectContaining({ type: "warning", message: expect.stringContaining("generate any authx credential") }),
		);
	});
});

describe("retries", () => {
	test("429 with Retry-After is retried once, also for writes (the guard rejects before the API runs)", async () => {
		let n = 0;
		const httpRequest: HttpMock = jest.fn<Promise<unknown>, [ReqOpts]>(async () => {
			n += 1;
			if (n === 1) throw httpError(429, "HTTP 429 API REST request over the quota limit.", { "retry-after": "1" });
			return { values: [{ id: 1 }] };
		});
		const ctx = executeContext({ params: { ...RAW, customAction: "create", customParamsJson: '{"values":{}}' }, httpRequest });
		await new CiviCrm().execute.call(ctx);
		expect(httpRequest).toHaveBeenCalledTimes(2);
	});

	test("502 is retried once for reads", async () => {
		let n = 0;
		const httpRequest: HttpMock = jest.fn<Promise<unknown>, [ReqOpts]>(async () => {
			n += 1;
			if (n === 1) throw httpError(502, "Bad Gateway");
			return { values: [] };
		});
		await new CiviCrm().execute.call(executeContext({ params: RAW, httpRequest }));
		expect(httpRequest).toHaveBeenCalledTimes(2);
	});

	test("502 on a write is reported, never re-sent", async () => {
		const httpRequest: HttpMock = jest.fn<Promise<unknown>, [ReqOpts]>(async () => {
			throw httpError(502, "Bad Gateway");
		});
		const ctx = executeContext({ params: { ...RAW, customAction: "create", customParamsJson: '{"values":{}}' }, httpRequest });
		await expect(new CiviCrm().execute.call(ctx)).rejects.toThrow("CiviCRM server unavailable");
		expect(httpRequest).toHaveBeenCalledTimes(1);
	});
});

describe("input validation and error messages", () => {
	test.each(["Contact/../../user", "Contact?x=1", "Con tact", ""])("Custom API Call rejects entity name %p before any request", async (name) => {
		const httpRequest: HttpMock = jest.fn<Promise<unknown>, [ReqOpts]>(async () => ({ values: [] }));
		const ctx = executeContext({ params: { ...RAW, customEntity: name }, httpRequest });
		await expect(new CiviCrm().execute.call(ctx)).rejects.toThrow(/Invalid CiviCRM entity name/);
		expect(httpRequest).not.toHaveBeenCalled();
	});

	test("an AuthX refusal surfaces as an actionable NodeApiError", async () => {
		const httpRequest: HttpMock = jest.fn<Promise<unknown>, [ReqOpts]>(async () => {
			throw httpError(401, 'HTTP 401 Authentication type "api_key" with flow "header" is not allowed for this principal.');
		});
		const ctx = executeContext({ params: RAW, credentials: { authFlow: "header" }, httpRequest });
		const error = await new CiviCrm().execute.call(ctx).catch((e: Error & { description?: string }) => e);
		expect((error as Error).message).toBe("CiviCRM does not accept API keys sent via the Authorization header");
		expect((error as { description?: string }).description).toContain("authx_header_cred");
	});
});
