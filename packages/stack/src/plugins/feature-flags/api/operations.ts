import type { DBAdapter as Adapter } from "@btst/db";
import {
	defineOperation,
	type DeepReadonly,
	OperationHttpError,
} from "@btst/stack/plugins/api";
import { z } from "zod";
import { evaluateFlag } from "../evaluate";
import { featureFlagsPermissions as permissions } from "../permissions";
import {
	createFlagSchema,
	flagContextSchema,
	evaluateAllSchema,
	evaluateSchema,
	flagConfigurationSchema,
	keySchema,
	listFlagsSchema,
	updateFlagSchema,
} from "../schemas";
import type {
	FeatureFlag,
	FlagContext,
	FlagEvaluation,
	FlagRecord,
} from "../types";
import { createFlagCache } from "./cache";
import { getFlagByKey, listFlags } from "./getters";
import * as mutations from "./mutations";
import { serializeFlag } from "./serializers";

/** Post-authorization lifecycle context for direct and HTTP calls. */
export interface FeatureFlagsHookContext {
	readonly request?: Request;
}

/** Hooks run after authorization. Throw before toggling to prevent the write. */
export interface FeatureFlagsPluginHooks {
	onBeforeToggle?: (
		flag: DeepReadonly<FeatureFlag>,
		enabled: boolean,
		ctx: FeatureFlagsHookContext,
	) => Promise<void> | void;
	onAfterToggle?: (
		flag: DeepReadonly<FeatureFlag>,
		enabled: boolean,
		ctx: FeatureFlagsHookContext,
	) => Promise<void> | void;
	onEvaluate?: (
		flag: DeepReadonly<FeatureFlag>,
		result: boolean,
		context: DeepReadonly<FlagContext>,
		ctx: FeatureFlagsHookContext,
	) => Promise<void> | void;
}

/** Configuration for definitions cached within this stack instance. */
export interface FeatureFlagsBackendOptions {
	/** Definition snapshot lifetime in milliseconds; zero disables caching. @default 30000 */
	cacheTtlMs?: number;
	/** Maximum evaluations retained across all flags in this process. @default 100 */
	evaluationLogLimit?: number;
	/** Authorized toggle and evaluation callbacks. */
	hooks?: FeatureFlagsPluginHooks;
}

function fail(status: number, message: string): never {
	throw new OperationHttpError(status, message, "FEATURE_FLAGS_ERROR");
}
function requireAdmin(context: { request?: Request; identity: unknown }) {
	if (context.request && !context.identity)
		fail(401, "Sign in to manage feature flags");
}
function immutableFlag(flag: FeatureFlag): DeepReadonly<FeatureFlag> {
	return Object.freeze({
		...flag,
		tags: Object.freeze([...flag.tags]),
		segments: Object.freeze(
			flag.segments.map((rule) =>
				Object.freeze({
					...rule,
					value: Array.isArray(rule.value)
						? Object.freeze([...rule.value])
						: rule.value,
				}),
			),
		),
	});
}

