import {
	createEndpoint,
	defineBackendPlugin,
	OperationHttpError,
} from "@btst/stack/plugins/api";
import { z } from "zod";
import { featureFlagsSchema } from "../db";
import {
	createFlagSchema,
	evaluationQuerySchema,
	flagContextSchema,
	listFlagsSchema,
	updateFlagSchema,
} from "../schemas";
import {
	createFeatureFlagsOperations,
	type FeatureFlagsBackendOptions,
} from "./operations";

function decodeContext(encoded?: string) {
	if (!encoded) return undefined;
	try {
		const bytes = Uint8Array.from(atob(encoded), (character) =>
			character.charCodeAt(0),
		);
		return flagContextSchema.parse(
			JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)),
		);
	} catch {
		throw new OperationHttpError(
			400,
			"Context must be base64-encoded JSON with valid targeting fields",
			"INVALID_FLAG_CONTEXT",
		);
	}
}

/** Runtime feature management with public evaluation and private definitions/logs. */
export const featureFlagsBackendPlugin = (
	options: FeatureFlagsBackendOptions = {},
) => {
	z.number()
		.int()
		.min(0)
		.max(86400000)
		.parse(options.cacheTtlMs ?? 30000);
	z.number()
		.int()
		.min(0)
		.max(10000)
		.parse(options.evaluationLogLimit ?? 100);
	return defineBackendPlugin({
		id: "featureFlags",
		dbPlugin: featureFlagsSchema,
		operations: (adapter) => createFeatureFlagsOperations(adapter, options),
		routes: (_adapter, _context, operations) => ({
			listFlags: createEndpoint(
				"/feature-flags/flags",
				{ method: "GET", query: listFlagsSchema, requireRequest: true },
				operations.listFlags.route((ctx) => ctx.query),
			),
			getFlag: createEndpoint(
				"/feature-flags/flags/:key",
				{ method: "GET", requireRequest: true },
				operations.getFlag.route((ctx) => ({ key: ctx.params.key })),
			),
			createFlag: createEndpoint(
				"/feature-flags/flags",
				{ method: "POST", body: createFlagSchema, requireRequest: true },
				operations.createFlag.route((ctx) => ctx.body),
			),
			updateFlag: createEndpoint(
				"/feature-flags/flags/:key",
				{ method: "PATCH", body: updateFlagSchema, requireRequest: true },
				operations.updateFlag.route((ctx) => ({
					key: ctx.params.key,
					data: ctx.body,
				})),
			),
			toggleFlag: createEndpoint(
				"/feature-flags/flags/:key/toggle",
				{
					method: "POST",
					body: z.object({ enabled: z.boolean() }),
					requireRequest: true,
				},
				operations.toggleFlag.route((ctx) => ({
					key: ctx.params.key,
					enabled: ctx.body.enabled,
				})),
			),
			archiveFlag: createEndpoint(
				"/feature-flags/flags/:key/archive",
				{ method: "POST", requireRequest: true },
				operations.archiveFlag.route((ctx) => ({ key: ctx.params.key })),
			),
			listEvaluations: createEndpoint(
				"/feature-flags/flags/:key/log",
				{ method: "GET", requireRequest: true },
				operations.listEvaluations.route((ctx) => ({ key: ctx.params.key })),
			),
			evaluate: createEndpoint(
				"/feature-flags/evaluate/:key",
				{ method: "GET", query: evaluationQuerySchema, requireRequest: true },
				operations.evaluate.route((ctx) => {
					ctx.setHeader("cache-control", "private, no-store");
					return {
						key: ctx.params.key,
						context: decodeContext(ctx.query.context),
					};
				}),
			),
			evaluateVariant: createEndpoint(
				"/feature-flags/variant/:key",
				{ method: "GET", query: evaluationQuerySchema, requireRequest: true },
				operations.evaluateVariant.route((ctx) => {
					ctx.setHeader("cache-control", "private, no-store");
					return {
						key: ctx.params.key,
						context: decodeContext(ctx.query.context),
					};
				}),
			),
			evaluateAll: createEndpoint(
				"/feature-flags/evaluate",
				{ method: "GET", query: evaluationQuerySchema, requireRequest: true },
				operations.evaluateAll.route((ctx) => {
					ctx.setHeader("cache-control", "private, no-store");
					return { context: decodeContext(ctx.query.context) };
				}),
			),
		}),
	});
};

/** Typed feature flag HTTP router. */
export type FeatureFlagsApiRouter = ReturnType<
	ReturnType<typeof featureFlagsBackendPlugin>["routes"]
>;
