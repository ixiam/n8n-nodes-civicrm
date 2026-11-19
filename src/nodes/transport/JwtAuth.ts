import type { CiviAuthConfig } from './Auth';
import { buildRequestParts, credentialValue } from './Auth';
import type { CiviSender } from './Http';
import { sendWithRetry } from './Http';

interface CachedJwt {
	token: string;
	expiresAt: number;
}

const SUSPEND_MS = 15 * 60 * 1000;
const RENEW_MARGIN_MS = 30 * 1000;

const tokenCache = new Map<string, CachedJwt>();
const pendingMints = new Map<string, Promise<string>>();
const contactIds = new Map<string, number>();
const suspensions = new Map<string, { until: number; reason: string }>();

export class JwtSessionError extends Error {
	constructor(
		message: string,
		readonly cause?: unknown,
	) {
		super(message);
		this.name = 'JwtSessionError';
	}
}

export function isJwtAuthEnabled(credentials: Record<string, unknown> | undefined): boolean {
	return credentials?.enableJwtAuth === true;
}

function api4Url(baseUrl: string, entity: string, action: string): string {
	return `${baseUrl}/civicrm/ajax/api4/${entity}/${action}`;
}

/** Contact ID of whoever `authValue` authenticates, via CiviCRM's user_contact_id filter. */
export async function whoAmI(
	send: CiviSender,
	cfg: CiviAuthConfig,
	baseUrl: string,
	authValue: string,
	flow: CiviAuthConfig['flow'],
): Promise<number | undefined> {
	const params = { select: ['id'], where: [['id', '=', 'user_contact_id']], limit: 1 };
	const response = (await sendWithRetry(
		send,
		{ url: api4Url(baseUrl, 'Contact', 'get'), ...buildRequestParts(cfg, authValue, flow, params) },
		{ idempotent: true },
	)) as { values?: Array<{ id?: number }> } | undefined;
	const id = response?.values?.[0]?.id;
	return typeof id === 'number' ? id : id !== undefined ? Number(id) : undefined;
}

/** Asks CiviCRM (AuthxCredential.create) for a JWT, authenticating with the stored credential. */
export async function mintJwt(
	send: CiviSender,
	cfg: CiviAuthConfig,
	baseUrl: string,
	contactId: number,
	ttl: number,
): Promise<string> {
	const response = (await send({
		url: api4Url(baseUrl, 'AuthxCredential', 'create'),
		...buildRequestParts(cfg, credentialValue(cfg), cfg.flow, { contactId, ttl }),
	})) as { values?: Array<{ cred?: string }> } | undefined;
	const cred = response?.values?.[0]?.cred ?? '';
	if (!cred.startsWith('Bearer ')) {
		throw new JwtSessionError('CiviCRM did not return a JWT (AuthxCredential.create returned no "cred")');
	}
	return cred.substring('Bearer '.length);
}

/** Returns a cached JWT for this site + identity, minting a new one when needed. */
export async function getSessionJwt(
	send: CiviSender,
	cfg: CiviAuthConfig,
	baseUrl: string,
	identity: string,
): Promise<string> {
	const cacheKey = `${identity}:${cfg.jwtTtl}`;
	const cached = tokenCache.get(cacheKey);
	if (cached && cached.expiresAt > Date.now() + RENEW_MARGIN_MS) return cached.token;

	const pending = pendingMints.get(cacheKey);
	if (pending) return await pending;

	const mint = (async () => {
		let contactId = contactIds.get(identity);
		if (contactId === undefined) {
			try {
				contactId = await whoAmI(send, cfg, baseUrl, credentialValue(cfg), cfg.flow);
			} catch (error) {
				throw new JwtSessionError('could not identify the contact behind the credential', error);
			}
			if (contactId === undefined || !Number.isFinite(contactId)) {
				throw new JwtSessionError('CiviCRM did not identify a contact for the credential');
			}
			contactIds.set(identity, contactId);
		}
		const startedAt = Date.now();
		let token: string;
		try {
			token = await mintJwt(send, cfg, baseUrl, contactId, cfg.jwtTtl);
		} catch (error) {
			if (error instanceof JwtSessionError) throw error;
			throw new JwtSessionError(
				'CiviCRM refused to issue a JWT (needs the "generate any authx credential" permission)',
				error,
			);
		}
		tokenCache.set(cacheKey, { token, expiresAt: startedAt + cfg.jwtTtl * 1000 });
		return token;
	})();

	pendingMints.set(cacheKey, mint);
	try {
		return await mint;
	} finally {
		pendingMints.delete(cacheKey);
	}
}

export function forgetJwt(identity: string): void {
	for (const key of tokenCache.keys()) {
		if (key.startsWith(`${identity}:`)) tokenCache.delete(key);
	}
}

/** Stops using JWTs for this identity for a while, so a rejected setup costs one failed call, not one per request. */
export function suspendJwt(identity: string, reason: string): void {
	suspensions.set(identity, { until: Date.now() + SUSPEND_MS, reason });
	forgetJwt(identity);
}

export function jwtSuspension(identity: string): string | undefined {
	const entry = suspensions.get(identity);
	if (!entry) return undefined;
	if (entry.until <= Date.now()) {
		suspensions.delete(identity);
		return undefined;
	}
	return entry.reason;
}

/** Clears all JWT state; used by tests. */
export function resetJwtState(): void {
	tokenCache.clear();
	pendingMints.clear();
	contactIds.clear();
	suspensions.clear();
}
