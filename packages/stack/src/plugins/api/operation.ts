import { z } from "zod";
import {
	type AnyPermissionDescriptor,
	type PermissionFactsFor,
	type PermissionInputFor,
	type PermissionRequest,
	type PermissionRequestFor,
} from "../../authorization";
import { AuthorizationError, isServerAuth } from "../../authorization/server";
import type {
	CanParams,
	StackIdentity,
	StackServerAuthProvider,
} from "../../shared/auth-types";
import type { MaybePromise } from "../../shared/types";

interface OperationExecutionOptions {
	request?: Request;
	auth?: StackServerAuthProvider;
	resolveIdentity?: () => Promise<StackIdentity | null>;
	skipAuthorization: boolean;
}

type OperationExecutor = (
	input: unknown,
	options: OperationExecutionOptions,
) => Promise<unknown>;

const operationExecutors = new WeakMap<object, OperationExecutor>();

/** Plain values accepted at the immutable operation lifecycle boundary. */
export type OperationData =
	| string
	| number
	| boolean
	| bigint
	| null
	| undefined
	| readonly OperationData[]
	| { readonly [key: string]: OperationData };

/** Recursively readonly data exposed by an authorized operation lifecycle. */
export type DeepReadonly<T> = T extends (...args: any[]) => unknown
	? T
	: T extends readonly unknown[]
		? { readonly [TKey in keyof T]: DeepReadonly<T[TKey]> }
		: T extends object
			? { readonly [TKey in keyof T]: DeepReadonly<T[TKey]> }
			: T;

function freezeOperationData<T>(
	value: T,
	seen = new WeakSet<object>(),
	path = "operation data",
): DeepReadonly<T> {
	if (
		value === null ||
		(typeof value !== "object" && typeof value !== "function")
	) {
		if (typeof value === "function" || typeof value === "symbol") {
			throw new TypeError(`${path} must contain only plain immutable data.`);
		}
		return value as DeepReadonly<T>;
	}

	const object = value as object;
	const prototype = Object.getPrototypeOf(object);
	if (
		!Array.isArray(object) &&
		prototype !== Object.prototype &&
		prototype !== null
	) {
		throw new TypeError(
			`${path} must contain only plain objects and arrays; mutable built-ins are not supported.`,
		);
	}
	if (seen.has(object)) {
		throw new TypeError(`${path} must not contain circular references.`);
	}
	seen.add(object);
	for (const key of Reflect.ownKeys(object)) {
		if (typeof key === "symbol") {
			throw new TypeError(`${path} must not contain symbol properties.`);
		}
		const descriptor = Object.getOwnPropertyDescriptor(object, key);
		if (descriptor && !("value" in descriptor)) {
			throw new TypeError(`${path} must not contain accessor properties.`);
		}
		freezeOperationData(
			(object as Record<PropertyKey, unknown>)[key],
			seen,
			`${path}.${key}`,
		);
	}
	seen.delete(object);
	return Object.freeze(object) as DeepReadonly<T>;
}

type LegacyAuthorizationDeclaration = CanParams | { readonly public: true };

async function enforceLegacyAuthorization(
	auth: StackServerAuthProvider,
	request: Request,
	identity: DeepReadonly<StackIdentity> | null,
	declaration: LegacyAuthorizationDeclaration,
): Promise<void> {
	if ("public" in declaration) {
		if (declaration.public !== true) {
			throw new TypeError(
				"Operation RC authorization must return a valid string permission or { public: true }.",
			);
		}
		return;
	}
	if (
		typeof declaration.resource !== "string" ||
		declaration.resource.length === 0 ||
		typeof declaration.action !== "string" ||
		declaration.action.length === 0
	) {
		throw new TypeError(
			"Operation RC authorization must return a valid string permission or { public: true }.",
		);
	}
	if (!auth.can) return;
	const permission = freezeOperationData(
		declaration,
		new WeakSet(),
		"legacy operation permission",
	) as DeepReadonly<CanParams>;
	const allowed = await auth.can({
		...permission,
		identity,
		headers: request.headers,
	});
	if (typeof allowed !== "boolean") {
		throw new TypeError("StackServerAuthProvider.can() must return a boolean.");
	}
	if (!allowed) {
		throw new AuthorizationError(identity === null ? 401 : 403);
	}
}

