import type { IDataObject, IExecuteFunctions, INodeExecutionData } from "n8n-workflow";

// dist/ has no .d.ts files (see CiviCrm.test.ts), so load via require.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { CiviCrm } = require("../../dist/src/nodes/CiviCrm/CiviCrm.node");
const {
	extractCiviCrmErrorDetails,
	buildCiviCrmApiError,
	redactSecrets,
	// eslint-disable-next-line @typescript-eslint/no-require-imports
} = require("../../dist/src/nodes/transport/GenericFunctions");

// Fixtures assembled at runtime so the source holds no key or token literal for
// secret scanners to flag. Neither is a real credential; the JWT is not signed
// with any key.
const API_KEY = ["sEcReT", "aPiKeY", "-", "1234567890"].join("");
const b64url = (value: string) => Buffer.from(value).toString("base64url");
const RUNTIME_JWT = [
	b64url(JSON.stringify({ alg: "HS256" })),
	b64url(JSON.stringify({ sub: "cid:2", exp: 9999999999 })),
	b64url("signature-not-real"),
].join(".");

/**
 * Shape of the error n8n's `helpers.httpRequest` throws (an AxiosError): the
 * response body is in `response.data` and the request config (with the auth
 * headers!) in `config`.
 */
function axiosLikeError(status: number | undefined, data: unknown, extra: Record<string, unknown> = {}) {
	const err = new Error(
		status ? `Request failed with status code ${status}` : "connect ECONNREFUSED 127.0.0.1:8081",
	) as Error & Record<string, unknown>;
	err.name = "AxiosError";
	err.isAxiosError = true;
	err.config = {
		url: "https://mock/civicrm/ajax/api4/Group/create",
		headers: {
			"X-Civi-Auth": `Bearer ${API_KEY}`,
			Authorization: `Bearer ${RUNTIME_JWT}`,
		},
		data: "params=%7B%7D",
	};
	if (status !== undefined) {
		err.response = {
			status,
			statusText: "Error",
			headers: { "content-type": "application/json" },
			data,
			config: err.config,
		};
	}
	Object.assign(err, extra);
	return err;
}

function ctx(
	error: unknown,
	opts: { continueOnFail?: boolean; params?: Record<string, unknown> } = {},
): IExecuteFunctions {
	const params: Record<string, unknown> = {
		resource: "customApi",
		operation: "raw",
		customEntity: "Group",
		customAction: "create",
		customParamsJson: '{"values":{"title":"Dup"}}',
		...(opts.params ?? {}),
	};
	return {
		getNodeParameter: jest.fn((name: string, _i: number, fallback: unknown) =>
			Object.prototype.hasOwnProperty.call(params, name) ? params[name] : fallback,
		),
		getCredentials: jest.fn(async () => ({ baseUrl: "https://mock", apiToken: API_KEY })),
		helpers: {
			httpRequest: jest.fn(async () => {
				throw error;
			}),
		},
		getInputData: jest.fn(() => [{ json: {} }]),
		addExecutionHints: jest.fn(),
		continueOnFail: jest.fn(() => opts.continueOnFail ?? false),
		getExecutionId: () => "1",
		getNode: () => ({ name: "CiviCRM", type: "CUSTOM.civiCrm", typeVersion: 1, position: [0, 0], parameters: {} }),
	} as unknown as IExecuteFunctions;
}

