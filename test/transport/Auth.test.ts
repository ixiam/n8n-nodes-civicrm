import type { IHttpRequestOptions } from "n8n-workflow";

import {
	authenticateRequest,
	buildRequestParts,
	credentialValue,
	describeCredential,
	identityKey,
	resolveAuthConfig,
} from "../../src/nodes/transport/Auth";
import { describeCiviFailure, isAuthRejection } from "../../src/nodes/transport/Errors";
import { isReadOnlyPath, toHttpFailure } from "../../src/nodes/transport/Http";
import { httpError } from "../helpers/context";

describe("resolveAuthConfig", () => {
	test("a 3.x credential (no new fields) resolves to API key via X-Civi-Auth", () => {
		const cfg = resolveAuthConfig({ baseUrl: "https://a.example/", apiToken: "k" });
		expect(cfg).toMatchObject({
			baseUrl: "https://a.example",
			authType: "apiKey",
			flow: "xheader",
			tokenFlow: "xheader",
			apiKey: "k",
			siteKey: "",
			jwtEnabled: false,
			jwtTtl: 3600,
		});
	});

	test.each([
		["authorization", "header"],
		["both", "xheader"],
		["xheader", "xheader"],
		["", "xheader"],
	])("legacy jwtHeaderMode %p sends JWTs via %p", (legacy, tokenFlow) => {
		expect(resolveAuthConfig({ apiToken: "k", jwtHeaderMode: legacy }).tokenFlow).toBe(tokenFlow);
	});

	test("an explicit 4.0 route wins over the legacy JWT header mode", () => {
		const cfg = resolveAuthConfig({ apiToken: "k", authFlow: "param", jwtHeaderMode: "authorization" });
		expect(cfg.flow).toBe("param");
		expect(cfg.tokenFlow).toBe("param");
	});

	test("JWT lifetime is clamped to 60..86400 seconds", () => {
		expect(resolveAuthConfig({ jwtExpiry: 5 }).jwtTtl).toBe(60);
		expect(resolveAuthConfig({ jwtExpiry: 999999 }).jwtTtl).toBe(86400);
		expect(resolveAuthConfig({ jwtExpiry: "abc" }).jwtTtl).toBe(3600);
	});
});

describe("credentialValue and buildRequestParts", () => {
	const apiKey = resolveAuthConfig({ apiToken: "k1" });
	const pass = resolveAuthConfig({ authType: "password", username: "mock-admin", password: "mock-pass" });

	test("API key -> Bearer, username/password -> Basic base64(user:pass)", () => {
		expect(credentialValue(apiKey)).toBe("Bearer k1");
		expect(credentialValue(pass)).toBe(`Basic ${Buffer.from("mock-admin:mock-pass").toString("base64")}`);
	});

	test("X-Civi-Auth route", () => {
		const { headers, form } = buildRequestParts(apiKey, "Bearer k1", "xheader", { limit: 1 });
		expect(headers["X-Civi-Auth"]).toBe("Bearer k1");
		expect(headers.Authorization).toBeUndefined();
		expect(headers["X-Requested-With"]).toBe("XMLHttpRequest");
		expect(form).toEqual({ params: '{"limit":1}' });
	});

	test("Authorization route", () => {
		const { headers } = buildRequestParts(apiKey, "Bearer k1", "header", {});
		expect(headers.Authorization).toBe("Bearer k1");
		expect(headers["X-Civi-Auth"]).toBeUndefined();
		expect(headers["X-Requested-With"]).toBe("XMLHttpRequest");
	});

	test("_authx route puts the credential in the POST body, never in a header or the URL", () => {
		const { headers, form } = buildRequestParts(pass, credentialValue(pass), "param", {});
		expect(form._authx).toBe(credentialValue(pass));
		expect(headers["X-Civi-Auth"]).toBeUndefined();
		expect(headers.Authorization).toBeUndefined();
	});

	test("site key is sent as X-Civi-Key on every route", () => {
		const cfg = resolveAuthConfig({ apiToken: "k1", siteKey: " sk " });
		for (const flow of ["xheader", "header", "param"] as const) {
			expect(buildRequestParts(cfg, "Bearer k1", flow, {}).headers["X-Civi-Key"]).toBe("sk");
		}
	});
});

describe("identityKey", () => {
	test("is stable, differs per site and secret, and never contains the secret", () => {
		const a = resolveAuthConfig({ apiToken: "super-secret" });
		const key = identityKey(a, "https://a.example");
		expect(key).toBe(identityKey(a, "https://a.example"));
		expect(key).not.toBe(identityKey(a, "https://b.example"));
		expect(key).not.toBe(identityKey(resolveAuthConfig({ apiToken: "other" }), "https://a.example"));
		expect(key).not.toContain("super-secret");
	});
});