/** One authorized inventory shared by HTTP routes and server callers. */
export function createFeatureFlagsOperations(
	adapter: Adapter,
	options: FeatureFlagsBackendOptions,
) {
	const cache = createFlagCache(adapter, options.cacheTtlMs ?? 30000);
	const evaluations: FlagEvaluation[] = [];
	const limit = options.evaluationLogLimit ?? 100;
	async function requireFlag(key: string) {
		return (
			(await getFlagByKey(adapter, key)) ?? fail(404, "Feature flag not found")
		);
	}
	async function change(
		current: FlagRecord,
		data: DeepReadonly<z.input<typeof updateFlagSchema>>,
		request?: Request,
		archive = false,
	) {
		if (current.archivedAt) fail(409, "Archived flags cannot be changed");
		const flag = serializeFlag(current);
		const parsed = flagConfigurationSchema.safeParse({ ...flag, ...data });
		if (!parsed.success)
			fail(
				400,
				parsed.error.issues[0]?.message ?? "Invalid flag configuration",
			);
		const enabled = archive ? false : (data.enabled ?? current.enabled);
		const changed = enabled !== current.enabled;
		const context = Object.freeze({ request });
		if (changed)
			await options.hooks?.onBeforeToggle?.(
				immutableFlag(flag),
				enabled,
				context,
			);
		const updated = await mutations.updateFlag(
			adapter,
			current,
			updateFlagSchema.parse(data),
			archive,
		);
		if (!updated) fail(409, "Feature flag changed; reload and try again");
		cache.invalidate();
		const result = serializeFlag(updated);
		if (changed)
			await options.hooks?.onAfterToggle?.(
				immutableFlag(result),
				enabled,
				context,
			);
		return result;
	}
	async function evaluate(
		flag: FeatureFlag,
		context: DeepReadonly<FlagContext> = {},
		request?: Request,
	) {
		const evaluationContext = flagContextSchema.parse(context);
		const result = evaluateFlag(flag, evaluationContext);
		if (limit) {
			evaluations.push({
				id: crypto.randomUUID(),
				flagKey: flag.key,
				result,
				context: evaluationContext,
				timestamp: new Date().toISOString(),
			});
			if (evaluations.length > limit) evaluations.shift();
		}
		await options.hooks?.onEvaluate?.(
			immutableFlag(flag),
			result,
			Object.freeze({
				...evaluationContext,
				...(evaluationContext.tags
					? { tags: Object.freeze([...evaluationContext.tags]) }
					: {}),
			}),
			Object.freeze({ request }),
		);
		return result;
	}
	return {
		listFlags: defineOperation({
			input: listFlagsSchema,
			permission: permissions.flags.read,
			facts: () => ({}),
			before: requireAdmin,
			execute: ({ input }) => listFlags(adapter, input.includeArchived),
		}),
		getFlag: defineOperation({
			input: keySchema,
			permission: permissions.flags.read,
			facts: ({ input }) => ({ key: input.key }),
			before: requireAdmin,
			execute: async ({ input }) => serializeFlag(await requireFlag(input.key)),
		}),
		createFlag: defineOperation({
			input: createFlagSchema,
			permission: permissions.flags.create,
			facts: ({ input }) => ({ key: input.key }),
			before: requireAdmin,
			execute: async ({ input }) => {
				const flag = await mutations.createFlag(
					adapter,
					createFlagSchema.parse(input),
				);
				cache.invalidate();
				return serializeFlag(flag);
			},
		}),
		updateFlag: defineOperation({
			input: keySchema.extend({ data: updateFlagSchema }),
			permission: permissions.flags.update,
			facts: ({ input }) => ({ key: input.key }),
			additionalPermissions: ({ input }) =>
				input.data.enabled === undefined
					? []
					: [permissions.flags.toggle({ key: input.key })],
			before: requireAdmin,
			execute: async ({ input, request }) =>
				change(await requireFlag(input.key), input.data, request),
		}),
		toggleFlag: defineOperation({
			input: keySchema.extend({ enabled: z.boolean() }),
			permission: permissions.flags.toggle,
			facts: ({ input }) => ({ key: input.key }),
			before: requireAdmin,
			execute: async ({ input, request }) =>
				change(
					await requireFlag(input.key),
					{ enabled: input.enabled },
					request,
				),
		}),
		archiveFlag: defineOperation({
			input: keySchema,
			permission: permissions.flags.archive,
			facts: ({ input }) => ({ key: input.key }),
			before: requireAdmin,
			execute: async ({ input, request }) =>
				change(await requireFlag(input.key), {}, request, true),
		}),
		listEvaluations: defineOperation({
			input: keySchema,
			permission: permissions.evaluations.read,
			facts: ({ input }) => ({ key: input.key }),
			before: requireAdmin,
			execute: async ({ input }) => {
				await requireFlag(input.key);
				return evaluations
					.filter((item) => item.flagKey === input.key)
					.toReversed()
					.map((item) => ({
						...item,
						context: {
							...item.context,
							...(item.context.tags ? { tags: [...item.context.tags] } : {}),
						},
					}));
			},
		}),
		evaluate: defineOperation({
			input: evaluateSchema,
			permission: permissions.evaluations.evaluate,
			access: "public",
			facts: ({ input }) => ({ scope: "single" as const, key: input.key }),
			execute: async ({ input, request }) => {
				const flag = (await cache.load()).find(
					(flag) => flag.key === input.key,
				);
				return flag ? evaluate(flag, input.context, request) : false;
			},
		}),
		evaluateAll: defineOperation({
			input: evaluateAllSchema,
			permission: permissions.evaluations.evaluate,
			access: "public",
			facts: () => ({ scope: "all" as const }),
			execute: async ({ input, request }) =>
				Object.fromEntries(
					await Promise.all(
						(await cache.load()).map(
							async (flag) =>
								[
									flag.key,
									await evaluate(flag, input.context, request),
								] as const,
						),
					),
				),
		}),
	};
}
