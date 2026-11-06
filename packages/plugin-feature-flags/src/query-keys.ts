import {
	createResourceQueryKeys,
	type ResourceClient,
	type ResourcesDeclaration,
} from "@btst/stack/plugins/client";
import type {
	FeatureFlag,
	FlagContext,
	FlagEvaluation,
	FlagVariantResult,
} from "./types";
import type { CreateFlagInput, UpdateFlagInput } from "./schemas";

/** Optional management filters. Archived flags are hidden by default. */
export interface FlagListParams {
	includeArchived?: boolean;
}

function contextQuery(context?: FlagContext) {
	if (!context) return undefined;
	const bytes = new TextEncoder().encode(JSON.stringify(context));
	return {
		context: btoa(
			Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""),
		),
	};
}

const invalidates = ["featureFlags", "flagValues", "flagEvaluations"];

/** Shared request declarations for feature flag hooks and server query consumers. */
export const featureFlagsResources = {
	featureFlags: {
		queries: {
			list: {
				path: "/feature-flags/flags",
				query: (params: FlagListParams = {}, _partition?: unknown) => ({
					...params,
				}),
				select: (data: unknown): FeatureFlag[] => data as FeatureFlag[],
			},
			detail: {
				path: "/feature-flags/flags/:key",
				params: (key: string, _partition?: unknown) => ({ key }),
				select: (data: unknown): FeatureFlag => data as FeatureFlag,
			},
		},
		mutations: {
			create: {
				path: "@post/feature-flags/flags",
				method: "POST",
				input: (body: CreateFlagInput) => ({ body }),
				select: (data: unknown): FeatureFlag => data as FeatureFlag,
				invalidates,
				refetchType: "all",
				refresh: false,
			},
			update: {
				path: "@patch/feature-flags/flags/:key",
				method: "PATCH",
				input: ({ key, data }: { key: string; data: UpdateFlagInput }) => ({
					params: { key },
					body: data,
				}),
				select: (data: unknown): FeatureFlag => data as FeatureFlag,
				invalidates,
				refetchType: "all",
				refresh: false,
			},
			toggle: {
				path: "@post/feature-flags/flags/:key/toggle",
				method: "POST",
				input: ({ key, enabled }: { key: string; enabled: boolean }) => ({
					params: { key },
					body: { enabled },
				}),
				select: (data: unknown): FeatureFlag => data as FeatureFlag,
				invalidates,
				refetchType: "all",
				refresh: false,
			},
			archive: {
				path: "@post/feature-flags/flags/:key/archive",
				method: "POST",
				input: (key: string) => ({ params: { key }, body: {} }),
				select: (data: unknown): FeatureFlag => data as FeatureFlag,
				invalidates,
				refetchType: "all",
				refresh: false,
			},
		},
	},
	flagValues: {
		queries: {
			variant: {
				path: "/feature-flags/variant/:key",
				params: (
					key: string,
					_context?: FlagContext,
					_partition?: unknown,
				) => ({ key }),
				query: (_key: string, context?: FlagContext, _partition?: unknown) =>
					contextQuery(context),
				select: (data: unknown): FlagVariantResult => data as FlagVariantResult,
			},
			value: {
				path: "/feature-flags/evaluate/:key",
				params: (
					key: string,
					_context?: FlagContext,
					_partition?: unknown,
				) => ({ key }),
				query: (_key: string, context?: FlagContext, _partition?: unknown) =>
					contextQuery(context),
				select: (data: unknown): boolean => data === true,
			},
		},
	},
	flagEvaluations: {
		queries: {
			list: {
				path: "/feature-flags/flags/:key/log",
				params: (key: string, _partition?: unknown) => ({ key }),
				select: (data: unknown): FlagEvaluation[] => data as FlagEvaluation[],
			},
		},
	},
} satisfies ResourcesDeclaration;

/** Build server-safe options using the same cache keys as the browser hooks. */
export function createFeatureFlagsQueryKeys(
	client: ResourceClient,
	headers?: HeadersInit,
) {
	return createResourceQueryKeys(client, featureFlagsResources, headers);
}
