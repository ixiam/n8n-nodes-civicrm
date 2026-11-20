import { NodeApiError } from "n8n-workflow";

import { CiviCrm } from "../../src/nodes/CiviCrm/CiviCrm.node";
import {
	civiApiError,
	civiErrorDetailsOf,
	extractCiviErrorDetails,
	kindOfFailure,
	redactSecrets,
} from "../../src/nodes/transport/Errors";
import type { HttpMock, ReqOpts } from "../helpers/context";
import { executeContext, httpError, testNode } from "../helpers/context";

const RAW = { resource: "customApi", operation: "raw", customEntity: "Group", customAction: "create", customParamsJson: '{"values":{"title":"x"}}' };

const failing = (error: unknown): HttpMock =>
	jest.fn<Promise<unknown>, [ReqOpts]>(async () => {
		throw error;
	});

async function failedItem(error: unknown, extra: Record<string, unknown> = {}) {
	const ctx = executeContext({ params: { ...RAW, ...extra }, httpRequest: failing(error), continueOnFail: true });
	const [[item]] = await new CiviCrm().execute.call(ctx);
	return item.json as { error: string; civicrm_error?: Record<string, unknown> };
}

async function thrown(error: unknown): Promise<NodeApiError> {
	const ctx = executeContext({ params: RAW, httpRequest: failing(error) });
	return await new CiviCrm().execute.call(ctx).then(
		() => {
			throw new Error("expected the node to fail");
		},
		(e: NodeApiError) => e,
	);
}

