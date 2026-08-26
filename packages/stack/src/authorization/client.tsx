"use client";

import type { ReactNode } from "react";
import {
	type AuthorizationIdentity,
	type AuthorizationIdentityInput,
	type AuthorizationPermissionRequest,
	type AnyAuthorization,
} from ".";
import {
	useAuthContext,
	useIdentity as useStackIdentity,
} from "../context/auth";
import type { StackAuthProvider } from "../shared/auth-types";

type MaybePromise<T> = T | Promise<T>;

/** Result returned by a bound browser permission check. */
export interface AuthorizationCanState {
	can: boolean;
	isPending: boolean;
	error?: Error;
}

/** Validated identity state returned by the bound browser identity hook. */
export interface AuthorizationIdentityState<TIdentity> {
	identity: TIdentity | null;
	isPending: boolean;
	error?: Error;
	refetch: () => Promise<void>;
}

/** Browser identity adapter and hooks bound to one authorization contract. */
export interface ClientAuth<TAuthorization extends AnyAuthorization>
	extends StackAuthProvider {
	readonly mode: "one-rule";
	readonly authorization: TAuthorization;
	getIdentity: () => Promise<AuthorizationIdentity<TAuthorization> | null>;
	useIdentity: () => AuthorizationIdentityState<
		AuthorizationIdentity<TAuthorization>
	>;
	useCan: (
		permission: AuthorizationPermissionRequest<TAuthorization>,
	) => AuthorizationCanState;
	CanAccess: (props: {
		permission: AuthorizationPermissionRequest<TAuthorization>;
		fallback?: ReactNode;
		loading?: ReactNode;
		children?: ReactNode;
	}) => ReactNode;
}

function toError(error: unknown): Error {
	return error instanceof Error ? error : new Error(String(error));
}

/**
 * Bind browser identity resolution and type-safe hooks to one authorization
 * contract. Rules execute synchronously in the browser; no transport or cache
 * is involved.
 */
export function createClientAuth<
	TAuthorization extends AnyAuthorization,
>(config: {
	authorization: TAuthorization;
	getIdentity: () => MaybePromise<AuthorizationIdentityInput<TAuthorization> | null>;
	loginPath?: string;
}): ClientAuth<TAuthorization> {
	let clientAuth: ClientAuth<TAuthorization>;
	const runtimeAuthorization = config.authorization as unknown as {
		can: (permission: unknown, identity: unknown) => boolean;
		parseIdentity: (identity: unknown) => { id: string } | null;
	};

	const useIdentity = (): AuthorizationIdentityState<
		AuthorizationIdentity<TAuthorization>
	> => {
		const context = useAuthContext();
		if (context && context.provider !== clientAuth) {
			throw new Error(
				"This bound useIdentity hook must be used with its createClientAuth instance on StackProvider.",
			);
		}
		return useStackIdentity() as AuthorizationIdentityState<
			AuthorizationIdentity<TAuthorization>
		>;
	};

	const useCanRuntime = (permissionRequest: unknown): AuthorizationCanState => {
		const context = useAuthContext();
		if (!context || context.provider !== clientAuth) {
			throw new Error(
				"This bound useCan hook must be used with its createClientAuth instance on StackProvider.",
			);
		}
		if (context.isPending) return { can: false, isPending: true };
		if (context.error) {
			return { can: false, isPending: false, error: context.error };
		}

		try {
			return {
				can: runtimeAuthorization.can(permissionRequest, context.identity),
				isPending: false,
			};
		} catch (error) {
			return { can: false, isPending: false, error: toError(error) };
		}
	};

	const CanAccessRuntime = ({
		permission: permissionRequest,
		fallback = null,
		loading = null,
		children,
	}: {
		permission: unknown;
		fallback?: ReactNode;
		loading?: ReactNode;
		children?: ReactNode;
	}): ReactNode => {
		const state = useCanRuntime(permissionRequest);
		if (state.error) throw state.error;
		if (state.isPending) return loading;
		return state.can ? children : fallback;
	};

	clientAuth = {
		mode: "one-rule",
		authorization: config.authorization,
		async getIdentity() {
			const identity = await config.getIdentity();
			return runtimeAuthorization.parseIdentity(
				identity,
			) as AuthorizationIdentity<TAuthorization> | null;
		},
		...(config.loginPath ? { loginPath: config.loginPath } : {}),
		useIdentity,
		useCan: useCanRuntime,
		CanAccess: CanAccessRuntime,
	} as unknown as ClientAuth<TAuthorization>;

	return clientAuth;
}
