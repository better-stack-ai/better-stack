import { z } from "zod";
import {
	type AnyPermissionDescriptor,
	type PermissionInputFor,
	type PermissionParamsFor,
} from "../../authorization";
import { isServerAuth } from "../../authorization/server";
import type {
	StackIdentity,
	StackServerAuthProvider,
} from "../../shared/auth-types";

type MaybePromise<T> = T | Promise<T>;

export interface OperationRunOptions {
	request?: Request;
	auth?: StackServerAuthProvider;
	internal?: boolean;
}

export interface OperationContext<TInput, TFacts> {
	input: TInput;
	facts: TFacts;
	identity: StackIdentity | null;
	request?: Request;
}

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

export type AnyOperation = Operation<
	z.ZodTypeAny,
	AnyPermissionDescriptor,
	any
>;
export type OperationRecord = Record<string, AnyOperation>;

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
			PermissionParamsFor<TPermission>
		>,
	) => MaybePromise<void>;
	execute: (
		ctx: OperationContext<
			z.output<TInputSchema>,
			PermissionParamsFor<TPermission>
		>,
	) => MaybePromise<TResult>;
	after?: (
		ctx: OperationContext<
			z.output<TInputSchema>,
			PermissionParamsFor<TPermission>
		> & { result: TResult },
	) => MaybePromise<void>;
	onError?: (
		ctx: OperationContext<
			z.output<TInputSchema>,
			PermissionParamsFor<TPermission>
		> & { error: unknown },
	) => MaybePromise<void>;
}): Operation<TInputSchema, TPermission, TResult> {
	const runtimePermission = config.permission as unknown as (
		facts: unknown,
	) => { params: unknown };

	return {
		input: config.input,
		permission: config.permission,
		async run(input, options = {}) {
			const parsedInput = config.input.parse(input);
			const rawFacts = await config.facts({
				input: parsedInput,
				...(options.request ? { request: options.request } : {}),
			});
			const permissionRequest = runtimePermission(rawFacts);
			const context: OperationContext<unknown, unknown> = {
				input: parsedInput,
				facts: permissionRequest.params,
				identity: null,
				...(options.request ? { request: options.request } : {}),
			};

			try {
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
					context.identity = await runtimeAuth.authorize(
						options.request,
						permissionRequest,
					);
				}

				const typedContext = context as OperationContext<
					z.output<TInputSchema>,
					PermissionParamsFor<TPermission>
				>;
				await config.before?.(typedContext);
				const result = await config.execute(typedContext);
				await config.after?.({ ...typedContext, result });
				return result;
			} catch (error) {
				await config.onError?.({
					...(context as OperationContext<
						z.output<TInputSchema>,
						PermissionParamsFor<TPermission>
					>),
					error,
				});
				throw error;
			}
		},
	};
}
