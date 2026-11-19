import { createHash } from 'crypto';
import type { IHttpRequestOptions } from 'n8n-workflow';

export type AuthType = 'apiKey' | 'password';
export type AuthFlow = 'xheader' | 'header' | 'param';

export interface CiviAuthConfig {
	baseUrl: string;
	authType: AuthType;
	/** Route for the API key or password. */
	flow: AuthFlow;
	/** Route for JWTs (session or runtime bearer token). */
	tokenFlow: AuthFlow;
	apiKey: string;
	username: string;
	password: string;
	siteKey: string;
	jwtEnabled: boolean;
	jwtTtl: number;
}

export interface CiviRequestParts {
	headers: Record<string, string>;
	form: Record<string, string>;
}

const FLOWS: AuthFlow[] = ['xheader', 'header', 'param'];

const FLOW_LABELS: Record<AuthFlow, string> = {
	xheader: 'X-Civi-Auth header',
	header: 'Authorization header',
	param: '_authx parameter',
};

export function normalizeBaseUrl(url: unknown): string {
	return String(url ?? '').trim().replace(/\/+$/, '');
}

/**
 * Reads a stored credential (any version) into one resolved config.
 * Fields missing from pre-4.0 credentials fall back to the 3.x behaviour.
 */
export function resolveAuthConfig(credentials: Record<string, unknown>): CiviAuthConfig {
	const authType: AuthType = credentials.authType === 'password' ? 'password' : 'apiKey';
	const flow: AuthFlow = FLOWS.includes(credentials.authFlow as AuthFlow)
		? (credentials.authFlow as AuthFlow)
		: 'xheader';

	// 3.x let JWTs alone use the Authorization header ("both" was evaluated as X-Civi-Auth by CiviCRM).
	const legacyHeaderMode = String(credentials.jwtHeaderMode ?? '');
	const tokenFlow: AuthFlow = legacyHeaderMode === 'authorization' && flow === 'xheader' ? 'header' : flow;

	const ttl = Number(credentials.jwtExpiry ?? 3600);

	return {
		baseUrl: normalizeBaseUrl(credentials.baseUrl),
		authType,
		flow,
		tokenFlow,
		apiKey: String(credentials.apiToken ?? ''),
		username: String(credentials.username ?? ''),
		password: String(credentials.password ?? ''),
		siteKey: String(credentials.siteKey ?? '').trim(),
		jwtEnabled: credentials.enableJwtAuth === true,
		jwtTtl: Number.isFinite(ttl) ? Math.min(Math.max(Math.round(ttl), 60), 86400) : 3600,
	};
}

/** The Authorization-style value for the stored credential: "Bearer <key>" or "Basic <b64>". */
export function credentialValue(cfg: CiviAuthConfig): string {
	if (cfg.authType === 'password') {
		return `Basic ${Buffer.from(`${cfg.username}:${cfg.password}`, 'utf8').toString('base64')}`;
	}
	return `Bearer ${cfg.apiKey}`;
}

export function bearer(token: string): string {
	return `Bearer ${token}`;
}

/** Auth headers and form fields for the credential on the given route (no API params). */
export function authParts(cfg: CiviAuthConfig, authValue: string, flow: AuthFlow): CiviRequestParts {
	const headers: Record<string, string> = {
		'Content-Type': 'application/x-www-form-urlencoded',
		// CiviCRM's CSRF check needs this on the Authorization route; the docs advise it everywhere.
		'X-Requested-With': 'XMLHttpRequest',
	};
	if (cfg.siteKey) headers['X-Civi-Key'] = cfg.siteKey;

	const form: Record<string, string> = {};
	if (flow === 'header') headers.Authorization = authValue;
	else if (flow === 'param') form._authx = authValue;
	else headers['X-Civi-Auth'] = authValue;

	return { headers, form };
}

/** Headers and form fields for one APIv4 REST call, with the credential on the given route. */
export function buildRequestParts(
	cfg: CiviAuthConfig,
	authValue: string,
	flow: AuthFlow,
	params: unknown,
): CiviRequestParts {
	const { headers, form } = authParts(cfg, authValue, flow);
	return { headers, form: { params: JSON.stringify(params ?? {}), ...form } };
}

/**
 * The credential's `authenticate` hook: n8n runs it for the credential test request.
 * Applies the stored credential on its configured route, plus the site key.
 */
export async function authenticateRequest(
	credentials: Record<string, unknown>,
	requestOptions: IHttpRequestOptions,
): Promise<IHttpRequestOptions> {
	const cfg = resolveAuthConfig(credentials);
	const { headers, form } = authParts(cfg, credentialValue(cfg), cfg.flow);
	// The HTTP Request node passes legacy request options, where form bodies live in `form`.
	const options = { ...requestOptions } as IHttpRequestOptions & { form?: Record<string, unknown> };
	options.baseURL = options.baseURL ? normalizeBaseUrl(options.baseURL) : options.baseURL;
	options.headers = { ...(options.headers ?? {}), ...headers };

	if (Object.keys(form).length) {
		const body = options.body;
		const isPlainObject =
			!!body && typeof body === 'object' && Object.getPrototypeOf(body) === Object.prototype;
		if (options.form && typeof options.form === 'object') {
			options.form = { ...options.form, ...form };
		} else if (body instanceof URLSearchParams) {
			const merged = new URLSearchParams(body);
			for (const [key, value] of Object.entries(form)) merged.set(key, value);
			options.body = merged;
		} else if (isPlainObject) {
			options.body = { ...(body as Record<string, unknown>), ...form } as IHttpRequestOptions['body'];
		} else {
			// No form body to carry it (GET or JSON): AuthX also reads _authx from the query string.
			options.qs = { ...(options.qs ?? {}), ...form };
		}
	}
	return options;
}

/** Stable, non-reversible key for one site + identity, used by every cache. */
export function identityKey(cfg: CiviAuthConfig, baseUrl: string): string {
	const secret = cfg.authType === 'password' ? `${cfg.username}:${cfg.password}` : cfg.apiKey;
	return createHash('sha256')
		.update([baseUrl, cfg.authType, secret, cfg.siteKey].join('\n'))
		.digest('hex')
		.slice(0, 40);
}

export function flowLabel(flow: AuthFlow): string {
	return FLOW_LABELS[flow];
}

export function describeCredential(cfg: CiviAuthConfig): string {
	const type = cfg.authType === 'password' ? 'username and password' : 'API key';
	return `${type} via ${FLOW_LABELS[cfg.flow]}`;
}
