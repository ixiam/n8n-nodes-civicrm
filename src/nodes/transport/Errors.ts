import type { INode, JsonObject } from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';

import type { AuthFlow } from './Auth';
import { flowLabel } from './Auth';
import type { CiviHttpFailure } from './Http';
import { toHttpFailure } from './Http';

export interface CiviFailureContext {
	/** Full URL that was called. */
	url: string;
	/** What was sent, e.g. "API key via X-Civi-Auth header". */
	credentialLabel: string;
	/** Secret values used for the request (API key, password, site key, JWTs), redacted from every text. */
	secrets?: Array<string | undefined>;
}

/**
 * Stable category of a failure, for workflows that branch on it instead of parsing the message.
 * It follows the HTTP status, except that AuthX refusals are always `auth_rejected`.
 */
export type CiviErrorKind = 'permission_denied' | 'auth_rejected' | 'rate_limited' | 'unavailable' | 'civicrm_error';

export interface CiviFailureDescription {
	message: string;
	description: string;
	kind: CiviErrorKind;
}

/**
 * What CiviCRM answered, reduced to non-sensitive fields. Never contains request headers,
 * credentials, backtraces or SQL; every text is redacted and length-capped.
 */
export interface CiviErrorDetails {
	kind: CiviErrorKind;
	/** HTTP status of CiviCRM's response, as a string ("500", "403"). */
	http_code?: string;
	/** APIv4 `error_code` ("1" when CiviCRM hides the detail). */
	error_code?: string | number;
	/** APIv4 `error_message`: the real reason, or "Sorry an error occurred… (Error ID: X)". */
	error_message?: string;
	/** Reference to look the error up in CiviCRM's log. */
	error_id?: string;
	/** APIv4 `status` echoed in the body. */
	status?: string | number;
	/** `debug.db_error`, only when CiviCRM sends debug info. */
	db_error?: string;
	/** Plain-text excerpt of a non-JSON body (an nginx or PHP error page). */
	body?: string;
}

const MAX_MESSAGE = 1000;
const MAX_BODY_EXCERPT = 300;
const MAX_SHORT_FIELD = 200;