async function runContinue(error: unknown, params?: Record<string, unknown>): Promise<IDataObject> {
	const result = (await new CiviCrm().execute.call(ctx(error, { continueOnFail: true, params }))) as INodeExecutionData[][];
	expect(result[0]).toHaveLength(1);
	return result[0][0].json;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function runThrow(error: unknown, params?: Record<string, unknown>): Promise<any> {
	try {
		await new CiviCrm().execute.call(ctx(error, { continueOnFail: false, params }));
	} catch (e) {
		return e;
	}
	throw new Error("expected the node to throw");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serializedError(e: any): string {
	return JSON.stringify({
		message: e.message,
		description: e.description,
		messages: e.messages,
		httpCode: e.httpCode,
		context: e.context,
		cause: e.cause,
		errorResponse: e.errorResponse,
		json: typeof e.toJSON === "function" ? e.toJSON() : undefined,
	});
}

const APIV4_500 = {
	error_code: 0,
	error_message: "DB Error: already exists",
	error_id: "abcd-efgh-ijkl",
	status: 500,
};

describe("CiviCRM error details (APIv4 JSON body)", () => {
	test("Continue On Fail: `error` keeps n8n's prefix and adds CiviCRM's error_message; civicrm_error has the detail", async () => {
		const json = await runContinue(axiosLikeError(500, APIV4_500));

		expect(typeof json.error).toBe("string");
		expect(json.error).toBe(
			"The service was not able to process your request | CiviCRM: DB Error: already exists",
		);
		expect(json.civicrm_error).toEqual({
			http_code: "500",
			error_code: 0,
			error_message: "DB Error: already exists",
			error_id: "abcd-efgh-ijkl",
			status: 500,
		});
	});

	test("thrown NodeApiError carries the CiviCRM detail in message and description", async () => {
		const e = await runThrow(axiosLikeError(500, APIV4_500));

		expect(e.constructor.name).toBe("NodeApiError");
		expect(e.httpCode).toBe("500");
		expect(e.message).toBe(
			"The service was not able to process your request | CiviCRM: DB Error: already exists",
		);
		expect(e.description).toBe(
			"CiviCRM APIv4 error (HTTP 500, error_code 0, error_id abcd-efgh-ijkl): DB Error: already exists",
		);
		expect(e.context.civicrm.error_message).toBe("DB Error: already exists");
		expect(e.context.itemIndex).toBe(0);
	});

	test("403 keeps the 'Forbidden' prefix existing consumers match with /^Forbidden/", async () => {
		const json = await runContinue(
			axiosLikeError(403, { error_code: 0, error_message: "Authorization failed", status: 403 }),
		);
		expect(json.error).toMatch(/^Forbidden/);
		expect(json.error).toBe("Forbidden - perhaps check your credentials? | CiviCRM: Authorization failed");
	});

	test("a JSON body delivered as a string is parsed", async () => {
		const json = await runContinue(
			axiosLikeError(
				500,
				JSON.stringify({ error_code: 0, error_message: "Mandatory values missing from Api4 Group::create: title" }),
			),
		);
		expect(json.error).toBe(
			"The service was not able to process your request | CiviCRM: Mandatory values missing from Api4 Group::create: title",
		);
	});

	test("CiviCRM's hidden-detail answer (no 'view debug output') is still exposed with its Error ID", async () => {
		const json = await runContinue(
			axiosLikeError(500, {
				error_id: "Ab12-Cd34-Ef56",
				error_code: "1",
				error_message: "Sorry an error occurred and your request was not completed. (Error ID: Ab12-Cd34-Ef56)",
				status: 500,
			}),
		);
		expect(json.error).toContain("(Error ID: Ab12-Cd34-Ef56)");
		expect((json.civicrm_error as IDataObject).error_id).toBe("Ab12-Cd34-Ef56");
	});

	test("hidden-detail answer without an error_id field (CiviCRM 6.4.x): error_id is taken from the message", async () => {
		const json = await runContinue(
			axiosLikeError(403, {
				error_code: "1",
				error_message: "Sorry an error occurred and your request was not completed. (Error ID: nNMA-aJJN-IleP)",
				status: 403,
			}),
		);
		expect(json.error).toBe(
			"Forbidden - perhaps check your credentials? | CiviCRM: Sorry an error occurred and your request was not completed. (Error ID: nNMA-aJJN-IleP)",
		);
		expect(json.civicrm_error).toEqual({
			http_code: "403",
			error_code: "1",
			error_message: "Sorry an error occurred and your request was not completed. (Error ID: nNMA-aJJN-IleP)",
			error_id: "nNMA-aJJN-IleP",
			status: 403,
		});
	});

	test("debug info: only db_error is kept, never backtrace or SQL; long messages are capped", async () => {
		const longMessage = "x".repeat(5000);
		const json = await runContinue(
			axiosLikeError(500, {
				error_code: -5,
				error_message: longMessage,
				status: 500,
				debug: {
					db_error: "already exists",
					sql: ["INSERT INTO civicrm_group (title) VALUES ('secret data')"],
					backtrace: "#0 /var/www/html/vendor/civicrm/civicrm-core/CRM/Core/DAO.php(123): ...".repeat(200),
				},
			}),
		);
		const civi = json.civicrm_error as IDataObject;
		expect((civi.error_message as string).length).toBeLessThanOrEqual(1000);
		expect(civi.db_error).toBe("already exists");
		const text = JSON.stringify(json);
		expect(text).not.toContain("INSERT INTO");
		expect(text).not.toContain("DAO.php");
		expect(text.length).toBeLessThan(2500);
	});
});

describe("CiviCRM error details (no body / non-JSON body)", () => {
	test("non-JSON HTML body: plain-text excerpt, tags stripped, size capped", async () => {
		const html = `<html><head><style>body{}</style></head><body><h1>502 Bad Gateway</h1><hr><center>nginx</center>${"<p>pad</p>".repeat(500)}</body></html>`;
		const json = await runContinue(axiosLikeError(502, html));

		expect(json.error).toMatch(/^Bad gateway - the service failed to handle your request \| CiviCRM: 502 Bad Gateway nginx/);
		const civi = json.civicrm_error as IDataObject;
		expect(civi.http_code).toBe("502");
		expect(civi.body as string).not.toContain("<");
		expect((civi.body as string).length).toBeLessThanOrEqual(300);
	});

	test("HTTP error with an empty body: generic n8n message only, http_code still exposed", async () => {
		const json = await runContinue(axiosLikeError(500, ""));
		expect(json.error).toBe("The service was not able to process your request");
		expect(json.civicrm_error).toEqual({ http_code: "500" });
	});

	test("network error without any response: unchanged n8n message, no civicrm_error key", async () => {
		const json = await runContinue(axiosLikeError(undefined, undefined, { code: "ECONNREFUSED" }));
		expect(typeof json.error).toBe("string");
		expect(json.error).not.toContain("| CiviCRM:");
		expect(json).not.toHaveProperty("civicrm_error");
		expect(Object.keys(json)).toEqual(["error"]);
	});

	test("non-HTTP errors (invalid params JSON) still produce the plain `{error}` item", async () => {
		const json = await runContinue(new Error("unused"), { customParamsJson: "{not json" });
		expect(json).toEqual({ error: 'Invalid JSON in "Params (JSON)"' });
	});
});

describe("CiviCRM error details never leak credentials", () => {
	test("auth headers in the raw error config are not part of the output item or the thrown error", async () => {
		const err = axiosLikeError(500, APIV4_500);
		const json = await runContinue(err);
		const thrown = await runThrow(axiosLikeError(500, APIV4_500));

		for (const text of [JSON.stringify(json), serializedError(thrown)]) {
			expect(text).not.toContain(API_KEY);
			expect(text).not.toContain(RUNTIME_JWT);
			expect(text).not.toContain("X-Civi-Auth");
			expect(text).not.toContain("Authorization");
		}
		// The raw HTTP error (with its config) is not kept as cause/errorResponse.
		expect(thrown.cause).toBeUndefined();
		expect(JSON.stringify(thrown.errorResponse)).not.toContain("config");
	});

	test("secrets echoed by CiviCRM in the body are redacted (API key, runtime JWT, any Bearer/JWT)", async () => {
		const body = {
			error_code: 0,
			error_message: `Invalid credential ${API_KEY} / Bearer ${RUNTIME_JWT} / other eyJabcdefg.eyJhijklmn.sig123 api_key=zzz999`,
			status: 401,
		};
		const json = await runContinue(axiosLikeError(401, body), { runtimeBearerToken: RUNTIME_JWT });
		const thrown = await runThrow(axiosLikeError(401, body), { runtimeBearerToken: RUNTIME_JWT });

		for (const text of [JSON.stringify(json), serializedError(thrown)]) {
			expect(text).not.toContain(API_KEY);
			expect(text).not.toContain(RUNTIME_JWT);
			expect(text).not.toContain("eyJabcdefg");
			expect(text).not.toContain("zzz999");
		}
		expect(json.error).toMatch(/^Authorization failed - please check your credentials \| CiviCRM: Invalid credential \[REDACTED\]/);
	});

	test("redactSecrets / extractCiviCrmErrorDetails unit behavior", () => {
		expect(redactSecrets(`k=${API_KEY}`, [API_KEY])).toBe("k=[REDACTED]");
		expect(redactSecrets("Basic dXNlcjpwYXNz")).toBe("Basic [REDACTED]");
		expect(extractCiviCrmErrorDetails(null)).toEqual({});
		expect(extractCiviCrmErrorDetails("boom")).toEqual({});
		// request-library style (statusCode + error body)
		expect(
			extractCiviCrmErrorDetails({ statusCode: 500, error: { error_message: "Oops", error_code: 2 } }),
		).toEqual({ http_code: "500", error_message: "Oops", error_code: 2 });
	});

	test("buildCiviCrmApiError returns an existing NodeApiError unchanged", () => {
		const node = { name: "CiviCRM", type: "CUSTOM.civiCrm", typeVersion: 1, position: [0, 0], parameters: {} };
		const first = buildCiviCrmApiError(node, axiosLikeError(500, APIV4_500), [API_KEY]);
		expect(buildCiviCrmApiError(node, first)).toBe(first);
	});
});
