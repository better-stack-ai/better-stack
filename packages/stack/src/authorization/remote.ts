import { z } from "zod";
import type {
	AnyAuthorizationContract,
	AuthorizationContractIdentity,
	AuthorizationContractPermissionRequest,
	PermissionRequest,
} from ".";
import type { MaybePromise } from "../shared/types";
import { assertJsonSafe } from "./json";

type WirePermission<TPermission> = TPermission extends PermissionRequest<
	infer TId,
	infer TSchema
>
	? TSchema extends z.ZodType<any, any>
		? { readonly id: TId; readonly facts: z.output<TSchema> }
		: { readonly id: TId }
	: never;

/** JSON-safe request sent to a managed authorization backend. */
export interface RemoteAuthorizationRequest<
	TContract extends AnyAuthorizationContract,
> {
	readonly version: string;
	readonly permission: WirePermission<
		AuthorizationContractPermissionRequest<TContract>
	>;
}

/** Response returned by a managed authorization backend. */
export interface RemoteAuthorizationResponse {
	readonly version: string;
	readonly allowed: boolean;
}

/** One permission evaluation against either local or remote policy. */
export interface AuthorizationEvaluation<
	TIdentity extends { id: string },
	TPermission,
> {
	readonly identity: TIdentity | null;
	readonly permission: TPermission;
}

/** Evaluation seam consumed by the bound client authorization hooks. */
export interface AuthorizationEvaluator<
	TIdentity extends { id: string } = { id: string },
	TPermission = unknown,
> {
	readonly contract: AnyAuthorizationContract;
	evaluate(
		input: AuthorizationEvaluation<TIdentity, TPermission>,
	): MaybePromise<boolean>;
}

/** Evaluator type inferred from one portable contract. */
export type AuthorizationEvaluatorFor<
	TContract extends AnyAuthorizationContract,
> = AuthorizationEvaluator<
	AuthorizationContractIdentity<TContract>,
	AuthorizationContractPermissionRequest<TContract>
> & { readonly contract: TContract };

/** Typed transport boundary for a managed authorization backend. */
export type RemoteAuthorizationTransport<
	TContract extends AnyAuthorizationContract,
> = (request: RemoteAuthorizationRequest<TContract>) => MaybePromise<unknown>;

/** A frontend/backend contract version mismatch. This is never a denial. */
export class AuthorizationContractMismatchError extends Error {
	readonly code = "AUTHORIZATION_CONTRACT_MISMATCH" as const;

	constructor(
		readonly expectedVersion: string,
		readonly receivedVersion: string,
	) {
		super(
			`Authorization contract mismatch: expected "${expectedVersion}", received "${receivedVersion}".`,
		);
		this.name = "AuthorizationContractMismatchError";
	}
}

/** A malformed request received by a managed authorization backend. */
export class AuthorizationRequestValidationError extends Error {
	readonly code = "INVALID_AUTHORIZATION_REQUEST" as const;

	constructor(cause: unknown) {
		super("Invalid remote authorization request.", { cause });
		this.name = "AuthorizationRequestValidationError";
	}
}

/** A malformed response received from a managed authorization backend. */
export class AuthorizationResponseValidationError extends Error {
	readonly code = "INVALID_AUTHORIZATION_RESPONSE" as const;

	constructor(cause: unknown) {
		super("Invalid remote authorization response.", { cause });
		this.name = "AuthorizationResponseValidationError";
	}
}

const remoteRequestSchema = z
	.object({
		version: z.string(),
		permission: z
			.object({
				id: z.string(),
				facts: z.unknown().optional(),
			})
			.strict(),
	})
	.strict();

const remoteResponseSchema = z
	.object({
		version: z.string(),
		allowed: z.boolean(),
	})
	.strict();

/**
 * Validate a wire request before an authoritative managed backend evaluates
 * it. The returned permission is rebuilt from the contract's runtime schema.
 */
export function parseRemoteAuthorizationRequest<
	TContract extends AnyAuthorizationContract,
>(
	contract: TContract,
	input: unknown,
): {
	readonly version: string;
	readonly permission: AuthorizationContractPermissionRequest<TContract>;
} {
	try {
		assertJsonSafe(input);
	} catch (error) {
		throw new AuthorizationRequestValidationError(error);
	}
	const parsed = remoteRequestSchema.safeParse(input);
	if (!parsed.success) {
		throw new AuthorizationRequestValidationError(parsed.error);
	}
	if (parsed.data.version !== contract.version) {
		throw new AuthorizationContractMismatchError(
			contract.version,
			parsed.data.version,
		);
	}
	try {
		const runtimeContract = contract as unknown as {
			parsePermission: (value: unknown) => unknown;
		};
		return {
			version: parsed.data.version,
			permission: runtimeContract.parsePermission(
				parsed.data.permission,
			) as AuthorizationContractPermissionRequest<TContract>,
		};
	} catch (error) {
		throw new AuthorizationRequestValidationError(error);
	}
}

/**
 * Create an asynchronous evaluator for a managed backend. The transport owns
 * authentication (for example, credentials on `fetch`) and does not receive
 * the browser's identity as authoritative input.
 */
export function createRemoteAuthorizationEvaluator<
	TContract extends AnyAuthorizationContract,
>(config: {
	contract: TContract;
	transport: RemoteAuthorizationTransport<TContract>;
}): AuthorizationEvaluatorFor<TContract> {
	const runtimeContract = config.contract as unknown as {
		parsePermission: (value: unknown) => {
			id: string;
			facts: unknown;
			permission: { schema: unknown };
		};
	};
	const transport = config.transport as (request: {
		version: string;
		permission: { id: string; facts?: unknown };
	}) => MaybePromise<unknown>;
	const evaluator = Object.freeze({
		contract: config.contract,
		async evaluate(input: { permission: unknown }) {
			let parsedPermission: {
				id: string;
				facts: unknown;
				permission: { schema: unknown };
			};
			try {
				parsedPermission = runtimeContract.parsePermission(input.permission);
			} catch (error) {
				throw new AuthorizationRequestValidationError(error);
			}

			const wirePermission =
				parsedPermission.permission.schema === undefined
					? { id: parsedPermission.id }
					: { id: parsedPermission.id, facts: parsedPermission.facts };
			try {
				assertJsonSafe(wirePermission);
			} catch (error) {
				throw new AuthorizationRequestValidationError(error);
			}
			const response = await transport({
				version: config.contract.version,
				permission: wirePermission,
			});
			try {
				assertJsonSafe(response);
			} catch (error) {
				throw new AuthorizationResponseValidationError(error);
			}
			const parsedResponse = remoteResponseSchema.safeParse(response);
			if (!parsedResponse.success) {
				throw new AuthorizationResponseValidationError(parsedResponse.error);
			}
			if (parsedResponse.data.version !== config.contract.version) {
				throw new AuthorizationContractMismatchError(
					config.contract.version,
					parsedResponse.data.version,
				);
			}
			return parsedResponse.data.allowed;
		},
	});
	return evaluator as unknown as AuthorizationEvaluatorFor<TContract>;
}
