/**
 * Server-safe resource declaration types and query-key/queryFn builder.
 *
 * A plugin declares its resources once (paths, query mappings, unwrapping,
 * key discriminators) and gets:
 *
 * - `createResourceQueryKeys(client, resources, headers?)` — a query-key
 *   factory usable from SSR loaders and `query-keys.ts` (no React), with the
 *   same `_def` / `queryKey` shapes as `@lukemorales/query-key-factory`, so
 *   existing SSG `prefetchForRoute` / `query-key-defs.ts` keys keep matching.
 * - `createResource(...)` (see `./hooks`) — generated React Query hooks.
 */

import { isErrorResponse, toError } from "./errors";

/**
 * Minimal better-call client shape the resource layer needs.
 * Any `createApiClient<TRouter>()` result is assignable.
 */
export type ResourceClient = (path: any, options?: any) => Promise<unknown>;

/**
 * Declaration for a single query on a resource.
 *
 * Query-key shape: `[resourceName, queryName, ...key(...args)]` where `key`
 * defaults to the args themselves. Share discriminator functions with
 * `api/query-key-defs.ts` to keep SSG prefetch keys in sync.
 */
export interface ResourceQueryDef<
	TArgs extends readonly unknown[] = readonly any[],
	TData = unknown,
> {
	/** better-call endpoint path, e.g. `"/posts"` */
	path: string;
	/** Maps hook args to the HTTP query object */
	query?: (...args: TArgs) => Record<string, unknown> | undefined;
	/**
	 * Maps hook args to the queryKey discriminator cells appended after
	 * `[resourceName, queryName]`. Defaults to the args themselves.
	 */
	key?: (...args: TArgs) => readonly unknown[];
	/** Unwraps/selects data from the raw response data */
	select?: (data: any, ...args: TArgs) => TData;
	/**
	 * Offset-paginated infinite query. The queryFn receives `pageParam` and
	 * injects it into the HTTP query as `offsetParam`. `select` must return
	 * an array (one page of items).
	 */
	infinite?: boolean;
	/** HTTP query param carrying the page offset (default `"offset"`) */
	offsetParam?: string;
	/**
	 * Page size used to derive `getNextPageParam` for infinite queries
	 * (default 10). A function form derives it from the hook args.
	 */
	pageSize?: number | ((...args: TArgs) => number);
	/** When true, skip fetching and resolve `null` (e.g. missing id) */
	skip?: (...args: TArgs) => boolean;
}

/**
 * Declaration for a single mutation on a resource.
 */
export interface ResourceMutationDef<TVars = any, TResult = unknown> {
	/** better-call endpoint path, e.g. `"@post/posts"` or `"@put/posts/:id"` */
	path: string;
	method: "POST" | "PUT" | "PATCH" | "DELETE";
	/**
	 * Maps mutation variables to better-call call options.
	 * Defaults to `{ body: vars }`.
	 */
	input?: (vars: TVars) => {
		body?: unknown;
		params?: Record<string, string>;
		query?: Record<string, unknown>;
	};
	/** Unwraps the mutation result from the raw response data */
	select?: (data: any) => TResult;
	/**
	 * Query-key prefixes invalidated (awaited, in order) after success.
	 * `"posts"` invalidates the whole resource, `"posts.list"` one query.
	 */
	invalidates?: readonly string[];
	/**
	 * Seed a query cache entry from the mutation result (e.g. the detail
	 * entry for a created/updated record). `args` returns the key args for
	 * the target query, or `null` to skip seeding.
	 */
	setData?: {
		/** Target query name on the same resource (default `"detail"`) */
		query?: string;
		args: (result: TResult) => readonly unknown[] | null;
	};
}

/** Declaration for one resource: its queries and (optionally) mutations. */
export interface ResourceDef {
	queries: Record<string, ResourceQueryDef<any, any>>;
	mutations?: Record<string, ResourceMutationDef<any, any>>;
}

/** A plugin's full resource declaration, keyed by resource name. */
export type ResourcesDeclaration = Record<string, ResourceDef>;

/** Extracts the hook args tuple from a query declaration. */
export type ResourceQueryArgs<TDef> = TDef extends {
	query: (...args: infer A) => any;
}
	? A
	: TDef extends { key: (...args: infer A) => any }
		? A
		: TDef extends { select: (data: any, ...args: infer A) => any }
			? A
			: [];

/** Extracts the (per-page, for infinite queries) data type from a query declaration. */
export type ResourceQueryData<TDef> = TDef extends {
	select: (data: any, ...args: any[]) => infer D;
}
	? D
	: unknown;

/** Extracts the variables type from a mutation declaration. */
export type ResourceMutationVars<TDef> = TDef extends {
	input: (vars: infer V) => any;
}
	? V
	: unknown;

