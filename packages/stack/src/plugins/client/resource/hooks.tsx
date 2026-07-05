"use client";

/**
 * `createResource` — generates the repetitive React Query plumbing for a
 * plugin's resources from a single declaration: plain queries, suspense
 * queries, infinite queries, mutations with invalidation, plus `useForm`
 * and `useSelect` per resource.
 *
 * The same declaration feeds `createResourceQueryKeys` (see `./queries`),
 * so SSR loaders and SSG `prefetchForRoute` keys stay in sync with hooks.
 *
 * @example
 * ```ts
 * const blog = createResource({ plugin: "blog", resources: blogResources });
 *
 * export const usePost = (slug?: string) =>
 *   blog.posts.detail.use([slug ?? ""], { enabled: !!slug });
 * export const useCreatePost = () => blog.posts.create.use();
 * ```
 */

import {
	useInfiniteQuery,
	useQuery,
	useSuspenseInfiniteQuery,
	useSuspenseQuery,
	type InfiniteData,
	type UseInfiniteQueryResult,
	type UseMutationResult,
	type UseQueryResult,
	type UseSuspenseInfiniteQueryResult,
	type UseSuspenseQueryResult,
} from "@tanstack/react-query";
import { SHARED_QUERY_CONFIG } from "./errors";
import {
	buildQueryKey,
	resolvePageSize,
	runResourceQuery,
	type ResourceDef,
	type ResourceMutationDef,
	type ResourceMutationResult,
	type ResourceMutationVars,
	type ResourceQueryArgs,
	type ResourceQueryData,
	type ResourceQueryDef,
	type ResourcesDeclaration,
} from "./queries";
import { useResourceContext, useResourceMutationForDef } from "./internal";
import {
	createUseForm,
	type ResourceFormConfig,
	type ResourceFormResult,
} from "./use-form";
import {
	createUseSelect,
	type ResourceSelectConfig,
	type ResourceSelectResult,
} from "./use-select";

/** Per-call options for generated query hooks. */
export interface ResourceQueryOptions {
	enabled?: boolean;
}

/** Hooks generated for a non-infinite query declaration. */
export interface ResourcePlainQueryHooks<
	TArgs extends readonly unknown[],
	TData,
> {
	use(
		args?: TArgs,
		options?: ResourceQueryOptions,
	): UseQueryResult<TData, Error>;
	/** Suspense variant — re-throws refetch errors for Error Boundaries */
	useSuspense(args?: TArgs): UseSuspenseQueryResult<TData, Error>;
}

/** Hooks generated for an infinite query declaration. */
export interface ResourceInfiniteQueryHooks<
	TArgs extends readonly unknown[],
	TData,
> {
	useInfinite(
		args?: TArgs,
		options?: ResourceQueryOptions,
	): UseInfiniteQueryResult<InfiniteData<TData, number>, Error>;
	/** Suspense variant — re-throws refetch errors for Error Boundaries */
	useSuspenseInfinite(
		args?: TArgs,
	): UseSuspenseInfiniteQueryResult<InfiniteData<TData, number>, Error>;
}

/** Dispatches to the plain or infinite hook set based on the declaration. */
export type ResourceQueryHooks<TDef> = TDef extends { infinite: true }
	? ResourceInfiniteQueryHooks<ResourceQueryArgs<TDef>, ResourceQueryData<TDef>>
	: ResourcePlainQueryHooks<ResourceQueryArgs<TDef>, ResourceQueryData<TDef>>;

/** Hook generated for a mutation declaration. */
export interface ResourceMutationHooks<TDef> {
	use(): UseMutationResult<
		ResourceMutationResult<TDef>,
		Error,
		ResourceMutationVars<TDef>
	>;
}

/** The detail-query record type of a resource (used by `useForm` defaults). */
export type ResourceDetailData<TResource extends ResourceDef> =
	TResource["queries"] extends { detail: infer TDetail }
		? ResourceQueryData<TDetail>
		: unknown;

/** The generated handle for a single resource. */
export type ResourceHandle<TResource extends ResourceDef> = {
	[Q in keyof TResource["queries"]]: ResourceQueryHooks<
		TResource["queries"][Q]
	>;
} & {
	[M in keyof NonNullable<TResource["mutations"]>]: ResourceMutationHooks<
		NonNullable<TResource["mutations"]>[M]
	>;
} & {
	useForm<TValues, TResult = unknown, TRecord = ResourceDetailData<TResource>>(
		config: ResourceFormConfig<TValues, TRecord, TResult>,
	): ResourceFormResult<TValues, TRecord, TResult>;
	useSelect<TItem>(
		config: ResourceSelectConfig<TItem>,
	): ResourceSelectResult<TItem>;
};

