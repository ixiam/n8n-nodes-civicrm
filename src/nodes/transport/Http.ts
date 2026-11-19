import type { IExecuteFunctions, ILoadOptionsFunctions } from 'n8n-workflow';
import { sleep } from 'n8n-workflow';

import type { CiviRequestParts } from './Auth';

export interface CiviHttpRequest extends CiviRequestParts {
	url: string;
}

export type CiviSender = (request: CiviHttpRequest) => Promise<unknown>;

export interface CiviHttpFailure {
	status?: number;
	/** Response body as text, or CiviCRM's error_message when the body is JSON. */
	text: string;
	retryAfterSeconds?: number;
}

/** Sender for node contexts (execute, loadOptions, resourceMapping). */
export function senderForContext(ctx: IExecuteFunctions | ILoadOptionsFunctions): CiviSender {
	return async (request) =>
		await ctx.helpers.httpRequest({
			method: 'POST',
			url: request.url,
			headers: request.headers,
			body: request.form,
			json: true,
		});
}

/** Sender for credential tests, which only get the legacy `request` helper. */
export function senderForRequest(
	requestFn: (uriOrObject: string | object, options?: object) => Promise<unknown>,
): CiviSender {
	return async (request) =>
		await requestFn({
			method: 'POST',
			uri: request.url,
			headers: request.headers,
			form: request.form,
			json: true,
		});
}

/** CiviCRM's fatal-error HTML page: keep the message, drop the markup. */
function htmlText(html: string): string {
	const civiMessage = /class="[^"]*crm-error-message[^"]*"[^>]*>([\s\S]*?)<\/div>/i.exec(html)?.[1];
	const source = civiMessage ?? /<title>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? html;
	return source.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300);
}

function bodyText(body: unknown): string {
	if (body === undefined || body === null) return '';
	if (typeof body === 'string') {
		try {
			return bodyText(JSON.parse(body));
		} catch {
			return /^\s*</.test(body) ? htmlText(body) : body.trim();
		}
	}
	if (typeof body === 'object') {
		const message = (body as { error_message?: unknown }).error_message;
		if (typeof message === 'string' && message) return message;
		return JSON.stringify(body);
	}
	return String(body);
}

function headerValue(headers: unknown, name: string): string | undefined {
	if (!headers || typeof headers !== 'object') return undefined;
	for (const [key, value] of Object.entries(headers as Record<string, unknown>)) {
		if (key.toLowerCase() === name) return Array.isArray(value) ? String(value[0]) : String(value);
	}
	return undefined;
}

/** Normalizes errors from httpRequest (axios-like) and request (request-promise-like). */
export function toHttpFailure(error: unknown): CiviHttpFailure {
	const e = (error ?? {}) as {
		message?: string;
		statusCode?: number;
		httpCode?: string | number;
		error?: unknown;
		cause?: unknown;
		response?: { status?: number; statusCode?: number; data?: unknown; body?: unknown; headers?: unknown };
	};
	const response = e.response ?? (e.cause as { response?: typeof e.response } | undefined)?.response;
	const rawStatus = response?.status ?? response?.statusCode ?? e.statusCode ?? e.httpCode;
	const status = rawStatus !== undefined && rawStatus !== null ? Number(rawStatus) : undefined;
	const text = bodyText(response?.data ?? response?.body ?? e.error) || String(e.message ?? '');
	const retryAfter = Number(headerValue(response?.headers, 'retry-after'));
	return {
		status: Number.isFinite(status) ? status : undefined,
		text,
		retryAfterSeconds: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
	};
}

/**
 * Sends once more after a 429 (the guard rejects before the API runs, so any action is safe)
 * or, for read actions only, after a 502/503 from an overloaded server.
 */
export async function sendWithRetry(
	send: CiviSender,
	request: CiviHttpRequest,
	options: { idempotent: boolean },
): Promise<unknown> {
	try {
		return await send(request);
	} catch (error) {
		const failure = toHttpFailure(error);
		const transient = failure.status === 502 || failure.status === 503;
		if (failure.status !== 429 && !(options.idempotent && transient)) throw error;
		const waitSeconds = failure.status === 429 ? Math.min(failure.retryAfterSeconds ?? 1, 10) : 1;
		await sleep(waitSeconds * 1000);
		return await send(request);
	}
}

const READ_ACTION = /^(get[A-Z]?\w*|checkAccess|autocomplete|export|validateChecksum)$/;

/** True for APIv4 actions that only read, judged from the request path's last segment. */
export function isReadOnlyPath(path: string): boolean {
	const action = path.split('?')[0].split('/').filter(Boolean).pop() ?? '';
	return READ_ACTION.test(action);
}
