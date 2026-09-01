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
import type { StackClientAuth, StackIdentity } from "../shared/auth-types";
import type { PermissionRequest } from "../authorization";

type AnyPermissionRequest = PermissionRequest;

export interface AuthContextValue {
	provider: StackClientAuth;
	identity: StackIdentity | null;
	/** True while `getIdentity()` is resolving. */
	isPending: boolean;
	/** Serializable generation for the current identity resolution. */
	sourceGeneration: number;
	/** Identity resolution or validation failure. */
	error?: Error;
	/** Re-run `getIdentity()` (e.g. after login/logout) */
	refetch: () => Promise<void>;
	/** Promise used by suspense consumers to wait for the active resolution. */
	waitForResolution: () => Promise<void>;
}

/**
 * Default is `null` = no auth provider configured. Every consumer treats that
 * as "auth disabled": identity is `null`, all permission checks pass, and
 * `<CanAccess>` renders its children — preserving pre-auth behavior exactly.
 */
const AuthContext = createContext<AuthContextValue | null>(null);
let nextAuthSourceGeneration = 0;

function createInitialAuthState(
	provider: StackClientAuth,
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
			identity: provider.contract.parseIdentity(initialIdentity),
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
	provider: StackClientAuth;
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
	const resolutionWaiters = useRef(new Set<() => void>());
	const settleResolutionWaiters = useCallback(() => {
		for (const resolve of resolutionWaiters.current) resolve();
		resolutionWaiters.current.clear();
	}, []);
	const waitForResolution = useCallback(
		() =>
			currentState.isPending
				? new Promise<void>((resolve) => {
						resolutionWaiters.current.add(resolve);
					})
				: Promise.resolve(),
		[currentState.isPending],
	);

	useEffect(() => {
		if (!currentState.isPending) settleResolutionWaiters();
	}, [currentState.isPending, settleResolutionWaiters]);
	useEffect(() => settleResolutionWaiters, [settleResolutionWaiters]);

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
				waitForResolution,
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

/** @internal Promise that settles when the current identity lookup finishes. */
export function useIdentityResolutionPromise(): Promise<void> | undefined {
	const auth = useContext(AuthContext);
	return auth?.isPending ? auth.waitForResolution() : undefined;
}

type CanState = { can: boolean; isPending: boolean };

/** State yielded by a plugin-owned permission descriptor gate. */
export type PermissionCheckState = CanState & { error?: Error };

/**
 * Evaluate a plugin-owned descriptor through the configured client auth.
 * Omitting browser authorization remains presentation-only permissive; the
 * backend is always the security boundary.
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
	return <>{children(auth.provider.usePermission(permission))}</>;
}

/** Element-level gate for a plugin-owned, schema-backed descriptor. */
export function PermissionAccess({
	permission,
	fallback = null,
	loading = null,
	children,
}: {
	permission: AnyPermissionRequest;
	fallback?: ReactNode;
	loading?: ReactNode;
	children?: ReactNode;
}) {
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
