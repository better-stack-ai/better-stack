import { createClient } from "better-call/client";

/**
 * Runs a hook with backward-compatible denial handling.
 * Hooks may deny by returning a falsy value (old) or throwing (new).
 * Both are normalized to an HTTP error via `createError` (`ctx.error`).
 * Returns the hook's result so transform hooks can apply mutations.
 *
 * ## Migration note (v2.4 → v2.5)
 *
 * Old-style hooks signalled denial by returning `false` and allowance by returning `true`.
 * Pre-shim call sites used `if (!result)` which treated `undefined` (fall-through) as deny.
 * New-style hooks throw an Error to deny and return void/undefined to allow.
 *
 * The shim detects old-style boolean returns at runtime and emits a deprecation warning so
 * that any hook with a code path returning a boolean is surfaced immediately. Hooks that fall
 * through to `undefined` on **every** code path (no boolean return anywhere) cannot be
 * distinguished from new-style void hooks — those hooks must be audited manually and updated
 * to throw explicitly when they intend to deny access.
 */
export async function runHookWithShim<T>(
	hookFn: () => Promise<T> | T,
	createError: (
		status: keyof typeof statusCodes | Status,
		body: { message: string },
	) => any,
	defaultMessage: string,
	errorStatus = 403 as keyof typeof statusCodes | Status,
): Promise<Exclude<Awaited<T>, false>> {
	let result: Awaited<T>;
	try {
		result = await hookFn();
	} catch (e) {
		throw createError(errorStatus, {
			message: e instanceof Error ? e.message : defaultMessage,
		});
	}
	// Detect old-style boolean returns (pre-v2.5 pattern).
	// Emitting a warning here is the only reliable way to surface hooks that still rely on
	// boolean returns — including hooks where one branch returns `false` and another falls
	// through to `undefined`, which was previously denied by `if (!result)` at the call site
	// but would now silently allow if the warning is not acted on.
	if (typeof result === "boolean") {
		if (process.env.NODE_ENV !== "production") {
			console.warn(
				`[btst] A lifecycle hook returned a boolean (${result}). ` +
					`Boolean returns are deprecated — throw an Error to deny access instead. ` +
					`IMPORTANT: any code path in this hook that falls through to undefined ` +
					`now ALLOWS access (previously denied). ` +
					`Update the hook to throw new Error("Unauthorized") to deny.`,
			);
		}
		if (!result) {
			throw createError(errorStatus, { message: defaultMessage });
		}
	}
	return result as Exclude<Awaited<T>, false>;
}

/**
 * Client-side equivalent of runHookWithShim — throws a plain Error instead of an HTTP error.
 * Hooks may deny by returning false (old) or throwing (new); both normalize to an Error.
 *
 * See `runHookWithShim` for the full migration note on boolean-vs-void semantics.
 */
export async function runClientHookWithShim<T>(
	hookFn: () => Promise<T> | T,
	defaultMessage: string,
): Promise<Exclude<Awaited<T>, false>> {
	let result: Awaited<T>;
	try {
		result = await hookFn();
	} catch (e) {
		throw e instanceof Error ? e : new Error(defaultMessage);
	}
	// Detect old-style boolean returns and warn; see runHookWithShim for rationale.
	if (typeof result === "boolean") {
		if (process.env.NODE_ENV !== "production") {
			console.warn(
				`[btst] A lifecycle hook returned a boolean (${result}). ` +
					`Boolean returns are deprecated — throw an Error to deny access instead. ` +
					`IMPORTANT: any code path in this hook that falls through to undefined ` +
					`now ALLOWS access (previously denied). ` +
					`Update the hook to throw new Error("Unauthorized") to deny.`,
			);
		}
		if (!result) {
			throw new Error(defaultMessage);
		}
	}
	return result as Exclude<Awaited<T>, false>;
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
