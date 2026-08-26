"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
	type AuthorizationIdentity,
	type AuthorizationIdentityInput,
	type AuthorizationPermissionRequest,
	type AuthorizationContractIdentity,
	type AuthorizationContractIdentityInput,
	type AuthorizationContractPermissionRequest,
	type AnyAuthorization,
	type AnyAuthorizationContract,
} from ".";
import type { AuthorizationEvaluatorFor } from "./remote";
import {
	useAuthContext,
	useIdentity as useStackIdentity,
} from "../context/auth";
import type { StackAuthProvider } from "../shared/auth-types";
import type { MaybePromise } from "../shared/types";

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

/** Browser identity adapter and hooks bound to synchronous local rules. */
export interface ClientAuth<TAuthorization extends AnyAuthorization>
	extends StackAuthProvider {
	readonly mode: "one-rule";
	readonly authorization: TAuthorization;
	readonly contract: TAuthorization["contract"];
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

/** Browser identity adapter and hooks bound to an evaluator such as remote auth. */
export interface EvaluatedClientAuth<
	TIdentity extends { id: string },
	TPermission,
	TContract extends AnyAuthorizationContract = AnyAuthorizationContract,
> extends StackAuthProvider {
	readonly mode: "one-rule";
	readonly contract: TContract;
	getIdentity: () => Promise<TIdentity | null>;
	useIdentity: () => AuthorizationIdentityState<TIdentity>;
	useCan: (permission: TPermission) => AuthorizationCanState;
	CanAccess: (props: {
		permission: TPermission;
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
 * contract. Local rules remain synchronous; remote evaluators resolve within
 * each mounted hook and are not stored in a reusable authorization cache.
 */
type ResolvedEvaluation = {
	can: boolean;
	forIdentity: unknown;
	forPermission: string;
	error?: Error;
};

function permissionKey(permission: unknown): string {
	if (typeof permission !== "object" || permission === null) {
		return JSON.stringify(permission);
	}
	const request = permission as { id?: unknown; facts?: unknown };
	return JSON.stringify([request.id, request.facts]);
}

export function createClientAuth<
	TAuthorization extends AnyAuthorization,
>(config: {
	authorization: TAuthorization;
	evaluator?: never;
	getIdentity: () => MaybePromise<AuthorizationIdentityInput<TAuthorization> | null>;
	loginPath?: string;
}): ClientAuth<TAuthorization>;
export function createClientAuth<
	TContract extends AnyAuthorizationContract,
>(config: {
	authorization?: never;
	evaluator: AuthorizationEvaluatorFor<TContract>;
	getIdentity: () => MaybePromise<AuthorizationContractIdentityInput<TContract> | null>;
	loginPath?: string;
}): EvaluatedClientAuth<
	AuthorizationContractIdentity<TContract>,
	AuthorizationContractPermissionRequest<TContract>,
	TContract
>;
export function createClientAuth(config: any): any {
	const contractValue =
		config.authorization?.contract ?? config.evaluator?.contract;
	if (!contractValue) {
		throw new TypeError(
			"createClientAuth requires an authorization or evaluator.",
		);
	}
	const contract = contractValue as unknown as {
		parseIdentity: (identity: unknown) => { id: string } | null;
	};
	const runtimeAuthorization = config.authorization as unknown as
		| {
				can: (permission: unknown, identity: unknown) => boolean;
		  }
		| undefined;
	const runtimeEvaluator = config.evaluator as unknown as
		| {
				evaluate: (input: {
					identity: unknown;
					permission: unknown;
				}) => MaybePromise<boolean>;
		  }
		| undefined;
	let clientAuth: StackAuthProvider;

	const useIdentity = (): AuthorizationIdentityState<{ id: string }> => {
		const context = useAuthContext();
		if (context && context.provider !== clientAuth) {
			throw new Error(
				"This bound useIdentity hook must be used with its createClientAuth instance on StackProvider.",
			);
		}
		return useStackIdentity() as AuthorizationIdentityState<{ id: string }>;
	};

	const useCanRuntime = (permissionRequest: unknown): AuthorizationCanState => {
		const context = useAuthContext();
		const identity = context?.identity ?? null;
		const identityPending = context?.isPending ?? true;
		const key = permissionKey(permissionRequest);
		const permissionRef = useRef(permissionRequest);
		permissionRef.current = permissionRequest;
		const [resolved, setResolved] = useState<ResolvedEvaluation | null>(null);

		useEffect(() => {
			if (
				!runtimeEvaluator ||
				!context ||
				context.provider !== clientAuth ||
				identityPending ||
				context.error
			) {
				return;
			}

			let cancelled = false;
			void (async () => {
				try {
					const can = await runtimeEvaluator.evaluate({
						identity,
						permission: permissionRef.current,
					});
					if (typeof can !== "boolean") {
						throw new TypeError(
							"Authorization evaluators must return a boolean.",
						);
					}
					if (!cancelled) {
						setResolved({
							can,
							forIdentity: identity,
							forPermission: key,
						});
					}
				} catch (error) {
					if (!cancelled) {
						setResolved({
							can: false,
							forIdentity: identity,
							forPermission: key,
							error: toError(error),
						});
					}
				}
			})();

			return () => {
				cancelled = true;
			};
		}, [context, identity, identityPending, key]);

		if (!context || context.provider !== clientAuth) {
			throw new Error(
				"This bound useCan hook must be used with its createClientAuth instance on StackProvider.",
			);
		}
		if (context.isPending) return { can: false, isPending: true };
		if (context.error) {
			return { can: false, isPending: false, error: context.error };
		}

		if (runtimeAuthorization) {
			try {
				return {
					can: runtimeAuthorization.can(permissionRequest, context.identity),
					isPending: false,
				};
			} catch (error) {
				return { can: false, isPending: false, error: toError(error) };
			}
		}

		if (
			!resolved ||
			resolved.forIdentity !== identity ||
			resolved.forPermission !== key
		) {
			return { can: false, isPending: true };
		}
		return {
			can: resolved.can,
			isPending: false,
			...(resolved.error ? { error: resolved.error } : {}),
		};
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
		contract: contractValue,
		...(config.authorization ? { authorization: config.authorization } : {}),
		async getIdentity() {
			const identity = await config.getIdentity();
			return contract.parseIdentity(identity);
		},
		...(config.loginPath ? { loginPath: config.loginPath } : {}),
		useIdentity,
		useCan: useCanRuntime,
		CanAccess: CanAccessRuntime,
	} as unknown as StackAuthProvider;

	return clientAuth;
}
