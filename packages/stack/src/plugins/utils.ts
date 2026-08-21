import { createClient } from "better-call/client";

/** Runs a hook and normalizes thrown values to an HTTP error. */
export async function runHook<T>(
	hookFn: () => Promise<T> | T,
	createError: (
		status: keyof typeof statusCodes | Status,
		body: { message: string },
	) => any,
	defaultMessage: string,
	errorStatus = 403 as keyof typeof statusCodes | Status,
): Promise<Awaited<T>> {
	try {
		return await hookFn();
	} catch (e) {
		throw createError(errorStatus, {
			message: e instanceof Error ? e.message : defaultMessage,
		});
	}
}

/**
 * Returns true when a fetch error is a connection-refused / no-server error.
 * Used in SSR loaders to emit an actionable build-time warning when
 * `route.loader()` is called during `next build` with no HTTP server running.
 */
export function isConnectionError(err: unknown): boolean {
	if (!(err instanceof Error)) return false;
	const code =
		(err as unknown as { cause?: { code?: string } }).cause?.code ??
		(err as unknown as { code?: string }).code;
	return (
		err.message.includes("ECONNREFUSED") ||
		err.message.includes("fetch failed") ||
		err.message.includes("ERR_CONNECTION_REFUSED") ||
		code === "ECONNREFUSED" ||
		code === "ERR_CONNECTION_REFUSED"
	);
}

/**
 * Public-safe message used when SSR loader failures are intentionally seeded
 * into React Query so Error Boundaries can render on the client.
 *
 * Never include raw server error text here because dehydrated query state can
 * be serialized into HTML.
 */
export const SSR_LOADER_ERROR_MESSAGE = "Failed to load data.";

/**
 * Creates a sanitized Error for SSR loader cache seeding.
 *
 * Use this instead of storing raw server errors in dehydrated query state.
 */
export function createSanitizedSSRLoaderError(): Error {
	return new Error(SSR_LOADER_ERROR_MESSAGE);
}
import type { Router, Endpoint, Status, statusCodes } from "better-call";

interface CreateApiClientOptions {
	baseURL?: string;
	basePath?: string;
}

/**
 * Creates a Better Call API client with proper URL handling for both server and client side
 * @param options - Configuration options
 * @param options.baseURL - The base URL (e.g., 'http://localhost:3000'). If not provided, uses relative URLs (same domain)
 * @param options.basePath - The API base path (defaults to '/')
 * @template TRouter - The router type (Router or Record<string, Endpoint>)
 */
export function createApiClient<
	TRouter extends Router | Record<string, Endpoint> = Record<string, Endpoint>,
>(options?: CreateApiClientOptions): ReturnType<typeof createClient<TRouter>> {
	const { baseURL = "", basePath = "/" } = options ?? {};

	// Normalize baseURL - remove trailing slash if present
	const normalizedBaseURL = baseURL ? baseURL.replace(/\/$/, "") : "";
	// Normalize basePath - ensure it starts with / and doesn't end with /
	const normalizedBasePath = basePath.startsWith("/")
		? basePath
		: `/${basePath}`;
	const finalBasePath = normalizedBasePath.replace(/\/$/, "");

	// If baseURL is not provided, apiPath is just the basePath (same domain, relative URL)
	const apiPath = normalizedBaseURL + finalBasePath;

	return createClient<TRouter>({
		baseURL: apiPath,
	});
}
