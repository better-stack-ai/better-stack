"use client";
import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
	type ReactNode,
} from "react";
import type {
	CanParams,
	SchemaBoundStackAuthProvider,
	StackAuthProvider,
	StackIdentity,
} from "../shared/auth-types";
import { isSchemaBoundStackAuthProvider } from "../shared/auth-types";
import type { PermissionRequest } from "../authorization";

type AnyPermissionRequest = PermissionRequest;

export interface AuthContextValue {
	provider: StackAuthProvider;
	identity: StackIdentity | null;
	/** True while `getIdentity()` is resolving. */
	isPending: boolean;
	/** Serializable generation for the current identity resolution. */
	sourceGeneration: number;
	/** Identity resolution or validation failure. */
	error?: Error;
	/** Re-run `getIdentity()` (e.g. after login/logout) */
	refetch: () => Promise<void>;
}

/**
 * Default is `null` = no auth provider configured. Every consumer treats that
 * as "auth disabled": identity is `null`, all permission checks pass, and
 * `<CanAccess>` renders its children — preserving pre-auth behavior exactly.
 */
const AuthContext = createContext<AuthContextValue | null>(null);
let nextAuthSourceGeneration = 0;

function createInitialAuthState(
	provider: StackAuthProvider,
	initialIdentity: StackIdentity | null | undefined,
): {
	identity: StackIdentity | null;
	isPending: boolean;
	error?: Error;
} {
	if (initialIdentity === undefined) {
		return { identity: null, isPending: true };
	}

	try {
		return {
			identity: isSchemaBoundStackAuthProvider(provider)
				? provider.contract.parseIdentity(initialIdentity)
				: initialIdentity,
			isPending: false,
		};
	} catch (error) {
		return {
			identity: null,
			isPending: false,
			error: error instanceof Error ? error : new Error(String(error)),
		};
	}
}

/**
 * Internal boundary rendered by `StackProvider` when an `auth` provider is
 * configured. A supplied identity snapshot is used for the first server and
 * client render; otherwise `getIdentity()` resolves once in the browser. The
 * result is shared with all identity and permission consumers.
 */
