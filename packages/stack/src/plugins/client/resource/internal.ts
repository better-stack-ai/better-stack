"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { UseMutationResult } from "@tanstack/react-query";
import { usePluginOverrides } from "../../../context";
import { createApiClient } from "../../utils";
import {
	buildQueryKey,
	runResourceMutation,
	type ResourceClient,
	type ResourceDef,
	type ResourceMutationDef,
} from "./queries";

/**
 * The override fields the resource layer needs from `usePluginOverrides`.
 * All plugins expose these — `apiBaseURL`/`apiBasePath` directly, the router
 * fields via the top-level `router` prop merge on `StackProvider`.
 */
export interface ResourceOverrides {
	apiBaseURL: string;
	apiBasePath: string;
	headers?: HeadersInit;
	navigate?: (path: string) => void | Promise<void>;
	refresh?: () => void | Promise<void>;
}

export interface ResourceContext {
	client: ResourceClient;
	headers?: HeadersInit;
	navigate?: (path: string) => void | Promise<void>;
	refresh?: () => void | Promise<void>;
}

/** Resolves the plugin overrides and builds the better-call client. */
export function useResourceContext(plugin: string): ResourceContext {
	const { apiBaseURL, apiBasePath, headers, navigate, refresh } =
		usePluginOverrides<ResourceOverrides>(plugin);
	const client = createApiClient({
		baseURL: apiBaseURL,
		basePath: apiBasePath,
	});
	return { client, headers, navigate, refresh };
}

/**
 * Splits an `invalidates` target (`"posts"` or `"posts.list"`) into a
 * query-key prefix.
 */
function invalidateTargetToKey(target: string): readonly unknown[] {
	const dotIndex = target.indexOf(".");
	if (dotIndex === -1) return [target];
	return [target.slice(0, dotIndex), target.slice(dotIndex + 1)];
}

/**
 * Shared mutation hook used by both the generated mutation hooks and
 * `useForm`. When `def` is undefined (e.g. `useForm` on a resource without a
 * declared `create` mutation), the mutation rejects with a descriptive error.
 */
export function useResourceMutationForDef(
	context: ResourceContext,
	resourceName: string,
	mutationName: string,
	resource: ResourceDef,
	def: ResourceMutationDef<any, any> | undefined,
): UseMutationResult<unknown, Error, unknown> {
	const queryClient = useQueryClient();
	const { client, refresh } = context;

	return useMutation<unknown, Error, unknown>({
		mutationKey: [resourceName, mutationName],
		mutationFn: (vars: unknown) => {
			if (!def) {
				throw new Error(
					`Resource "${resourceName}" has no "${mutationName}" mutation declared`,
				);
			}
			return runResourceMutation(client, def, vars);
		},
		onSuccess: async (result) => {
			if (!def) return;

			// Seed a query cache entry (e.g. detail) from the mutation result
			if (def.setData) {
				const keyArgs = def.setData.args(result);
				const targetName = def.setData.query ?? "detail";
				const targetDef = resource.queries[targetName];
				if (keyArgs && targetDef) {
					queryClient.setQueryData(
						buildQueryKey(resourceName, targetName, targetDef, keyArgs),
						result,
					);
				}
			}

			// Invalidate declared key prefixes — awaited, in declaration order
			for (const target of def.invalidates ?? []) {
				await queryClient.invalidateQueries({
					queryKey: invalidateTargetToKey(target),
				});
			}

			// Refresh server-side cache (e.g. Next.js router cache)
			if (refresh) {
				await refresh();
			}
		},
	});
}
