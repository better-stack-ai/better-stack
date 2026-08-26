import { z } from "zod";
import {
	type AnyPermissionDescriptor,
	type PermissionFactsFor,
	type PermissionInputFor,
	type PermissionRequestFor,
} from "../../authorization";
import { isServerAuth } from "../../authorization/server";
import type {
	StackIdentity,
	StackServerAuthProvider,
} from "../../shared/auth-types";
import type { MaybePromise } from "../../shared/types";

interface OperationExecutionOptions {
	request?: Request;
	auth?: StackServerAuthProvider;
	skipAuthorization: boolean;
}

type OperationExecutor = (
	input: unknown,
	options: OperationExecutionOptions,
) => Promise<unknown>;

const operationExecutors = new WeakMap<object, OperationExecutor>();

/** Recursively readonly data exposed by an authorized operation lifecycle. */
export type DeepReadonly<T> = T extends (...args: any[]) => unknown
	? T
	: T extends readonly unknown[]
		? { readonly [TKey in keyof T]: DeepReadonly<T[TKey]> }
		: T extends object
			? { readonly [TKey in keyof T]: DeepReadonly<T[TKey]> }
			: T;

function deepFreeze<T>(
	value: T,
	seen = new WeakSet<object>(),
): DeepReadonly<T> {
	if (
		value === null ||
		(typeof value !== "object" && typeof value !== "function")
	) {
		return value as DeepReadonly<T>;
	}

	const object = value as object;
	if (seen.has(object)) return value as DeepReadonly<T>;
	seen.add(object);
	for (const key of Reflect.ownKeys(object)) {
		deepFreeze((object as Record<PropertyKey, unknown>)[key], seen);
	}
	return Object.freeze(object) as DeepReadonly<T>;
}

/** Validated input, trusted facts, and resolved identity passed through an operation. */
export interface OperationContext<TInput, TFacts> {
	readonly input: DeepReadonly<TInput>;
	readonly facts: DeepReadonly<TFacts>;
	readonly identity: StackIdentity | null;
	readonly request?: Request;
}

/** Context available after an authorized operation enters its lifecycle. */
export interface OperationErrorContext<TInput, TFacts>
	extends OperationContext<TInput, TFacts> {
	readonly error: unknown;
}

/** A validated plugin operation shared by every server transport. */
export interface Operation<
	TInputSchema extends z.ZodTypeAny = z.ZodTypeAny,
	TPermission extends AnyPermissionDescriptor = AnyPermissionDescriptor,
	TResult = unknown,
> {
	readonly input: TInputSchema;
	readonly permission: TPermission;
}

/** Any plugin operation, for generic stack composition. */
export type AnyOperation = Operation<
	z.ZodTypeAny,
	AnyPermissionDescriptor,
	any
>;
/** Named operations exposed by a backend plugin. */
export type OperationRecord = Record<string, AnyOperation>;

type OperationInput<TOperation extends AnyOperation> =
	TOperation extends Operation<infer TInputSchema, any, any>
		? z.input<TInputSchema>
		: never;

type OperationResult<TOperation extends AnyOperation> =
	TOperation extends Operation<any, any, infer TResult> ? TResult : never;

/** Infer the permission request enforced by an operation. */
export type OperationPermissionRequest<TOperation extends AnyOperation> =
	TOperation extends Operation<any, infer TPermission, any>
		? PermissionRequestFor<TPermission>
		: never;

/** Infer the stable permission id enforced by an operation. */
export type OperationPermissionId<TOperation extends AnyOperation> =
	OperationPermissionRequest<TOperation>["id"];

/** Convert operation definitions into their bound callable application API. */
export type OperationApi<TOperations extends OperationRecord> = {
	[TKey in keyof TOperations]: (
		input: OperationInput<TOperations[TKey]>,
	) => Promise<OperationResult<TOperations[TKey]>>;
};

/** Operations bound to an HTTP transport; every call requires its request. */
export type RouteOperationApi<TOperations extends OperationRecord> = {
	[TKey in keyof TOperations]: (
		input: OperationInput<TOperations[TKey]>,
		request: Request,
	) => Promise<OperationResult<TOperations[TKey]>>;
};

/**
 * Define validation, trusted fact derivation, authorization, lifecycle hooks,
 * and execution once so transports cannot accidentally bypass the pipeline.
 *
 * The operation descriptor deliberately has no public `run()` method. Stack
 * composition binds it to HTTP, `forRequest()`, and the explicit `internal`
 * namespace so callers cannot forge an internal execution flag.
 */
