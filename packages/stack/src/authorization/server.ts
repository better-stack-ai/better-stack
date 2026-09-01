import {
	type AnyAuthorization,
	type AuthorizationIdentity,
	type AuthorizationIdentityInput,
	type AuthorizationPermissionRequest,
} from ".";
import type { StackIdentity } from "../shared/auth-types";
import type { MaybePromise } from "../shared/types";

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
export interface ServerAuth<TAuthorization extends AnyAuthorization> {
	readonly mode: "one-rule";
	readonly authorization: TAuthorization;
	readonly contract: TAuthorization["contract"];
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

/** A server adapter that can also resolve identity from framework headers alone. */
export type HeaderServerAuth<TAuthorization extends AnyAuthorization> =
	ServerAuth<TAuthorization> & {
		getIdentityFromHeaders(ctx: {
			headers: Headers;
		}): Promise<AuthorizationIdentity<TAuthorization> | null>;
	};

interface RequestServerAuthConfig<TAuthorization extends AnyAuthorization> {
	authorization: TAuthorization;
	getIdentity: (ctx: {
		request: Request;
		headers: Headers;
	}) => MaybePromise<AuthorizationIdentityInput<
		NoInfer<TAuthorization>
	> | null>;
	getIdentityFromHeaders?: never;
}

interface HeaderServerAuthConfig<TAuthorization extends AnyAuthorization> {
	authorization: TAuthorization;
	getIdentity?: never;
	getIdentityFromHeaders: (ctx: {
		headers: Headers;
	}) => MaybePromise<AuthorizationIdentityInput<
		NoInfer<TAuthorization>
	> | null>;
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
export function createServerAuth<TAuthorization extends AnyAuthorization>(
	config: HeaderServerAuthConfig<TAuthorization>,
): HeaderServerAuth<TAuthorization>;
export function createServerAuth<TAuthorization extends AnyAuthorization>(
	config: RequestServerAuthConfig<TAuthorization>,
): ServerAuth<TAuthorization>;
export function createServerAuth<TAuthorization extends AnyAuthorization>(
	config:
		| HeaderServerAuthConfig<TAuthorization>
		| RequestServerAuthConfig<TAuthorization>,
): HeaderServerAuth<TAuthorization> {
	const identities = new WeakMap<
		object,
		Promise<AuthorizationIdentity<TAuthorization> | null>
	>();
	const runtimeAuthorization = config.authorization as unknown as {
		can: (permission: unknown, identity: unknown) => boolean;
		parseIdentity: (identity: unknown) => StackIdentity | null;
	};

	const resolveIdentityContext = (input: {
		request?: Request;
		headers: Headers;
	}): Promise<AuthorizationIdentity<TAuthorization> | null> => {
		const headers = input.headers;
		const request = input.request;
		const cacheKey = request ?? headers;
		let pending = identities.get(cacheKey);
		if (!pending) {
			pending = Promise.resolve()
				.then(() => {
					if (config.getIdentityFromHeaders) {
						return config.getIdentityFromHeaders({ headers });
					}
					if (!request) {
						throw new TypeError(
							"Header-only identity resolution requires createServerAuth({ getIdentityFromHeaders }).",
						);
					}
					return config.getIdentity({ headers, request });
				})
				.then(
					(identity) =>
						runtimeAuthorization.parseIdentity(
							identity,
						) as AuthorizationIdentity<TAuthorization> | null,
				);
			identities.set(cacheKey, pending);
		}
		return pending;
	};
	const resolveIdentity = (
		input: Request | { request: Request; headers: Headers },
	) =>
		resolveIdentityContext(
			input instanceof Request
				? { headers: input.headers, request: input }
				: input,
		);
	const resolveIdentityFromHeaders = (input: { headers: Headers }) => {
		if (!config.getIdentityFromHeaders) {
			throw new TypeError(
				"Header-only identity resolution requires createServerAuth({ getIdentityFromHeaders }).",
			);
		}
		return resolveIdentityContext(input);
	};

	const serverAuth = {
		mode: "one-rule",
		authorization: config.authorization,
		contract: config.authorization.contract,
		getIdentity: resolveIdentity,
		getIdentityFromHeaders: resolveIdentityFromHeaders,
		async authorize(request: Request, permissionRequest: unknown) {
			const identity = await resolveIdentity(request);
			const allowed = runtimeAuthorization.can(permissionRequest, identity);
			if (!allowed) {
				throw new AuthorizationError(identity === null ? 401 : 403);
			}
			return identity;
		},
	};

	return serverAuth as unknown as HeaderServerAuth<TAuthorization>;
}