export function StackAuthBoundary({
	provider,
	initialIdentity,
	children,
}: {
	provider: StackAuthProvider;
	initialIdentity?: StackIdentity | null;
	children?: ReactNode;
}) {
	type BoundaryState = {
		identity: StackIdentity | null;
		isPending: boolean;
		error?: Error;
		sourceGeneration: { readonly id: number };
		resolutionGeneration: number;
	};

	const hydratedState = useMemo(
		() => createInitialAuthState(provider, initialIdentity),
		[provider, initialIdentity],
	);
	const sourceGeneration = useMemo(
		() => ({ id: ++nextAuthSourceGeneration }),
		[provider, initialIdentity],
	);
	const [state, setState] = useState<BoundaryState>(() => ({
		...hydratedState,
		sourceGeneration,
		resolutionGeneration: sourceGeneration.id,
	}));
	const sourceChanged = state.sourceGeneration !== sourceGeneration;
	const currentState = sourceChanged ? hydratedState : state;
	const currentResolutionGeneration = sourceChanged
		? sourceGeneration.id
		: state.resolutionGeneration;
	const latestResolutionGeneration = useRef(0);
	const activeSourceGeneration = useRef<object | null>(sourceGeneration);

	useEffect(() => {
		activeSourceGeneration.current = sourceGeneration;
		return () => {
			if (activeSourceGeneration.current === sourceGeneration) {
				activeSourceGeneration.current = null;
			}
		};
	}, [sourceGeneration]);

	useEffect(() => {
		if (!sourceChanged) return;
		setState({
			...hydratedState,
			sourceGeneration,
			resolutionGeneration: sourceGeneration.id,
		});
	}, [hydratedState, sourceChanged, sourceGeneration]);

	const resolveIdentity = useCallback(
		async (markPending: boolean) => {
			if (activeSourceGeneration.current !== sourceGeneration) return;
			const resolutionGeneration = ++latestResolutionGeneration.current;
			const cacheGeneration = markPending
				? ++nextAuthSourceGeneration
				: sourceGeneration.id;
			if (markPending) {
				setState({
					identity: null,
					isPending: true,
					sourceGeneration,
					resolutionGeneration: cacheGeneration,
				});
			}
			const isLatestResolution = () =>
				latestResolutionGeneration.current === resolutionGeneration &&
				activeSourceGeneration.current === sourceGeneration;
			try {
				const identity = await provider.getIdentity();
				if (!isLatestResolution()) return;
				setState({
					identity: identity ?? null,
					isPending: false,
					sourceGeneration,
					resolutionGeneration: cacheGeneration,
				});
			} catch (error) {
				if (!isLatestResolution()) return;
				const identityError =
					error instanceof Error ? error : new Error(String(error));
				if (isSchemaBoundStackAuthProvider(provider)) {
					setState({
						identity: null,
						isPending: false,
						error: identityError,
						sourceGeneration,
						resolutionGeneration: cacheGeneration,
					});
					return;
				}
				console.error("[btst/auth] getIdentity() failed:", error);
				setState({
					identity: null,
					isPending: false,
					error: identityError,
					sourceGeneration,
					resolutionGeneration: cacheGeneration,
				});
			}
		},
		[provider, sourceGeneration],
	);
	const refetch = useCallback(() => resolveIdentity(true), [resolveIdentity]);

	useEffect(() => {
		if (initialIdentity !== undefined) return;
		void resolveIdentity(false);
	}, [initialIdentity, resolveIdentity]);

	return (
		<AuthContext.Provider
			value={{
				provider,
				identity: currentState.identity,
				isPending: currentState.isPending,
				sourceGeneration: currentResolutionGeneration,
				...(currentState.error ? { error: currentState.error } : {}),
				refetch,
			}}
		>
			{children}
		</AuthContext.Provider>
	);
}

/** @internal Access the raw auth context (or `null` when no provider is set). */
export function useAuthContext(): AuthContextValue | null {
	return useContext(AuthContext);
}

/**
 * Returns the current user's identity as resolved by the auth provider
 * configured on `StackProvider`.
 *
 * Without an auth provider, returns `{ identity: null, isPending: false }`.
 *
 * @example
 * ```tsx
 * const { identity, isPending } = useIdentity();
 * if (identity) return <span>Hello {identity.name}</span>;
 * ```
 */
export function useIdentity(): {
	identity: StackIdentity | null;
	isPending: boolean;
	error?: Error;
	refetch: () => Promise<void>;
} {
	const auth = useContext(AuthContext);

	if (!auth) {
		return { identity: null, isPending: false, refetch: async () => {} };
	}

	return {
		identity: auth.identity,
		isPending: auth.isPending,
		...(auth.error ? { error: auth.error } : {}),
		refetch: auth.refetch,
	};
}

/** @internal Serializable identity-resolution key for protected query caches. */
export function useIdentitySourceGeneration(): number {
	return useContext(AuthContext)?.sourceGeneration ?? 0;
}

type CanState = { can: boolean; isPending: boolean };

/** State yielded by a plugin-owned permission descriptor gate. */
export type PermissionCheckState = CanState & { error?: Error };

/**
 * A resolved `can()` result together with the inputs it was computed for.
 * `useCan` only trusts it while those inputs are still current, so a change
 * in identity (login/logout/user switch) or check parameters immediately
 * reads as pending instead of momentarily returning the previous user's
 * permission.
 */
type ResolvedCan = {
	can: boolean;
	forIdentity: StackIdentity | null;
	forKey: string;
};

