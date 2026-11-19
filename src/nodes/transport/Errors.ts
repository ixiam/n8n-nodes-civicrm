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
}

export interface CiviFailureDescription {
	message: string;
	description: string;
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

export function civiApiError(
	node: INode,
	error: unknown,
	context: CiviFailureContext,
	itemIndex?: number,
): NodeApiError {
	if (error instanceof NodeApiError) return error;
	const failure = toHttpFailure(error);
	const { message, description } = describeCiviFailure(failure, context);
	return new NodeApiError(node, (error ?? {}) as JsonObject, {
		message,
		description,
		httpCode: failure.status !== undefined ? String(failure.status) : undefined,
		itemIndex,
	});
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
