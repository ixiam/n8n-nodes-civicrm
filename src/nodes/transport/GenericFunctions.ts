import type { IDataObject, IExecuteFunctions, ILoadOptionsFunctions, INode } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import type { CiviAuthConfig } from './Auth';
import {
	bearer,
	buildRequestParts,
	credentialValue,
	describeCredential,
	flowLabel,
	identityKey,
	resolveAuthConfig,
} from './Auth';
import { civiApiError, isAuthRejection, isMaxRowsError } from './Errors';
import { isReadOnlyPath, senderForContext, sendWithRetry, toHttpFailure } from './Http';
import { forgetJwt, getSessionJwt, jwtSuspension, suspendJwt } from './JwtAuth';

type CiviContext = IExecuteFunctions | ILoadOptionsFunctions;

export interface CiviApiResponse extends IDataObject {
	values?: IDataObject[];
	count?: number;
	countFetched?: number;
}

/**
 * Normalizes the optional per-item "Base URL Override" parameter.
 *
 * - Empty / whitespace-only -> `undefined` (caller uses the credential's Base URL).
 * - Trims, strips trailing slashes, prepends `https://` when no scheme is given.
 * - Rejects any scheme other than http/https, and anything that does not parse
 *   as a URL with a host, with a NodeOperationError.
 *
 * Idempotent: normalizing an already-normalized value returns the same string,
 * so it is safe to call both in the node and in the transport.
 */
export function normalizeBaseUrlOverride(
	node: INode,
	rawValue: unknown,
	itemIndex?: number,
): string | undefined {
	if (rawValue === undefined || rawValue === null) return undefined;

	let value = String(rawValue).trim();
	if (!value) return undefined;

	value = value.replace(/\/+$/, '');

	const schemeMatch = /^([a-z][a-z0-9+.-]*):\/\//i.exec(value);
	if (schemeMatch) {
		const scheme = schemeMatch[1].toLowerCase();
		if (scheme !== 'http' && scheme !== 'https') {
			throw new NodeOperationError(
				node,
				`Invalid Base URL Override "${value}": only http:// and https:// URLs are allowed (got "${scheme}://").`,
				{ itemIndex },
			);
		}
	} else {
		value = `https://${value}`;
	}

	let parsed: URL;
	try {
		parsed = new URL(value);
	} catch {
		throw new NodeOperationError(
			node,
			`Invalid Base URL Override "${String(rawValue).trim()}": not a valid URL. Expected the site root, e.g. https://example.org`,
			{ itemIndex },
		);
	}

	if ((parsed.protocol !== 'http:' && parsed.protocol !== 'https:') || !parsed.hostname) {
		throw new NodeOperationError(
			node,
			`Invalid Base URL Override "${String(rawValue).trim()}": only http:// and https:// URLs with a host are allowed.`,
			{ itemIndex },
		);
	}

	return value;
}

const NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]*$/;

/** Entity and action names go into the URL path, so only plain identifiers are accepted. */
export function assertApiName(node: INode, kind: 'entity' | 'action', value: string, itemIndex?: number): string {
	const name = String(value ?? '').trim();
	if (!NAME_PATTERN.test(name)) {
		throw new NodeOperationError(
			node,
			`Invalid CiviCRM ${kind} name "${name}": only letters, digits and underscores are allowed.`,
			{ itemIndex },
		);
	}
	return name;
}

const hintedContexts = new WeakSet<object>();

function warn(ctx: CiviContext, message: string): void {
	if ('addExecutionHints' in ctx && typeof ctx.addExecutionHints === 'function') {
		ctx.addExecutionHints({ message, type: 'warning', location: 'outputPane' });
	}
}

/** Warns once per node run that JWT sessions are suspended for this credential. */
function warnSuspendedOnce(ctx: CiviContext, cfg: CiviAuthConfig, reason: string): void {
	if (hintedContexts.has(ctx)) return;
	hintedContexts.add(ctx);
	warn(ctx, `JWT sessions are paused for this credential (${reason}). Using the ${describeCredential(cfg)} instead.`);
}

/**
 * Executes one CiviCRM APIv4 REST call (POST {base}{path}) with the node's credential.
 *
 * - `runtimeBearerToken`: a JWT for a specific real user. Sent exactly as given, with no
 *   fallback: an empty or denied answer is that user's correct permission outcome.
 * - Credential JWT sessions: when enabled, a JWT is minted with the stored credential and
 *   reused until it expires. If CiviCRM refuses the JWT at authentication, the call is
 *   repeated once with the stored credential and JWTs pause for 15 minutes. Any other
 *   error is reported as is, so writes are never sent twice.
 * - `baseUrlOverride`: targets another site with the same credential; JWTs are cached per
 *   site so a token from one instance is never sent to another.
 */
