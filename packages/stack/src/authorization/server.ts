import {
	type AnyAuthorization,
	type AuthorizationIdentity,
	type AuthorizationIdentityInput,
	type AuthorizationPermissionRequest,
} from ".";
import type {
	StackIdentity,
	StackServerAuthProvider,
} from "../shared/auth-types";

type MaybePromise<T> = T | Promise<T>;

/** An ordinary authorization denial with its corresponding HTTP status. */
export class AuthorizationError extends Error {
	readonly statusCode: 401 | 403;
	readonly code: "UNAUTHORIZED" | "FORBIDDEN";

	constructor(statusCode: 401 | 403, message?: string) {
		super(
			message ??
				(statusCode === 401 ? "Authentication required" : "Access denied"),
		);
		this.name = "AuthorizationError";
		this.statusCode = statusCode;
		this.code = statusCode === 401 ? "UNAUTHORIZED" : "FORBIDDEN";
	}
}

/** Server identity adapter bound to one authorization contract. */
export interface ServerAuth<TAuthorization extends AnyAuthorization>
	extends StackServerAuthProvider {
	readonly mode: "one-rule";
	readonly authorization: TAuthorization;
	getIdentity(
		request: Request,
	): Promise<AuthorizationIdentity<TAuthorization> | null>;
	getIdentity(ctx: {
		request: Request;
		headers: Headers;
	}): Promise<AuthorizationIdentity<TAuthorization> | null>;
	authorize(
		request: Request,
		permission: AuthorizationPermissionRequest<TAuthorization>,
	): Promise<AuthorizationIdentity<TAuthorization> | null>;
}

/** True for the typed server adapter introduced by the one-rule auth path. */
export function isServerAuth(
	value: unknown,
): value is ServerAuth<AnyAuthorization> {
	return (
		typeof value === "object" &&
		value !== null &&
		(value as { mode?: string }).mode === "one-rule" &&
		typeof (value as { authorize?: unknown }).authorize === "function"
	);
}

/** Bind server identity resolution to the same authorization contract as the browser. */
export function createServerAuth<
	TAuthorization extends AnyAuthorization,
>(config: {
	authorization: TAuthorization;
	getIdentity: (ctx: {
		request: Request;
		headers: Headers;
	}) => MaybePromise<AuthorizationIdentityInput<TAuthorization> | null>;
}): ServerAuth<TAuthorization> {
	const identities = new WeakMap<
		Request,
		Promise<AuthorizationIdentity<TAuthorization> | null>
	>();
	const runtimeAuthorization = config.authorization as unknown as {
		can: (permission: unknown, identity: unknown) => boolean;
		parseIdentity: (identity: unknown) => StackIdentity | null;
	};

	const resolveIdentity = (
		input: Request | { request: Request; headers: Headers },
	): Promise<AuthorizationIdentity<TAuthorization> | null> => {
		const request = input instanceof Request ? input : input.request;
		let pending = identities.get(request);
		if (!pending) {
			pending = Promise.resolve(
				config.getIdentity({ request, headers: request.headers }),
			).then(
				(identity) =>
					runtimeAuthorization.parseIdentity(
						identity,
					) as AuthorizationIdentity<TAuthorization> | null,
			);
			identities.set(request, pending);
		}
		return pending;
	};

	const serverAuth = {
		mode: "one-rule",
		authorization: config.authorization,
		getIdentity: resolveIdentity,
		async authorize(request: Request, permissionRequest: unknown) {
			const identity = await resolveIdentity(request);
			const allowed = runtimeAuthorization.can(permissionRequest, identity);
			if (!allowed) {
				throw new AuthorizationError(identity === null ? 401 : 403);
			}
			return identity;
		},
	};

	return serverAuth as unknown as ServerAuth<TAuthorization>;
}
