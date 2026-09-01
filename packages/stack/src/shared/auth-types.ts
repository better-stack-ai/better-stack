/**
 * Shared auth contract types used by both the client provider
 * (`@btst/stack/context`) and the backend (`@btst/stack/api`).
 *
 * This module is runtime-safe so it can be imported from server and client
 * code alike without pulling in either implementation.
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
 * Browser authorization adapter accepted by `StackProvider`.
 *
 * Applications create this value with `createClientAuth()`. Permission checks
 * use plugin-owned schema-backed descriptors; there is no open string callback.
 */
export interface StackClientAuth {
	readonly mode: "one-rule";
	readonly contract: {
		parseIdentity(identity: unknown): StackIdentity | null;
	};
	/** Resolve the current browser identity. */
	getIdentity: () => Promise<StackIdentity | null> | StackIdentity | null;
	/** Runtime hook used by descriptor-aware built-in plugin gates. */
	readonly usePermission: (permission: unknown) => {
		readonly can: boolean;
		readonly isPending: boolean;
		readonly error?: Error;
	};
	/** Optional login target used by descriptor-aware route gates. */
	readonly loginPath?: string;
}
