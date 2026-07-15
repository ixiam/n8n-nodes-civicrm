import * as jwt from 'jsonwebtoken';

interface JwtConfig {
	siteKey: string;
	jwtExpiry: number;
	baseUrl: string;
}

const tokenCache: Record<string, { token: string; expiresAt: number }> = {};

export function generateJwtToken(config: JwtConfig): string {
	return jwt.sign(
		{ sub: new URL(config.baseUrl).hostname, iat: Math.floor(Date.now() / 1000) },
		config.siteKey,
		{ expiresIn: config.jwtExpiry, algorithm: 'HS256' }
	);
}

export function getValidToken(config: JwtConfig): string {
	const cacheKey = `${config.baseUrl}:${config.siteKey}`;
	const now = Date.now();
	const cached = tokenCache[cacheKey];
	
	if (cached && cached.expiresAt > now + 30000) {
		return cached.token;
	}
	
	const token = generateJwtToken(config);
	tokenCache[cacheKey] = { token, expiresAt: now + (config.jwtExpiry * 1000) };
	return token;
}

export function isJwtAuthEnabled(credentials: any): boolean {
	return credentials?.enableJwtAuth === true;
}