export async function civicrmApiRequest(
	this: CiviContext,
	method: 'POST',
	path: string,
	body: Record<string, unknown>,
	runtimeBearerToken?: string,
	baseUrlOverride?: string,
	itemIndex?: number,
): Promise<CiviApiResponse> {
	const credentials = (await this.getCredentials('civiCrmApi')) as Record<string, unknown>;
	const cfg = resolveAuthConfig(credentials);
	const override = normalizeBaseUrlOverride(this.getNode(), baseUrlOverride, itemIndex);
	const baseUrl = override ?? cfg.baseUrl;
	const url = `${baseUrl}${path}`;
	const params = (body.params as Record<string, unknown> | undefined) ?? body;
	const idempotent = isReadOnlyPath(path);
	const send = senderForContext(this);
	const node = this.getNode();
	// Redacted from every error text and detail.
	const secrets: Array<string | undefined> = [cfg.apiKey, cfg.password, cfg.siteKey, credentialValue(cfg).split(' ')[1], runtimeBearerToken];

	const call = async (authValue: string, flow: CiviAuthConfig['flow']) =>
		(await sendWithRetry(send, { url, ...buildRequestParts(cfg, authValue, flow, params) }, { idempotent })) as CiviApiResponse;

	if (runtimeBearerToken) {
		try {
			return await call(bearer(runtimeBearerToken), cfg.tokenFlow);
		} catch (error) {
			throw civiApiError(node, error, { url, credentialLabel: `runtime bearer token via ${flowLabel(cfg.tokenFlow)}`, secrets }, itemIndex);
		}
	}

	const identity = identityKey(cfg, baseUrl);
	const suspended = cfg.jwtEnabled ? jwtSuspension(identity) : undefined;
	if (suspended) warnSuspendedOnce(this, cfg, suspended);

	if (cfg.jwtEnabled && !suspended) {
		let token: string | undefined;
		try {
			token = await getSessionJwt(send, cfg, baseUrl, identity);
		} catch (error) {
			const reason = error instanceof Error ? error.message : String(error);
			suspendJwt(identity, reason);
			warn(this, `Could not start a JWT session (${reason}). Using the ${describeCredential(cfg)} for the next 15 minutes.`);
		}

		if (token) {
			try {
				return await call(bearer(token), cfg.tokenFlow);
			} catch (error) {
				if (!isAuthRejection(error)) {
					throw civiApiError(node, error, { url, credentialLabel: `JWT via ${flowLabel(cfg.tokenFlow)}`, secrets: [...secrets, token] }, itemIndex);
				}
				const text = toHttpFailure(error).text || 'JWT rejected';
				if (/not allowed/i.test(text)) {
					suspendJwt(identity, text);
					warn(this, `CiviCRM refused the JWT (${text}). Using the ${describeCredential(cfg)} for the next 15 minutes.`);
				} else {
					// Expired or revoked token: mint a fresh one next time.
					forgetJwt(identity);
				}
			}
		}
	}

	try {
		return await call(credentialValue(cfg), cfg.flow);
	} catch (error) {
		throw civiApiError(node, error, { url, credentialLabel: describeCredential(cfg), secrets }, itemIndex);
	}
}

/**
 * Fetches every row of a `get`-style call in pages. Drops to pages of 100 when the
 * site caps rows per call (apirestlog guard), and stops when a page comes back short.
 */
export async function fetchAllPages(
	this: CiviContext,
	path: string,
	params: Record<string, unknown>,
	options: { runtimeBearerToken?: string; baseUrlOverride?: string; itemIndex?: number; pageSize?: number } = {},
): Promise<IDataObject[]> {
	let pageSize = options.pageSize ?? 500;
	let offset = 0;
	const rows: IDataObject[] = [];

	for (;;) {
		let response: CiviApiResponse;
		try {
			response = await civicrmApiRequest.call(
				this,
				'POST',
				path,
				{ ...params, limit: pageSize, offset },
				options.runtimeBearerToken,
				options.baseUrlOverride,
				options.itemIndex,
			);
		} catch (error) {
			if (pageSize > 100 && isMaxRowsError(error)) {
				pageSize = 100;
				continue;
			}
			throw error;
		}
		const values = response?.values ?? [];
		rows.push(...values);
		if (values.length < pageSize) return rows;
		offset += pageSize;
	}
}

/**
 * Runs a call without a limit and, if the site silently capped the rows
 * (count > countFetched), fetches the rest with offsets.
 */
export async function fetchUncapped(
	this: CiviContext,
	path: string,
	params: Record<string, unknown>,
): Promise<IDataObject[]> {
	const first = await civicrmApiRequest.call(this, 'POST', path, params);
	const rows = [...(first?.values ?? [])];
	const total = Number(first?.count ?? rows.length);
	const page = rows.length;
	while (page > 0 && rows.length < total) {
		const next = await civicrmApiRequest.call(this, 'POST', path, { ...params, limit: page, offset: rows.length });
		const values = next?.values ?? [];
		if (!values.length) break;
		rows.push(...values);
	}
	return rows;
}
