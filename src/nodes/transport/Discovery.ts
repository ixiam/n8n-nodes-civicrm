import type { IExecuteFunctions, ILoadOptionsFunctions } from 'n8n-workflow';

import { identityKey, resolveAuthConfig } from './Auth';

const TTL_MS = 15 * 60 * 1000;
// Some sites answer 502 at three parallel requests; the editor loads several dropdowns at once.
const MAX_PARALLEL_PER_SITE = 2;

const cache = new Map<string, { expiresAt: number; value: unknown }>();
const inflight = new Map<string, Promise<unknown>>();
const running = new Map<string, number>();
const queues = new Map<string, Array<() => void>>();

async function acquire(site: string): Promise<void> {
	if ((running.get(site) ?? 0) < MAX_PARALLEL_PER_SITE) {
		running.set(site, (running.get(site) ?? 0) + 1);
		return;
	}
	await new Promise<void>((resolve) => {
		const queue = queues.get(site) ?? [];
		queue.push(resolve);
		queues.set(site, queue);
	});
}

function release(site: string): void {
	const next = queues.get(site)?.shift();
	if (next) {
		next();
		return;
	}
	running.set(site, Math.max((running.get(site) ?? 1) - 1, 0));
}

/**
 * Runs a discovery fetch at most once per site + identity + key within the TTL.
 * Discovery results depend on the caller's permissions, so the identity is part of the key.
 */
export async function cachedDiscovery<T>(
	ctx: IExecuteFunctions | ILoadOptionsFunctions,
	key: string[],
	fetch: () => Promise<T>,
): Promise<T> {
	const cfg = resolveAuthConfig((await ctx.getCredentials('civiCrmApi')) as Record<string, unknown>);
	const site = cfg.baseUrl;
	const cacheKey = [identityKey(cfg, site), ...key].join('|');

	const hit = cache.get(cacheKey);
	if (hit && hit.expiresAt > Date.now()) return hit.value as T;

	const pending = inflight.get(cacheKey);
	if (pending) return (await pending) as T;

	const work = (async () => {
		await acquire(site);
		try {
			const value = await fetch();
			cache.set(cacheKey, { expiresAt: Date.now() + TTL_MS, value });
			return value;
		} finally {
			release(site);
		}
	})();
	inflight.set(cacheKey, work);
	try {
		return (await work) as T;
	} finally {
		inflight.delete(cacheKey);
	}
}

/** Clears the discovery cache; used by tests. */
export function clearDiscoveryCache(): void {
	cache.clear();
	inflight.clear();
}