function truncate(text: string, max: number): string {
	return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/**
 * Removes credential-looking content: the secret values in use, any Bearer/Basic token,
 * any JWT-shaped string and `api_key=`/`token=`-style parameters.
 */
export function redactSecrets(text: string, secrets: Array<string | undefined> = []): string {
	let out = String(text);
	for (const secret of secrets) {
		if (typeof secret === 'string' && secret.length >= 4) out = out.split(secret).join('[REDACTED]');
	}
	out = out.replace(/\b(Bearer|Basic)\s+[A-Za-z0-9\-._~+/]+=*/gi, '$1 [REDACTED]');
	out = out.replace(/\beyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]*/g, '[REDACTED_JWT]');
	out = out.replace(/\b(api_?key|token|password|passwd|secret|jwt|_authx)=([^&\s"']+)/gi, '$1=[REDACTED]');
	return out;
}

function cleanText(value: unknown, max: number, secrets: Array<string | undefined>): string | undefined {
	if (typeof value !== 'string' && typeof value !== 'number') return undefined;
	const text = String(value).trim();
	return text ? truncate(redactSecrets(text, secrets), max) : undefined;
}

type Loose = Record<string, unknown>;
const asObject = (value: unknown): Loose | undefined =>
	value && typeof value === 'object' && !Array.isArray(value) ? (value as Loose) : undefined;

const NETWORK_CODE = /^(ECONNREFUSED|ECONNRESET|ECONNABORTED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|EHOSTUNREACH|ENETUNREACH|EPIPE)$/;

/** The failure's category: AuthX refusals first, then the HTTP status, then network errors. */
export function kindOfFailure(failure: CiviHttpFailure, networkCode?: string): CiviErrorKind {
	const { status, text } = failure;
	if (status === 401 || /is not allowed|Must satisfy guard|Invalid credential/i.test(text)) return 'auth_rejected';
	if (status === 403) return 'permission_denied';
	if (status === 429 || /over the quota limit/i.test(text)) return 'rate_limited';
	if (status === 502 || status === 503 || status === 504) return 'unavailable';
	if (status === undefined && networkCode && NETWORK_CODE.test(networkCode)) return 'unavailable';
	return 'civicrm_error';
}

/**
 * Extracts the sanitized detail of a failed call from an HTTP-client error (axios-style
 * `error.response.{status,data}`, request-style `error.{statusCode,error}`, or under `error.cause`).
 */
export function extractCiviErrorDetails(error: unknown, secrets: Array<string | undefined> = []): CiviErrorDetails {
	const failure = toHttpFailure(error);
	const e = asObject(error) ?? {};
	const cause = asObject(e.cause);
	const response = asObject(e.response) ?? asObject(cause?.response);
	const code = typeof e.code === 'string' ? e.code : typeof cause?.code === 'string' ? cause.code : undefined;
	const details: CiviErrorDetails = { kind: kindOfFailure(failure, code) };
	if (failure.status !== undefined) details.http_code = String(failure.status);

	let data: unknown = response?.data ?? response?.body ?? (response ? undefined : e.error);
	if (Buffer.isBuffer(data)) data = data.toString('utf8');
	if (typeof data === 'string') {
		const trimmed = data.trim();
		data = trimmed;
		if (trimmed.startsWith('{')) {
			try {
				data = JSON.parse(trimmed);
			} catch {
				// Not JSON: kept as text and reported as a body excerpt.
			}
		}
	}

	const body = asObject(data);
	if (body) {
		const nested = asObject(body.error);
		const message =
			cleanText(body.error_message, MAX_MESSAGE, secrets) ??
			cleanText(body.message, MAX_MESSAGE, secrets) ??
			cleanText(typeof body.error === 'string' ? body.error : nested?.message, MAX_MESSAGE, secrets);
		if (message) details.error_message = message;

		const errorCode = typeof body.error_code === 'number' ? body.error_code : cleanText(body.error_code, MAX_SHORT_FIELD, secrets);
		if (errorCode !== undefined) details.error_code = errorCode;

		// Without "view debug output" CiviCRM only says "Sorry an error occurred… (Error ID: X)" and,
		// depending on its version, sends no `error_id` field: take the reference from the message.
		const errorId =
			cleanText(body.error_id, MAX_SHORT_FIELD, secrets) ??
			/\(Error ID: ([A-Za-z0-9-]{4,64})\)/.exec(details.error_message ?? '')?.[1];
		if (errorId) details.error_id = errorId;

		const status = typeof body.status === 'number' ? body.status : cleanText(body.status, MAX_SHORT_FIELD, secrets);
		if (status !== undefined) details.status = status;

		const dbError = cleanText(asObject(body.debug)?.db_error, MAX_SHORT_FIELD, secrets);
		if (dbError) details.db_error = dbError;
	} else if (typeof data === 'string' && data && failure.text) {
		// toHttpFailure already reduced an HTML error page to its message.
		details.body = truncate(redactSecrets(failure.text, secrets), MAX_BODY_EXCERPT);
	}
	return details;
}

const CRED_LABELS: Record<string, string> = {
	api_key: 'API keys',
	pass: 'usernames and passwords',
	jwt: 'JWTs',
};

/** Turns a CiviCRM/AuthX failure into a message that says what to change. */
export function describeCiviFailure(
	failure: CiviHttpFailure,
	context: CiviFailureContext,
): CiviFailureDescription {
	return { ...describe(failure, context), kind: kindOfFailure(failure) };
}

function describe(failure: CiviHttpFailure, context: CiviFailureContext): Omit<CiviFailureDescription, 'kind'> {
	const { status, text } = failure;

	const notAllowed = /Authentication type "(\w+)" with flow "(\w+)" is not allowed/.exec(text);
	if (notAllowed) {
		const [, cred, flow] = notAllowed;
		const route = ['xheader', 'header', 'param'].includes(flow) ? flowLabel(flow as AuthFlow) : flow;
		return {
			message: `CiviCRM does not accept ${CRED_LABELS[cred] ?? cred} sent via the ${route}`,
			description: `Add "${cred}" to the AuthX setting "authx_${flow}_cred" (CiviCRM: Administer > System Settings > Authentication), or choose another "Send Credentials Via" option in the credential. Sent: ${context.credentialLabel}.`,
		};
	}
	if (/Must satisfy guard/i.test(text)) {
		return {
			message: 'CiviCRM needs a valid Site Key or an "authenticate with …" permission for this contact',
			description: `The credential is valid but the contact passes none of the AuthX guards: it lacks the "authenticate with api key" / "authenticate with password" permission and no valid Site Key (X-Civi-Key) was sent. Add the site key (CIVICRM_SITE_KEY) to the credential or grant the permission. Sent: ${context.credentialLabel}.`,
		};
	}
	if (/Invalid credential/i.test(text)) {
		return {
			message: 'CiviCRM rejected the credential',
			description: `Check the API key or username and password (${context.credentialLabel}). The contact also needs the "authenticate with api key" or "authenticate with password" permission, or a valid Site Key when the site relies on the site-key guard.`,
		};
	}
	if (/SECURITY ALERT/i.test(text)) {
		return {
			message: 'CiviCRM treated the request as unauthenticated',
			description: `The credential did not reach CiviCRM (${context.credentialLabel}). A proxy may be stripping the header; try another "Send Credentials Via" option.`,
		};
	}
	if (/maximum rows allowed/i.test(text)) {
		return {
			message: 'The request asks for more rows than the site allows per call',
			description: 'The site limits rows per REST call (apirestlog guard). Use a Limit of 100 or less, or ask an administrator to raise "apirestlogguard_maxrows".',
		};
	}
	if (status === 429 || /over the quota limit/i.test(text)) {
		return {
			message: 'CiviCRM REST quota reached',
			description: 'The site limits REST calls per minute (apirestlog guard). Try again later or ask an administrator to raise the quota.',
		};
	}
	if (/does not exist/i.test(text) && /(Api |API \()/.test(text)) {
		return {
			message: 'Entity or action not available on this CiviCRM site',
			description: `${text} The entity may belong to an extension that is disabled, or the action may not exist for this entity.`,
		};
	}
	if (status === 404) {
		return {
			message: 'CiviCRM API endpoint not found',
			description: `Check that the Base URL is the site root (for example https://crm.example.org), without "/civicrm". Requested: ${context.url}`,
		};
	}
	if (status === 403) {
		return {
			message: 'Permission denied by CiviCRM',
			description: `The authenticated contact lacks permission for this call. ${text}`.trim(),
		};
	}
	if (status === 502 || status === 503) {
		return {
			message: 'CiviCRM server unavailable',
			description: `The site answered ${status}; it may be overloaded by parallel requests. ${text}`.trim(),
		};
	}
	return {
		message: text ? `CiviCRM error: ${text}` : 'CiviCRM request failed',
		description: `Request: ${context.url} (${context.credentialLabel})`,
	};
}

/**
 * Builds the NodeApiError for a failed call.
 *
 * - `message` / `description`: what to change, from `describeCiviFailure`.
 * - `context.civicrm`: the sanitized `CiviErrorDetails`; the node copies it to `civicrm_error`
 *   in the Continue On Fail output item.
 *
 * The raw HTTP error never reaches NodeApiError: it carries the request configuration, which
 * includes the authentication headers. Only a redacted plain object is attached.
 */
export function civiApiError(
	node: INode,
	error: unknown,
	context: CiviFailureContext,
	itemIndex?: number,
): NodeApiError {
	if (error instanceof NodeApiError) return error;
	const secrets = context.secrets ?? [];
	const raw = toHttpFailure(error);
	const failure: CiviHttpFailure = { ...raw, text: truncate(redactSecrets(raw.text, secrets), MAX_MESSAGE) };
	const details = extractCiviErrorDetails(error, secrets);
	const { message, description } = describeCiviFailure(failure, context);

	const source = (error && typeof error === 'object' ? error : {}) as { message?: unknown; code?: unknown };
	const sanitized: JsonObject = {
		message: truncate(redactSecrets(String(source.message ?? failure.text ?? ''), secrets), MAX_SHORT_FIELD),
	};
	if (typeof source.code === 'string' && /^[A-Z0-9_]{2,40}$/.test(source.code)) sanitized.code = source.code;

	const apiError = new NodeApiError(node, sanitized, {
		message,
		description,
		httpCode: failure.status !== undefined ? String(failure.status) : undefined,
		itemIndex,
	});
	apiError.context.civicrm = { ...details } as unknown as JsonObject;
	return apiError;
}

/** The sanitized CiviCRM detail attached by `civiApiError`, if this error has one. */
export function civiErrorDetailsOf(error: unknown): CiviErrorDetails | undefined {
	// Duck-typed (not `instanceof NodeApiError`): n8n-workflow can be loaded twice in a dev checkout.
	const context = error && typeof error === 'object' ? (error as { context?: { civicrm?: unknown } }).context : undefined;
	const details = context?.civicrm;
	return details && typeof details === 'object' ? (details as CiviErrorDetails) : undefined;
}

/** True when CiviCRM refused the request at authentication, before running it. */
export function isAuthRejection(error: unknown): boolean {
	const failure = toHttpFailure(error);
	return failure.status === 401 || /Invalid credential|is not allowed for this principal/i.test(failure.text);
}

export function isMaxRowsError(error: unknown): boolean {
	const e = error as { message?: string; description?: string } | undefined;
	return /maximum rows|more rows than the site allows/i.test(
		`${e?.message ?? ''} ${e?.description ?? ''} ${toHttpFailure(error).text}`,
	);
}
