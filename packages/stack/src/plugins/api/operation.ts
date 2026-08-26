import { z } from "zod";
import {
	type AnyPermissionDescriptor,
	type PermissionInputFor,
	type PermissionFactsFor,
} from "../../authorization";
import { isServerAuth } from "../../authorization/server";
import type {
	StackIdentity,
	StackServerAuthProvider,
} from "../../shared/auth-types";
import type { MaybePromise } from "../../shared/types";

/** Execution mode and request state supplied by a stack transport. */
export interface OperationRunOptions {
	request?: Request;
	auth?: StackServerAuthProvider;
	internal?: boolean;
}

/** Validated input, trusted facts, and identity passed through an operation. */
export interface OperationContext<TInput, TFacts> {
	input: TInput;
	facts: TFacts;
	identity: StackIdentity | null;
	request?: Request;
}

/** Context available when any stage of an operation pipeline fails. */
export interface OperationErrorContext<TInput, TFacts> {
	/** Present after input validation succeeds. */
	input?: TInput;
	/** Present after trusted facts are derived and validated. */
	facts?: TFacts;
	identity: StackIdentity | null;
	request?: Request;
	error: unknown;
}

/** A validated plugin operation shared by every server transport. */
export interface Operation<
	TInputSchema extends z.ZodTypeAny = z.ZodTypeAny,
	TPermission extends AnyPermissionDescriptor = AnyPermissionDescriptor,
	TResult = unknown,
> {
	readonly input: TInputSchema;
	readonly permission: TPermission;
	run(
		input: z.input<TInputSchema>,
		options?: OperationRunOptions,
	): Promise<TResult>;
}

/** Any plugin operation, for generic stack composition. */
export type AnyOperation = Operation<
	z.ZodTypeAny,
	AnyPermissionDescriptor,
	any
>;
/** Named operations exposed by a backend plugin. */
export type OperationRecord = Record<string, AnyOperation>;

/** Convert operation definitions into their bound callable API. */
export type OperationApi<TOperations extends OperationRecord> = {
	[TKey in keyof TOperations]: (
		input: Parameters<TOperations[TKey]["run"]>[0],
	) => ReturnType<TOperations[TKey]["run"]>;
};

/**
 * Define validation, trusted fact derivation, authorization, lifecycle hooks,
 * and execution once so transports cannot accidentally bypass the pipeline.
 */
export function defineOperation<
	const TInputSchema extends z.ZodTypeAny,
	const TPermission extends AnyPermissionDescriptor,
	TResult,
>(config: {
	input: TInputSchema;
	permission: TPermission;
	facts: (ctx: {
		input: z.output<TInputSchema>;
		request?: Request;
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
		> & { result: TResult },
	) => MaybePromise<void>;
	onError?: (
		ctx: OperationErrorContext<
			z.output<TInputSchema>,
			PermissionFactsFor<TPermission>
		>,
	) => MaybePromise<void>;
}): Operation<TInputSchema, TPermission, TResult> {
	const runtimePermission = config.permission as unknown as (
		facts: unknown,
	) => { facts: unknown };

	return {
		input: config.input,
		permission: config.permission,
		async run(input, options = {}) {
			let parsedInput: z.output<TInputSchema>;
			let parsedFacts: PermissionFactsFor<TPermission>;
			let hasParsedInput = false;
			let hasParsedFacts = false;
			let identity: StackIdentity | null = null;

			try {
				parsedInput = config.input.parse(input);
				hasParsedInput = true;
				const trustedFacts = await config.facts({
					input: parsedInput,
					...(options.request ? { request: options.request } : {}),
				});
				const permissionRequest = runtimePermission(trustedFacts);
				parsedFacts =
					permissionRequest.facts as PermissionFactsFor<TPermission>;
				hasParsedFacts = true;

				if (!options.internal && isServerAuth(options.auth)) {
					if (!options.request) {
						throw new Error(
							"Authorized operations require a request. Use internal for trusted calls.",
						);
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

				const typedContext: OperationContext<
					z.output<TInputSchema>,
					PermissionFactsFor<TPermission>
				> = {
					input: parsedInput,
					facts: parsedFacts,
					identity,
					...(options.request ? { request: options.request } : {}),
				};
				await config.before?.(typedContext);
				const result = await config.execute(typedContext);
				await config.after?.({ ...typedContext, result });
				return result;
			} catch (error) {
				await config.onError?.({
					...(hasParsedInput ? { input: parsedInput! } : {}),
					...(hasParsedFacts ? { facts: parsedFacts! } : {}),
					identity,
					...(options.request ? { request: options.request } : {}),
					error,
				});
				throw error;
			}
		},
	};
}
