import type { IExecuteFunctions, ILoadOptionsFunctions } from 'n8n-workflow';

interface ServerIssuedJwt {
	token: string;
	expiresAt: number;
}

const serverIssuedCache: Record<string, ServerIssuedJwt> = {};
const contactIdCache: Record<string, number> = {}; // Cache resolved contact IDs

export function isJwtAuthEnabled(credentials: any): boolean {
	return credentials?.enableJwtAuth === true;
}

/**
 * Resolve the current authenticated user's contact ID from Contact/get.
 * Finds the contact that owns the given api_key.
 * Cached to avoid repeated lookups.
 * Returns undefined if resolution fails (allowing caller to handle gracefully).
 */
export async function resolveContactId(
	context: IExecuteFunctions | ILoadOptionsFunctions,
	baseUrl: string,
	apiToken: string,
): Promise<number | undefined> {
	const cacheKey = `${baseUrl}:${apiToken}`;
	if (contactIdCache[cacheKey]) {
		return contactIdCache[cacheKey];
	}

	try {
		const response = await context.helpers.httpRequest.call(context, {
			method: 'POST',
			url: `${baseUrl}/civicrm/ajax/api4/Contact/get`,
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
				'X-Civi-Auth': `Bearer ${apiToken}`,
			},
			body: {
				params: JSON.stringify({
					select: ['id'],
					where: [['api_key', '=', apiToken]],
					limit: 1,
				}),
			},
			json: true,
		});

		const contacts = (response as { values?: Array<{ id: number }> })?.values || [];
		if (contacts.length === 0) {
			console.warn(
				'[CiviCRM] Contact/get found no contact with this api_key - JWT auto-resolve will be skipped',
			);
			return undefined;
		}

		const contactId = contacts[0].id;
		contactIdCache[cacheKey] = contactId;
		return contactId;
	} catch (error) {
		const errorMsg = (error as any)?.message || String(error);
		console.warn(
			`[CiviCRM] Failed to auto-resolve contact ID: ${errorMsg}. Will attempt API key fallback.`,
		);
		return undefined;
	}
}

/**
 * Fetch JWT from CiviCRM AuthxCredential/create using API key.
 * If contactId is 0 or undefined, automatically resolves it from Contact/get.
 * CiviCRM signs and issues the JWT, guaranteeing AuthX compatibility.
 * Returns undefined if JWT generation fails or permission denied, allowing fallback to API key.
 */
export async function getServerIssuedJwt(
	context: IExecuteFunctions | ILoadOptionsFunctions,
	baseUrl: string,
	apiToken: string,
	contactId: number = 0,
	ttl: number = 3600,
): Promise<string | undefined> {
	// Auto-resolve contact ID if not provided
	let resolvedContactId = contactId;
	if (resolvedContactId === 0 || resolvedContactId === undefined) {
		const resolved = await resolveContactId(context, baseUrl, apiToken);
		if (!resolved) {
			// Auto-resolve failed, can't generate JWT
			return undefined;
		}
		resolvedContactId = resolved;
	}

	const cacheKey = `${baseUrl}:${resolvedContactId}:${ttl}`;
	const now = Date.now();
	const cached = serverIssuedCache[cacheKey];

	// Return cached token if still valid (with 30s buffer)
	if (cached && cached.expiresAt > now + 30000) {
		return cached.token;
	}

	try {
		const response = await context.helpers.httpRequest.call(context, {
			method: 'POST',
			url: `${baseUrl}/civicrm/ajax/api4/AuthxCredential/create`,
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
				'X-Civi-Auth': `Bearer ${apiToken}`,
			},
			body: {
				params: JSON.stringify({
					contactId: resolvedContactId,
					ttl: ttl,
				}),
			},
			json: true,
		});

		const cred = (response as { values?: Array<{ cred: string }> })?.values?.[0]?.cred || '';
		if (!cred.startsWith('Bearer ')) {
			console.warn('[CiviCRM] Invalid JWT response: missing Bearer token');
			return undefined;
		}

		const token = cred.substring(7); // Remove "Bearer " prefix
		serverIssuedCache[cacheKey] = { token, expiresAt: now + ttl * 1000 };

		return token;
	} catch (error) {
		const errorMsg = (error as any)?.message || String(error);
		const isPermissionDenied = errorMsg.includes('Authorization failed') || errorMsg.includes('403') || errorMsg.includes('Permission denied');

		if (isPermissionDenied) {
			// User lacks permissions for JWT. Fall back to API key auth.
			console.warn(
				`[CiviCRM JWT] User lacks permissions for AuthxCredential/create. Will use API key authentication instead.`,
			);
			return undefined;
		}

		console.warn(`[CiviCRM JWT] Failed to obtain JWT: ${errorMsg}. Falling back to API key.`);
		return undefined;
	}
}
