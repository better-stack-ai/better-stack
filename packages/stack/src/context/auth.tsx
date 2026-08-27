"use client";
import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useRef,
	useState,
	type ReactNode,
} from "react";
import type {
	CanParams,
	StackAuthProvider,
	StackIdentity,
} from "../shared/auth-types";
import { isSchemaBoundStackAuthProvider } from "../shared/auth-types";

export interface AuthContextValue {
	provider: StackAuthProvider;
	identity: StackIdentity | null;
	/** True until the initial `getIdentity()` call settles */
	isPending: boolean;
	/** Identity resolution or validation failure on the one-rule auth path. */
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
	const [state, setState] = useState<{
		identity: StackIdentity | null;
		isPending: boolean;
		error?: Error;
	}>(() => createInitialAuthState(provider, initialIdentity));

	const refetch = useCallback(async () => {
		try {
			const identity = await provider.getIdentity();
			setState({ identity: identity ?? null, isPending: false });
		} catch (error) {
			if (isSchemaBoundStackAuthProvider(provider)) {
				setState({
					identity: null,
					isPending: false,
					error: error instanceof Error ? error : new Error(String(error)),
				});
				return;
			}
			console.error("[btst/auth] getIdentity() failed:", error);
			setState({ identity: null, isPending: false });
		}
	}, [provider]);

	useEffect(() => {
		if (initialIdentity !== undefined) return;
		void refetch();
	}, [initialIdentity, refetch]);

	return (
		<AuthContext.Provider
			value={{
				provider,
				identity: state.identity,
				isPending: state.isPending,
				...(state.error ? { error: state.error } : {}),
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

type CanState = { can: boolean; isPending: boolean };

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
