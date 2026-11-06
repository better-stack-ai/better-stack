"use client";

import { useEffect } from "react";
import {
	useIdentity,
	useIdentitySourceGeneration,
	useStack,
} from "@btst/stack/context";
import { createResource } from "@btst/stack/plugins/client/hooks";
import { featureFlagsResources, type FlagListParams } from "../../query-keys";
import type { FlagContext } from "../../types";
import { FEATURE_FLAGS_PLUGIN_ID } from "../constants";

const flags = createResource({
	plugin: FEATURE_FLAGS_PLUGIN_ID,
	resources: featureFlagsResources,
});

function useFlagPartition() {
	const { identity, isPending, error } = useIdentity();
	const generation = useIdentitySourceGeneration();
	const { plugins } = useStack();
	const api = plugins?.[FEATURE_FLAGS_PLUGIN_ID]?.api;
	return {
		identity,
		generation,
		isPending,
		error: !!error,
		endpoint: [api?.baseURL, api?.basePath],
		headers: [...new Headers(api?.browserHeaders)],
		credentials: api?.credentials,
	};
}

/** Evaluate one flag for a context. Visible clients refresh every thirty seconds. */
export function useFlag(key: string, context?: FlagContext) {
	const partition = useFlagPartition();
	const enabled = !!key && !partition.isPending && !partition.error;
	const result = flags.flagValues.value.use([key, context, partition], {
		enabled,
	});
	useEvaluationRefresh(result.refetch, enabled);
	return result;
}

/** Evaluate a weighted variant; data contains the assigned key and optional public payload. */
export function useFeatureFlagVariant(key: string, context?: FlagContext) {
	const partition = useFlagPartition();
	const enabled = !!key && !partition.isPending && !partition.error;
	const result = flags.flagValues.variant.use([key, context, partition], {
		enabled,
	});
	useEvaluationRefresh(result.refetch, enabled);
	return result;
}

function useEvaluationRefresh(refetch: () => unknown, enabled: boolean) {
	useEffect(() => {
		if (!enabled) return;
		const interval = setInterval(() => {
			if (document.visibilityState === "visible") void refetch();
		}, 30_000);
		return () => clearInterval(interval);
	}, [refetch, enabled]);
}

/** List flag definitions for management, partitioned by identity and transport. */
export function useFlags(params: FlagListParams = {}) {
	const partition = useFlagPartition();
	return flags.featureFlags.list.use([params, partition], {
		enabled: !partition.isPending && !partition.error,
	});
}

/** Fetch management definitions through the route's suspense boundary. */
export const useSuspenseFlags = (params: FlagListParams = {}) =>
	flags.featureFlags.list.useSuspense([params, useFlagPartition()]);
/** Fetch one editable flag definition. */
export const useFlagDefinition = (key: string) =>
	flags.featureFlags.detail.useSuspense([key, useFlagPartition()]);
/** Fetch recent evaluations for a flag. */
export const useFlagEvaluations = (key: string) =>
	flags.flagEvaluations.list.useSuspense([key, useFlagPartition()]);
/** Create a flag definition. */
export const useCreateFlag = () => flags.featureFlags.create.use();
/** Update a flag's name, targeting and tags. */
export const useUpdateFlag = () => flags.featureFlags.update.use();
/** Change a flag's live status. */
export const useToggleFlag = () => flags.featureFlags.toggle.use();
/** Archive a flag and stop evaluating it as enabled. */
export const useArchiveFlag = () => flags.featureFlags.archive.use();