export function defineOperation<
	const TInputSchema extends z.ZodTypeAny,
	const TPermission extends AnyPermissionDescriptor,
	TResult,
>(config: {
	input: TInputSchema;
	permission: TPermission;
	facts: (ctx: {
		readonly input: DeepReadonly<z.output<TInputSchema>>;
		readonly request?: Request;
	}) => MaybePromise<PermissionInputFor<TPermission>>;
	before?: (
		ctx: OperationContext<
			z.output<TInputSchema>,
			PermissionFactsFor<TPermission>
		>,
	) => MaybePromise<void>;
	execute: (
		ctx: OperationContext<
			z.output<TInputSchema>,
			PermissionFactsFor<TPermission>
		>,
	) => MaybePromise<TResult>;
	after?: (
		ctx: OperationContext<
			z.output<TInputSchema>,
			PermissionFactsFor<TPermission>
		> & { readonly result: DeepReadonly<TResult> },
	) => MaybePromise<void>;
	onError?: (
		ctx: OperationErrorContext<
			z.output<TInputSchema>,
			PermissionFactsFor<TPermission>
		>,
	) => MaybePromise<void>;
}): Operation<TInputSchema, TPermission, TResult> {
	const runtimePermission = config.permission as unknown as {
		(): { facts: unknown };
		(facts: unknown): { facts: unknown };
	};

	const executeOperation = async (
		input: z.input<TInputSchema>,
		options: OperationExecutionOptions,
	): Promise<TResult> => {
		// These stages establish trusted operation context. They intentionally run
		// before the lifecycle boundary, so validation, fact, identity, and rule
		// failures cannot be observed or replaced by post-authorization hooks.
		const parsedInput = deepFreeze(config.input.parse(input));
		const trustedFacts = await config.facts({
			input: parsedInput,
			...(options.request ? { request: options.request } : {}),
		});
		const permissionRequest = config.permission.schema
			? runtimePermission(trustedFacts)
			: runtimePermission();
		const parsedFacts = deepFreeze(
			permissionRequest.facts as PermissionFactsFor<TPermission>,
		);

		let identity: StackIdentity | null = null;
		if (!options.skipAuthorization && isServerAuth(options.auth)) {
			if (!options.request) {
				throw new Error("Authorized operations require a request.");
			}
			const runtimeAuth = options.auth as unknown as {
				authorize: (
					request: Request,
					permission: unknown,
				) => Promise<StackIdentity | null>;
			};
			identity = await runtimeAuth.authorize(
				options.request,
				permissionRequest,
			);
		}

		const context = Object.freeze({
			input: parsedInput,
			facts: parsedFacts,
			identity,
			...(options.request ? { request: options.request } : {}),
		}) satisfies OperationContext<
			z.output<TInputSchema>,
			PermissionFactsFor<TPermission>
		>;

		try {
			await config.before?.(context);
			const result = await config.execute(context);
			await config.after?.(
				Object.freeze({ ...context, result: deepFreeze(result) }),
			);
			return result;
		} catch (error) {
			try {
				await config.onError?.(Object.freeze({ ...context, error }));
			} catch {
				// Error hooks are observational and must not replace the operation error.
			}
			throw error;
		}
	};

	const operation: Operation<TInputSchema, TPermission, TResult> = {
		input: config.input,
		permission: config.permission,
	};
	operationExecutors.set(operation, executeOperation as OperationExecutor);
	return Object.freeze(operation);
}

function getOperationExecutor(operation: AnyOperation): OperationExecutor {
	const executor = operationExecutors.get(operation);
	if (!executor) throw new TypeError("Invalid operation descriptor.");
	return executor;
}

/** @internal Execute an operation through an authorized request transport. */
export function runAuthorizedOperation<TOperation extends AnyOperation>(
	operation: TOperation,
	input: OperationInput<TOperation>,
	options: { request: Request; auth?: StackServerAuthProvider },
): Promise<OperationResult<TOperation>> {
	return getOperationExecutor(operation)(input, {
		request: options.request,
		...(options.auth ? { auth: options.auth } : {}),
		skipAuthorization: false,
	}) as Promise<OperationResult<TOperation>>;
}

/** @internal Execute an operation through the trusted application namespace. */
export function runInternalOperation<TOperation extends AnyOperation>(
	operation: TOperation,
	input: OperationInput<TOperation>,
): Promise<OperationResult<TOperation>> {
	return getOperationExecutor(operation)(input, {
		skipAuthorization: true,
	}) as Promise<OperationResult<TOperation>>;
}