/** The generated resource handles, keyed by resource name. */
export type Resource<TResources extends ResourcesDeclaration> = {
	[R in keyof TResources]: ResourceHandle<TResources[R]>;
};

export interface CreateResourceConfig<TResources extends ResourcesDeclaration> {
	/** Plugin name used to resolve overrides (`usePluginOverrides(plugin)`) */
	plugin: string;
	resources: TResources;
}

function createQueryHooks(
	plugin: string,
	resourceName: string,
	queryName: string,
	def: ResourceQueryDef<any, any>,
) {
	const useQueryConfig = (args: readonly unknown[]) => {
		const context = useResourceContext(plugin);
		return {
			queryKey: buildQueryKey(resourceName, queryName, def, args),
			queryFn: (queryContext?: { pageParam?: unknown }) =>
				runResourceQuery(
					context.client,
					def,
					args,
					queryContext?.pageParam,
					context.headers,
				),
			...SHARED_QUERY_CONFIG,
		};
	};

	const infiniteExtras = (args: readonly unknown[]) => {
		const pageSize = resolvePageSize(def, args);
		return {
			initialPageParam: 0,
			getNextPageParam: (lastPage: unknown, allPages: unknown[]) => {
				const items = (lastPage as unknown[]) ?? [];
				if (items.length < pageSize) return undefined;
				return allPages.length * pageSize;
			},
		};
	};

	return {
		use(args: readonly unknown[] = [], options?: ResourceQueryOptions) {
			return useQuery({
				...useQueryConfig(args),
				...(options?.enabled !== undefined ? { enabled: options.enabled } : {}),
			});
		},
		useSuspense(args: readonly unknown[] = []) {
			const result = useSuspenseQuery(useQueryConfig(args));
			// useSuspenseQuery only throws on initial fetch — manually re-throw
			// refetch errors so Error Boundaries catch them
			if (result.error && !result.isFetching) {
				throw result.error;
			}
			return result;
		},
		useInfinite(args: readonly unknown[] = [], options?: ResourceQueryOptions) {
			return useInfiniteQuery({
				...useQueryConfig(args),
				...infiniteExtras(args),
				...(options?.enabled !== undefined ? { enabled: options.enabled } : {}),
			});
		},
		useSuspenseInfinite(args: readonly unknown[] = []) {
			const result = useSuspenseInfiniteQuery({
				...useQueryConfig(args),
				...infiniteExtras(args),
			});
			if (result.error && !result.isFetching) {
				throw result.error;
			}
			return result;
		},
	};
}

function createMutationHook(
	plugin: string,
	resourceName: string,
	mutationName: string,
	resource: ResourceDef,
	def: ResourceMutationDef<any, any>,
) {
	return {
		use() {
			const context = useResourceContext(plugin);
			return useResourceMutationForDef(
				context,
				resourceName,
				mutationName,
				resource,
				def,
			);
		},
	};
}

/**
 * Generates the full hook surface for a plugin's resources.
 *
 * Hooks resolve `apiBaseURL` / `apiBasePath` / `headers` / `navigate` /
 * `refresh` from `usePluginOverrides(plugin)` at render time, so the
 * declaration can live at module scope.
 */
export function createResource<const TResources extends ResourcesDeclaration>(
	config: CreateResourceConfig<TResources>,
): Resource<TResources> {
	const { plugin, resources } = config;
	const handles: Record<string, any> = {};

	for (const [resourceName, resource] of Object.entries(resources)) {
		const handle: Record<string, any> = {};

		for (const [queryName, def] of Object.entries(resource.queries)) {
			handle[queryName] = createQueryHooks(
				plugin,
				resourceName,
				queryName,
				def,
			);
		}

		for (const [mutationName, def] of Object.entries(
			resource.mutations ?? {},
		)) {
			if (handle[mutationName]) {
				throw new Error(
					`Resource "${resourceName}" declares both a query and a mutation named "${mutationName}"`,
				);
			}
			handle[mutationName] = createMutationHook(
				plugin,
				resourceName,
				mutationName,
				resource,
				def,
			);
		}

		handle.useForm = createUseForm(plugin, resourceName, resource);
		handle.useSelect = createUseSelect(plugin, resourceName, resource);

		handles[resourceName] = handle;
	}

	return handles as Resource<TResources>;
}
