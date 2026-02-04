import { createClient } from "better-call/client";
import type { Router, Endpoint } from "better-call";

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