describe("civicrm_error in the Continue On Fail item", () => {
	test("500 with a reason: message, category and CiviCRM's fields", async () => {
		const json = await failedItem(httpError(500, { error_code: 0, error_message: "DB Error: already exists", error_id: "QEK1-PHx4-gZSd", status: 500 }));
		expect(json.error).toBe("CiviCRM error: DB Error: already exists");
		expect(json.civicrm_error).toEqual({
			kind: "civicrm_error",
			http_code: "500",
			error_code: 0,
			error_message: "DB Error: already exists",
			error_id: "QEK1-PHx4-gZSd",
			status: 500,
		});
	});

	test("403: permission_denied, with the Error ID of CiviCRM's hidden-detail answer", async () => {
		const json = await failedItem(
			httpError(403, { error_code: "1", error_message: "Sorry an error occurred and your request was not completed. (Error ID: UhVx-jxaN-3NG4)", status: 403 }),
		);
		expect(json.error).toBe("Permission denied by CiviCRM");
		expect(json.civicrm_error).toMatchObject({ kind: "permission_denied", http_code: "403", error_code: "1", error_id: "UhVx-jxaN-3NG4" });
	});

	test("401 from AuthX (plain-text body): auth_rejected with a body excerpt", async () => {
		const json = await failedItem(httpError(401, "HTTP 401 Invalid credential"));
		expect(json.error).toBe("CiviCRM rejected the credential");
		expect(json.civicrm_error).toEqual({ kind: "auth_rejected", http_code: "401", body: "HTTP 401 Invalid credential" });
	});

	test("a 401 that matches no known AuthX message is still auth_rejected", async () => {
		const json = await failedItem(httpError(401, { error_message: "Expired token" }));
		expect(json.error).toBe("CiviCRM error: Expired token");
		expect(json.civicrm_error).toMatchObject({ kind: "auth_rejected", http_code: "401", error_message: "Expired token" });
	});

	test("429 and 503: rate_limited and unavailable", async () => {
		expect((await failedItem(httpError(429, "HTTP 429 API REST request over the quota limit."))).civicrm_error).toMatchObject({ kind: "rate_limited", http_code: "429" });
		expect((await failedItem(httpError(503, "Service Unavailable"))).civicrm_error).toMatchObject({ kind: "unavailable", http_code: "503" });
	});

	test("a JSON body delivered as a string is parsed", async () => {
		const json = await failedItem(httpError(500, JSON.stringify({ error_message: "Invalid field 'x'", error_code: 0 })));
		expect(json.civicrm_error).toMatchObject({ kind: "civicrm_error", error_message: "Invalid field 'x'", error_code: 0 });
	});

	test("debug info: only db_error is kept, never backtrace or SQL; long messages are capped", async () => {
		const json = await failedItem(
			httpError(500, {
				error_message: "x".repeat(5000),
				debug: { db_error: "already exists", sql: ["INSERT INTO civicrm_group ..."], backtrace: ["#0 /var/www/html/x.php(12)"] },
			}),
		);
		expect(json.civicrm_error?.db_error).toBe("already exists");
		expect(String(json.civicrm_error?.error_message).length).toBeLessThanOrEqual(1000);
		expect(JSON.stringify(json)).not.toMatch(/INSERT INTO|x\.php/);
	});

	test("HTML error page: reduced to text, capped", async () => {
		const json = await failedItem(httpError(500, `<html><head><title>Fatal error</title></head><body>${"<p>trace</p>".repeat(500)}</body></html>`));
		expect(json.civicrm_error).toEqual({ kind: "civicrm_error", http_code: "500", body: "Fatal error" });
	});

	test("network error without a response: unavailable, no http_code", async () => {
		const json = await failedItem(Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:8081"), { code: "ECONNREFUSED" }));
		expect(json.civicrm_error).toEqual({ kind: "unavailable" });
	});

	test("errors that never reached CiviCRM (invalid params JSON) keep the plain {error} item", async () => {
		const ctx = executeContext({ params: { ...RAW, customParamsJson: "{not json" }, continueOnFail: true });
		const [[item]] = await new CiviCrm().execute.call(ctx);
		expect(Object.keys(item.json)).toEqual(["error"]);
	});
});

describe("thrown NodeApiError", () => {
	test("keeps the actionable message and HTTP code, and carries the detail in context.civicrm", async () => {
		const error = await thrown(httpError(403, { error_message: "Authorization failed", status: 403 }));
		expect(error.message).toBe("Permission denied by CiviCRM");
		expect(error.httpCode).toBe("403");
		expect(civiErrorDetailsOf(error)).toMatchObject({ kind: "permission_denied", http_code: "403", error_message: "Authorization failed" });
	});

	test("civiApiError returns an existing NodeApiError unchanged", () => {
		const existing = new NodeApiError(testNode, { message: "x" });
		expect(civiApiError(testNode, existing, { url: "https://civi.test", credentialLabel: "API key" })).toBe(existing);
	});
});

describe("credentials never leak", () => {
	// A made-up token with the shape of a JWT, built here so the repository holds no JWT-like literal.
	const b64url = (text: string) => Buffer.from(text, "utf8").toString("base64url");
	const JWT = [b64url('{"alg":"HS256"}'), b64url('{"sub":"cid:2"}'), b64url("signature-value")].join(".");

	test("auth headers in the raw error's request config are not in the item or the thrown error", async () => {
		const raw = Object.assign(httpError(500, { error_message: "boom" }), {
			config: { headers: { "X-Civi-Auth": "Bearer key-1", Authorization: "Bearer key-1", "X-Civi-Key": "site-key-9" } },
			request: { _header: "POST /civicrm/ajax/api4 HTTP/1.1\r\nX-Civi-Auth: Bearer key-1\r\n" },
		});
		const json = await failedItem(raw, {});
		expect(JSON.stringify(json)).not.toContain("key-1");

		const error = await thrown(raw);
		const dump = JSON.stringify({ message: error.message, description: error.description, context: error.context, cause: error.cause, messages: error.messages });
		expect(dump).not.toContain("key-1");
		expect(dump).not.toContain("site-key-9");
	});

	test("secrets echoed by CiviCRM in the body are redacted (API key, site key, runtime JWT)", async () => {
		const ctx = executeContext({
			params: { ...RAW, runtimeBearerToken: JWT },
			credentials: { siteKey: "site-key-9" },
			httpRequest: failing(httpError(500, { error_message: `Bad header Bearer ${JWT} for key-1 with site-key-9 and api_key=abcd1234` })),
			continueOnFail: true,
		});
		const [[item]] = await new CiviCrm().execute.call(ctx);
		const dump = JSON.stringify(item.json);
		expect(dump).not.toContain(JWT);
		expect(dump).not.toContain("key-1");
		expect(dump).not.toContain("site-key-9");
		expect(dump).not.toContain("abcd1234");
		expect(dump).toContain("[REDACTED]");
	});

	test("redactSecrets, extractCiviErrorDetails and kindOfFailure", () => {
		expect(redactSecrets("Authorization: Bearer abc.def-123 and Basic dXNlcjpwYXNz")).toBe("Authorization: Bearer [REDACTED] and Basic [REDACTED]");
		expect(redactSecrets(`token ${JWT}`)).toBe("token [REDACTED_JWT]");
		expect(redactSecrets("my-secret-value here", ["my-secret-value"])).toBe("[REDACTED] here");
		expect(extractCiviErrorDetails(undefined)).toEqual({ kind: "civicrm_error" });
		expect(extractCiviErrorDetails({ statusCode: 403, error: { error_message: "no" } })).toEqual({ kind: "permission_denied", http_code: "403", error_message: "no" });
		expect(kindOfFailure({ status: 400, text: 'Authentication type "jwt" with flow "header" is not allowed' })).toBe("auth_rejected");
		expect(kindOfFailure({ status: 400, text: "SECURITY ALERT: Ajax requests can only be issued by javascript clients" })).toBe("civicrm_error");
		expect(kindOfFailure({ status: 504, text: "" })).toBe("unavailable");
	});
});