describe("authenticateRequest (credential test hook)", () => {
	const base: IHttpRequestOptions = {
		baseURL: "https://a.example/",
		url: "/civicrm/ajax/api4/Contact/get",
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: { params: "{}" },
	};

	test("applies the configured route and site key, and trims the base URL", async () => {
		const out = await authenticateRequest({ apiToken: "k", authFlow: "header", siteKey: "sk" }, base);
		expect(out.baseURL).toBe("https://a.example");
		expect(out.headers).toMatchObject({ Authorization: "Bearer k", "X-Civi-Key": "sk", "X-Requested-With": "XMLHttpRequest" });
		expect(out.body).toEqual({ params: "{}" });
	});

	test("_authx route adds the credential to the form body", async () => {
		const out = await authenticateRequest({ authType: "password", username: "u", password: "p", authFlow: "param" }, base);
		expect(out.body).toEqual({ params: "{}", _authx: `Basic ${Buffer.from("u:p").toString("base64")}` });
	});

	test("_authx route with the HTTP Request node's legacy `form` body adds the credential there", async () => {
		const legacy = { uri: "https://a.example/civicrm/ajax/api4/Contact/get", method: "POST", form: { params: "{}" } } as unknown as IHttpRequestOptions;
		const out = (await authenticateRequest({ apiToken: "k", authFlow: "param" }, legacy)) as IHttpRequestOptions & { form?: Record<string, string> };
		expect(out.form).toEqual({ params: "{}", _authx: "Bearer k" });
		expect(out.qs).toBeUndefined();
	});

	test("_authx route without any form body falls back to the query string", async () => {
		const out = await authenticateRequest({ apiToken: "k", authFlow: "param" }, { url: "/x", method: "GET" } as IHttpRequestOptions);
		expect(out.qs).toEqual({ _authx: "Bearer k" });
	});

	test("describeCredential names type and route", () => {
		expect(describeCredential(resolveAuthConfig({ authType: "password", authFlow: "param" }))).toBe(
			"username and password via _authx parameter",
		);
	});
});

describe("error mapping (messages as returned by CiviCRM 6.4 / AuthX)", () => {
	const ctx = { url: "https://a.example/civicrm/ajax/api4/Contact/get", credentialLabel: "API key via X-Civi-Auth header" };
	const describe401 = (text: string) => describeCiviFailure({ status: 401, text }, ctx);

	test("credential type not allowed on a route names the AuthX setting to change", () => {
		const d = describe401('HTTP 401 Authentication type "jwt" with flow "xheader" is not allowed for this principal.');
		expect(d.message).toBe("CiviCRM does not accept JWTs sent via the X-Civi-Auth header");
		expect(d.description).toContain('"authx_xheader_cred"');
	});

	test("AuthX guard failure (no permission and no valid site key)", () => {
		const d = describe401("HTTP 401 Login not permitted. Must satisfy guard (site_key, perm).");
		expect(d.message).toContain("valid Site Key");
		expect(d.description).toContain("X-Civi-Key");
	});

	test("invalid credential", () => {
		expect(describe401("HTTP 401 Invalid credential").message).toBe("CiviCRM rejected the credential");
	});

	test("CSRF rejection (credential did not reach CiviCRM)", () => {
		const d = describeCiviFailure(
			{ status: 400, text: "SECURITY ALERT: Ajax requests can only be issued by javascript clients, eg. CRM.api4()." },
			ctx,
		);
		expect(d.message).toBe("CiviCRM treated the request as unauthenticated");
	});

	test("apirestlog row cap and quota", () => {
		expect(describeCiviFailure({ status: 400, text: "HTTP 400 API REST request over the maximum rows allowed." }, ctx).message).toMatch(
			/more rows than the site allows/,
		);
		expect(describeCiviFailure({ status: 429, text: "HTTP 429 API REST request over the quota limit." }, ctx).message).toBe(
			"CiviCRM REST quota reached",
		);
	});

	test("missing entity or action", () => {
		const d = describeCiviFailure(
			{ status: 500, text: "API (NoSuchEntity, getFields) does not exist (or the extension it belongs to is not enabled)." },
			ctx,
		);
		expect(d.message).toBe("Entity or action not available on this CiviCRM site");
	});

	test("404 suggests checking the Base URL", () => {
		expect(describeCiviFailure({ status: 404, text: "" }, ctx).description).toContain('without "/civicrm"');
	});

	test("toHttpFailure reads axios-like and request-like errors", () => {
		expect(toHttpFailure(httpError(401, "HTTP 401 Invalid credential"))).toMatchObject({ status: 401, text: "HTTP 401 Invalid credential" });
		expect(toHttpFailure({ statusCode: 500, error: { error_message: "DB error" } })).toMatchObject({ status: 500, text: "DB error" });
		expect(toHttpFailure(httpError(429, "slow down", { "Retry-After": "7" })).retryAfterSeconds).toBe(7);
	});

	test("isAuthRejection only for authentication refusals", () => {
		expect(isAuthRejection(httpError(401, "HTTP 401 Invalid credential"))).toBe(true);
		expect(isAuthRejection(httpError(500, { error_message: "DB error" }))).toBe(false);
		expect(isAuthRejection(httpError(403, "Permission denied"))).toBe(false);
	});

	test.each([
		["/civicrm/ajax/api4/Contact/get", true],
		["/civicrm/ajax/api4/Contact/getFields", true],
		["/civicrm/ajax/api4/Contact/getDuplicates", true],
		["/civicrm/ajax/api4/Contact/create", false],
		["/civicrm/ajax/api4/Contact/delete", false],
		["/civicrm/ajax/api4/Contact/mergeDuplicates", false],
	])("isReadOnlyPath(%p) = %p", (path, expected) => {
		expect(isReadOnlyPath(path)).toBe(expected);
	});
});