/** Extracts the result type from a mutation declaration. */
export type ResourceMutationResult<TDef> = TDef extends {
	select: (data: any) => infer R;
}
	? R
	: unknown;

/**
 * A query-key factory entry: call with args to get `{ queryKey, queryFn }`,
 * read `_def` for the `[resourceName, queryName]` prefix.
 */
export interface ResourceQueryEntry<
	TArgs extends readonly unknown[] = readonly any[],
	TData = unknown,
> {
	(
		...args: TArgs
	): {
		queryKey: readonly unknown[];
		queryFn: (context?: { pageParam?: unknown }) => Promise<TData>;
	};
	_def: readonly [string, string];
}

/** The query-key factory produced from a resources declaration. */
export type ResourceQueryKeys<TResources extends ResourcesDeclaration> = {
	[R in keyof TResources]: {
		[Q in keyof TResources[R]["queries"]]: ResourceQueryEntry<
			ResourceQueryArgs<TResources[R]["queries"][Q]>,
			ResourceQueryData<TResources[R]["queries"][Q]>
		>;
	} & { _def: readonly [R] };
};

/** Resolves the effective page size for an infinite query declaration. */
export function resolvePageSize(
	def: ResourceQueryDef<any, any>,
	args: readonly unknown[],
): number {
	if (typeof def.pageSize === "function") return def.pageSize(...args);
	return def.pageSize ?? 10;
}

/** Builds the full query key for a query declaration and args. */
export function buildQueryKey(
	resourceName: string,
	queryName: string,
	def: ResourceQueryDef<any, any>,
	args: readonly unknown[],
): readonly unknown[] {
	const cells = def.key ? def.key(...args) : args;
	return [resourceName, queryName, ...cells];
}

/**
 * Executes the fetch → error-check → unwrap dance for a query declaration.
 */
export async function runResourceQuery(
	client: ResourceClient,
	def: ResourceQueryDef<any, any>,
	args: readonly unknown[],
	pageParam?: unknown,
	headers?: HeadersInit,
): Promise<unknown> {
	if (def.skip?.(...args)) return null;

	const baseQuery = def.query?.(...args);
	const query = def.infinite
		? { ...baseQuery, [def.offsetParam ?? "offset"]: pageParam ?? 0 }
		: baseQuery;

	const response = await client(def.path, {
		method: "GET",
		...(query !== undefined ? { query } : {}),
		...(headers !== undefined ? { headers } : {}),
	});

	if (isErrorResponse(response)) {
		throw toError(response.error);
	}

	const data = (response as { data?: unknown }).data;
	return def.select ? def.select(data, ...args) : data;
}

/**
 * Executes a mutation declaration: fetch → error-check → unwrap.
 */
export async function runResourceMutation(
	client: ResourceClient,
	def: ResourceMutationDef<any, any>,
	vars: unknown,
): Promise<unknown> {
	const { body, params, query } = def.input
		? def.input(vars)
		: { body: vars, params: undefined, query: undefined };

	const response = await client(def.path, {
		method: def.method,
		...(body !== undefined ? { body } : {}),
		...(params !== undefined ? { params } : {}),
		...(query !== undefined ? { query } : {}),
	});

	if (isErrorResponse(response)) {
		throw toError(response.error);
	}

	const data = (response as { data?: unknown }).data;
	return def.select ? def.select(data) : data;
}

/**
 * Builds a query-key factory from a resources declaration.
 *
 * Compatible with the shapes `@lukemorales/query-key-factory` produces:
 * `store.posts.list(params)` → `{ queryKey: ["posts", "list", ...], queryFn }`,
 * `store.posts.list._def` → `["posts", "list"]`, `store.posts._def` → `["posts"]`.
 *
 * Server-safe (no React) — usable from SSR loaders and `query-keys.ts`.
 */
export function createResourceQueryKeys<
	const TResources extends ResourcesDeclaration,
>(
	client: ResourceClient,
	resources: TResources,
	headers?: HeadersInit,
): ResourceQueryKeys<TResources> {
	const store: Record<string, any> = {};

	for (const [resourceName, resource] of Object.entries(resources)) {
		const resourceStore: Record<string, any> = {
			_def: [resourceName] as const,
		};

		for (const [queryName, def] of Object.entries(resource.queries)) {
			const entry = (...args: readonly unknown[]) => ({
				queryKey: buildQueryKey(resourceName, queryName, def, args),
				queryFn: (context?: { pageParam?: unknown }) =>
					runResourceQuery(client, def, args, context?.pageParam, headers),
			});
			entry._def = [resourceName, queryName] as const;
			resourceStore[queryName] = entry;
		}

		store[resourceName] = resourceStore;
	}

	return store as ResourceQueryKeys<TResources>;
}