/**
 * Checks whether the current user can perform `action` on `resource` using
 * the auth provider's `can()` function.
 *
 * Resolves to `{ can: true, isPending: false }` immediately when no auth
 * provider is configured or the provider has no `can()` function — permission
 * checks are opt-in and non-breaking.
 *
 * While the identity or the `can()` result is still resolving, returns
 * `{ can: false, isPending: true }` so callers can avoid flashing
 * permission-gated UI.
 *
 * @example
 * ```tsx
 * const { can, isPending } = useCan({ resource: "blog:post", action: "delete" });
 * if (!isPending && can) return <DeletePostButton />;
 * ```
 */
export function useCan(params: CanParams): CanState {
	const auth = useContext(AuthContext);
	const canFn = auth?.provider.can;
	const identity = auth?.identity ?? null;
	const identityPending = auth?.isPending ?? false;

	const { resource, action, params: extraParams } = params;
	// Serialized only for change detection: plain-object literals must not
	// retrigger the effect on every render. The original object (via ref) is
	// what gets passed to can(), so non-JSON-safe values survive intact.
	const extraParamsKey = extraParams ? JSON.stringify(extraParams) : "";
	const extraParamsRef = useRef(extraParams);
	extraParamsRef.current = extraParams;

	const checkKey = `${resource}\u0000${action}\u0000${extraParamsKey}`;

	const [resolved, setResolved] = useState<ResolvedCan | null>(null);

	useEffect(() => {
		if (!canFn || identityPending) return;

		let cancelled = false;

		void (async () => {
			try {
				const currentParams = extraParamsRef.current;
				const allowed = await canFn({
					resource,
					action,
					...(currentParams ? { params: currentParams } : {}),
					identity,
				});
				if (!cancelled) {
					setResolved({
						can: allowed,
						forIdentity: identity,
						forKey: checkKey,
					});
				}
			} catch (error) {
				console.error("[btst/auth] can() failed:", error);
				if (!cancelled) {
					setResolved({ can: false, forIdentity: identity, forKey: checkKey });
				}
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [canFn, identity, identityPending, resource, action, checkKey]);

	// No provider or no can() function: always allowed, never pending.
	if (!auth || !canFn) {
		return { can: true, isPending: false };
	}

	if (identityPending) {
		return { can: false, isPending: true };
	}

	// Only trust a result computed for the current identity and inputs;
	// anything else (including right after an identity change) is pending.
	if (
		!resolved ||
		resolved.forIdentity !== identity ||
		resolved.forKey !== checkKey
	) {
		return { can: false, isPending: true };
	}

	return { can: resolved.can, isPending: false };
}

/**
 * Element-level permission gate (Refine's `<CanAccess>` pattern).
 *
 * - Without an auth provider configured, always renders `children`.
 * - While the check is pending, renders `loading` (default `null`) to avoid
 *   flashing gated UI.
 * - Renders `children` when `can()` allows, `fallback` (default `null`)
 *   otherwise.
 *
 * @example
 * ```tsx
 * <CanAccess resource="blog:post" action="delete" fallback={null}>
 *   <DeletePostButton />
 * </CanAccess>
 * ```
 */
export function CanAccess({
	resource,
	action,
	params,
	fallback = null,
	loading = null,
	children,
}: CanParams & {
	/** Rendered when access is denied (default `null`) */
	fallback?: ReactNode;
	/** Rendered while the permission check is pending (default `null`) */
	loading?: ReactNode;
	children?: ReactNode;
}) {
	const { can, isPending } = useCan({ resource, action, params });

	if (isPending) return <>{loading}</>;
	return <>{can ? children : fallback}</>;
}

function descriptorToLegacyParams(permission: AnyPermissionRequest): CanParams {
	const separator = permission.id.lastIndexOf(".");
	const resource =
		separator === -1 ? permission.id : permission.id.slice(0, separator);
	const action =
		separator === -1 ? "access" : permission.id.slice(separator + 1);
	const facts = permission.facts;
	return {
		resource,
		action,
		...(typeof facts === "object" && facts !== null
			? { params: facts as Record<string, unknown> }
			: {}),
	};
}

function OneRulePermissionCheck({
	provider,
	permission,
	children,
}: {
	provider: SchemaBoundStackAuthProvider & {
		readonly usePermission: NonNullable<
			SchemaBoundStackAuthProvider["usePermission"]
		>;
	};
	permission: AnyPermissionRequest;
	children: (state: PermissionCheckState) => ReactNode;
}) {
	return <>{children(provider.usePermission(permission))}</>;
}

function hasPermissionHook(
	provider: SchemaBoundStackAuthProvider,
): provider is SchemaBoundStackAuthProvider & {
	readonly usePermission: NonNullable<
		SchemaBoundStackAuthProvider["usePermission"]
	>;
} {
	return typeof provider.usePermission === "function";
}

function LegacyPermissionCheck({
	permission,
	children,
}: {
	permission: AnyPermissionRequest;
	children: (state: PermissionCheckState) => ReactNode;
}) {
	return <>{children(useCan(descriptorToLegacyParams(permission)))}</>;
}

function LegacyPermissionParamsCheck({
	permission,
	children,
}: {
	permission: CanParams;
	children: (state: PermissionCheckState) => ReactNode;
}) {
	return <>{children(useCan(permission))}</>;
}

/**
 * Evaluate a plugin-owned descriptor through the configured one-rule client
 * auth. RC providers receive a temporary stable-id compatibility mapping;
 * omitting auth remains permissive until the v3 contraction.
 */
export function PermissionCheck({
	permission,
	children,
}: {
	permission: AnyPermissionRequest;
	children: (state: PermissionCheckState) => ReactNode;
}) {
	const auth = useContext(AuthContext);
	if (!auth) {
		return <>{children({ can: true, isPending: false })}</>;
	}
	if (
		isSchemaBoundStackAuthProvider(auth.provider) &&
		hasPermissionHook(auth.provider)
	) {
		return (
			<OneRulePermissionCheck provider={auth.provider} permission={permission}>
				{children}
			</OneRulePermissionCheck>
		);
	}
	if (isSchemaBoundStackAuthProvider(auth.provider)) {
		return (
			<>
				{children({
					can: false,
					isPending: false,
					error: new Error(
						"Schema-bound auth providers must expose usePermission() for built-in descriptor gates.",
					),
				})}
			</>
		);
	}
	return (
		<LegacyPermissionCheck permission={permission}>
			{children}
		</LegacyPermissionCheck>
	);
}

/** Element-level gate for a plugin-owned, schema-backed descriptor. */
export function PermissionAccess({
	permission,
	legacyPublic = false,
	legacyPermission,
	fallback = null,
	loading = null,
	children,
}: {
	permission: AnyPermissionRequest;
	/** Preserve explicitly public content for string-based RC providers. */
	legacyPublic?: boolean;
	/** String permission used only by RC providers during descriptor migration. */
	legacyPermission?: CanParams;
	fallback?: ReactNode;
	loading?: ReactNode;
	children?: ReactNode;
}) {
	const auth = useContext(AuthContext);
	if (legacyPublic && auth && !isSchemaBoundStackAuthProvider(auth.provider)) {
		return <>{children}</>;
	}
	if (
		legacyPermission &&
		auth &&
		!isSchemaBoundStackAuthProvider(auth.provider)
	) {
		return (
			<LegacyPermissionParamsCheck permission={legacyPermission}>
				{({ can, isPending, error }) => {
					if (error) throw error;
					if (isPending) return loading;
					return can ? children : fallback;
				}}
			</LegacyPermissionParamsCheck>
		);
	}
	return (
		<PermissionCheck permission={permission}>
			{({ can, isPending, error }) => {
				if (error) throw error;
				if (isPending) return loading;
				return can ? children : fallback;
			}}
		</PermissionCheck>
	);
}
