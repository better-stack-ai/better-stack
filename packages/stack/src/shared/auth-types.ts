/**
 * Shared auth contract types used by both the client provider
 * (`@btst/stack/context`) and the backend (`@btst/stack/api`).
 *
 * This module is intentionally type-only so it can be imported from server
 * and client code alike.
 */

/**
 * The identity of the current user as resolved by an auth provider.
 * Extra provider-specific fields are allowed.
 */
export interface StackIdentity {
	/** Unique user id */
	id: string;
	/** Display name */
	name?: string;
	/** Email address */
	email?: string;
	/** Avatar image URL */
	image?: string;
	/** Additional provider-specific fields */
	[key: string]: unknown;
}

/**
 * A permission check request: "can the current user perform `action` on
 * `resource`?" (e.g. resource `"blog:post"`, action `"delete"`).
 */
export interface CanParams {
	/** The resource being accessed (e.g. "blog:post", "comments:moderate") */
	resource: string;
	/** The action being performed (e.g. "read", "create", "delete") */
	action: string;
	/** Optional extra parameters (e.g. the specific record id) */
	params?: Record<string, unknown>;
}

/**
 * Client-side auth provider, passed to `StackProvider` via the `auth` prop.
 *
 * All fields besides `getIdentity` are optional:
 * - Without `can`, every permission check resolves to `true`.
 * - Without `loginPath`, denied route access is not redirected.
 *
 * @example
 * ```tsx
 * const authProvider: StackAuthProvider = {
 *   getIdentity: () => authClient.getSession().then((s) => s?.user ?? null),
 *   can: ({ resource, action }) => checkPermission(resource, action),
 *   loginPath: "/login",
 * };
 *
 * <StackProvider auth={authProvider} ...>
 * ```
 */
export interface StackAuthProvider {
	/**
	 * Resolve the current user's identity. Return `null` when unauthenticated.
	 */
	getIdentity: () => Promise<StackIdentity | null> | StackIdentity | null;
	/**
	 * Permission check. When omitted, all `useCan()` / `<CanAccess>` checks
	 * resolve to `true`.
	 */
	can?: (
		params: CanParams & { identity: StackIdentity | null },
	) => Promise<boolean> | boolean;
	/**
	 * Path unauthenticated users are redirected to when route-level permission
	 * checks deny access (e.g. "/login").
	 */
	loginPath?: string;
}

/**
 * Server-side auth provider, passed to `stack()` via the `auth` config option.
 * `stack()` resolves the identity lazily and at most once per request; plugin
 * lifecycle hooks can read it via `getRequestIdentity(headers)` from
 * `@btst/stack/api`.
 */
export interface StackServerAuthProvider {
	/**
	 * Resolve the identity for an incoming request (e.g. from a session
	 * cookie). Return `null` when unauthenticated.
	 */
	getIdentity: (ctx: {
		headers: Headers;
		request: Request;
	}) => Promise<StackIdentity | null> | StackIdentity | null;
	/**
	 * Optional server-side permission check, for consumers and plugins that
	 * want to share one `can` implementation across lifecycle hooks.
	 */
	can?: (
		params: CanParams & { identity: StackIdentity | null; headers: Headers },
	) => Promise<boolean> | boolean;
}