/** Validated input, trusted facts, and resolved identity passed through an operation. */
export interface OperationContext<TInput, TFacts> {
	readonly input: DeepReadonly<TInput>;
	readonly facts: DeepReadonly<TFacts>;
	readonly identity: DeepReadonly<StackIdentity> | null;
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
	) => Promise<DeepReadonly<OperationResult<TOperations[TKey]>>>;
};

/** Operations bound to an HTTP transport; every call requires its request. */
export type RouteOperationApi<TOperations extends OperationRecord> = {
	[TKey in keyof TOperations]: (
		input: OperationInput<TOperations[TKey]>,
		request: Request,
	) => Promise<DeepReadonly<OperationResult<TOperations[TKey]>>>;
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
	const TExecute extends (
		ctx: OperationContext<
			z.output<TInputSchema>,
			PermissionFactsFor<TPermission>
		>,
	) => MaybePromise<OperationData>,
>(config: {
	input: [z.output<TInputSchema>] extends [OperationData]
		? TInputSchema
		: never;
	permission: [PermissionFactsFor<TPermission>] extends [OperationData]
		? TPermission
		: never;
	/**
	 * @deprecated Temporary v3 RC bridge removed by #193. Map trusted operation
	 * facts to the previous string permission, or explicitly declare the RC path
	 * public. Schema-backed authorization never reads this metadata.
	 */
	legacyAuthorization?: (ctx: {
		readonly input: DeepReadonly<z.output<TInputSchema>>;
		readonly facts: DeepReadonly<PermissionFactsFor<TPermission>>;
	}) => LegacyAuthorizationDeclaration;
	facts: (ctx: {
		readonly input: DeepReadonly<z.output<TInputSchema>>;
		readonly request?: Request;
	}) => MaybePromise<PermissionInputFor<TPermission>>;
	/**
	 * Derive any compound permission checks from validated input and trusted
	 * primary facts after request execution authorizes the primary permission.
	 * Every returned request is authorized before lifecycle hooks run; trusted
	 * internal execution skips only the evaluations.
	 */
	additionalPermissions?: (ctx: {
		readonly input: DeepReadonly<z.output<TInputSchema>>;
		readonly facts: DeepReadonly<PermissionFactsFor<TPermission>>;
		readonly request?: Request;
	}) => MaybePromise<readonly PermissionRequest<string, any>[]>;
	/**
	 * @deprecated Temporary v3 RC bridge removed by #193. Explicitly map each
	 * compound schema-backed permission to its former string permission.
	 */
	legacyAdditionalAuthorization?: (
		permission: Pick<PermissionRequest<string, any>, "id" | "facts">,
	) => LegacyAuthorizationDeclaration;
	before?: (
		ctx: OperationContext<
			z.output<TInputSchema>,
			PermissionFactsFor<TPermission>
		>,
	) => MaybePromise<void>;
	execute: TExecute;
	after?: (
		ctx: OperationContext<
			z.output<TInputSchema>,
			PermissionFactsFor<TPermission>
		> & {
			readonly result: DeepReadonly<Awaited<ReturnType<TExecute>>>;
		},
	) => MaybePromise<void>;
	onError?: (
		ctx: OperationErrorContext<
			z.output<TInputSchema>,
			PermissionFactsFor<TPermission>
		>,
	) => MaybePromise<void>;
}): Operation<TInputSchema, TPermission, Awaited<ReturnType<TExecute>>> {
	type TResult = Awaited<ReturnType<TExecute>>;
	const runtimePermission = config.permission as unknown as {
		(): { facts: unknown };
		(facts: unknown): { facts: unknown };
	};

	const executeOperation = async (
		input: z.input<TInputSchema>,
		options: OperationExecutionOptions,
	): Promise<unknown> => {
		// These stages establish trusted operation context. They intentionally run
		// before the lifecycle boundary, so validation, fact, identity, and rule
		// failures cannot be observed or replaced by post-authorization hooks.
		const parsedInput = freezeOperationData(
			config.input.parse(input),
			new WeakSet(),
			"operation input",
		);
		const trustedFacts = await config.facts({
			input: parsedInput,
			...(options.request ? { request: options.request } : {}),
		});
		const permissionRequest = config.permission.schema
			? runtimePermission(trustedFacts)
			: runtimePermission();
		const parsedFacts = freezeOperationData(
			permissionRequest.facts as PermissionFactsFor<TPermission>,
			new WeakSet(),
			"operation facts",
		);
		let identity: DeepReadonly<StackIdentity> | null = null;
		let runtimeAuth:
			| {
					authorize: (
						request: Request,
						permission: unknown,
					) => Promise<StackIdentity | null>;
			  }
			| undefined;
		let legacyAuthContext:
			| {
					auth: StackServerAuthProvider;
					request: Request;
					identity: DeepReadonly<StackIdentity> | null;
			  }
			| undefined;
		if (!options.skipAuthorization && isServerAuth(options.auth)) {
			if (!options.request) {
				throw new Error("Authorized operations require a request.");
			}
			runtimeAuth = options.auth as unknown as {
				authorize: (
					request: Request,
					permission: unknown,
				) => Promise<StackIdentity | null>;
			};
			const authorizedIdentity = await runtimeAuth.authorize(
				options.request,
				permissionRequest,
			);
			identity = authorizedIdentity
				? freezeOperationData(
						authorizedIdentity,
						new WeakSet(),
						"operation identity",
					)
				: null;
		} else if (!options.skipAuthorization && options.auth) {
			if (!options.request) {
				throw new Error("Identity-aware operations require a request.");
			}
			const legacyIdentity = options.resolveIdentity
				? await options.resolveIdentity()
				: await options.auth.getIdentity({
						headers: options.request.headers,
						request: options.request,
					});
			identity = legacyIdentity
				? freezeOperationData(
						legacyIdentity,
						new WeakSet(),
						"operation identity",
					)
				: null;

			const legacyAuthorization = config.legacyAuthorization?.({
				input: parsedInput,
				facts: parsedFacts,
			});
			if (!legacyAuthorization) {
				throw new TypeError(
					"Operation does not declare RC server authorization compatibility. Use createServerAuth().",
				);
			}
			await enforceLegacyAuthorization(
				options.auth,
				options.request,
				identity,
				legacyAuthorization,
			);
			legacyAuthContext = {
				auth: options.auth,
				request: options.request,
				identity,
			};
		}

		// Compound checks may perform trusted reads. Derive them only after the
		// primary request is authorized so denied callers cannot trigger that work
		// or replace the primary 401/403 with a derivation error. Internal execution
		// still derives the requests because execute() may validate their snapshots.
		const additionalPermissions =
			(await config.additionalPermissions?.({
				input: parsedInput,
				facts: parsedFacts,
				...(options.request ? { request: options.request } : {}),
			})) ?? [];
		if (!Array.isArray(additionalPermissions)) {
			throw new TypeError(
				"Operation additionalPermissions() must return an array of permission requests.",
			);
		}
		if (runtimeAuth && options.request) {
			for (const additionalPermission of additionalPermissions) {
				await runtimeAuth.authorize(options.request, additionalPermission);
			}
		} else if (legacyAuthContext) {
			for (const additionalPermission of additionalPermissions) {
				const legacyAuthorization = config.legacyAdditionalAuthorization?.({
					id: additionalPermission.id,
					facts: additionalPermission.facts,
				});
				if (!legacyAuthorization) {
					throw new TypeError(
						"Operation does not map an additional permission for RC server authorization. Use createServerAuth().",
					);
				}
				await enforceLegacyAuthorization(
					legacyAuthContext.auth,
					legacyAuthContext.request,
					legacyAuthContext.identity,
					legacyAuthorization,
				);
			}
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
			const result = freezeOperationData<unknown>(
				await config.execute(context),
				new WeakSet(),
				"operation result",
			);
			const after = config.after as
				| ((ctx: unknown) => MaybePromise<void>)
				| undefined;
			await after?.(Object.freeze({ ...context, result }));
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
	options: {
		request: Request;
		auth?: StackServerAuthProvider;
		resolveIdentity?: () => Promise<StackIdentity | null>;
	},
): Promise<DeepReadonly<OperationResult<TOperation>>> {
	return getOperationExecutor(operation)(input, {
		request: options.request,
		...(options.auth ? { auth: options.auth } : {}),
		...(options.resolveIdentity
			? { resolveIdentity: options.resolveIdentity }
			: {}),
		skipAuthorization: false,
	}) as Promise<DeepReadonly<OperationResult<TOperation>>>;
}

/** @internal Execute an operation through the trusted application namespace. */
export function runInternalOperation<TOperation extends AnyOperation>(
	operation: TOperation,
	input: OperationInput<TOperation>,
): Promise<DeepReadonly<OperationResult<TOperation>>> {
	return getOperationExecutor(operation)(input, {
		skipAuthorization: true,
	}) as Promise<DeepReadonly<OperationResult<TOperation>>>;
}
