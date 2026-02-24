// NO "use client" here! This file runs on both server and client.
import { lazy } from "react";
import {
	defineClientPlugin,
	createApiClient,
	isConnectionError,
} from "@btst/stack/plugins/client";
import { createRoute } from "@btst/yar";
import type { QueryClient } from "@tanstack/react-query";
import type { FormBuilderApiRouter } from "../api";
import { createFormBuilderQueryKeys } from "../query-keys";

// Lazy load page components for code splitting
const FormListPageComponent = lazy(() =>
	import("./components/pages/form-list-page").then((m) => ({
		default: m.FormListPageComponent,
	})),
);
const FormBuilderPageComponent = lazy(() =>
	import("./components/pages/form-builder-page").then((m) => ({
		default: m.FormBuilderPageComponent,
	})),
);
const SubmissionsPageComponent = lazy(() =>
	import("./components/pages/submissions-page").then((m) => ({
		default: m.SubmissionsPageComponent,
	})),
);

/**
 * Context passed to loader hooks
 */
export interface LoaderContext {
	/** Current route path */
	path: string;
	/** Route parameters (e.g., { id: "123" }) */
	params?: Record<string, string>;
	/** Whether rendering on server (true) or client (false) */
	isSSR: boolean;
	/** Base URL for API calls */
	apiBaseURL: string;
	/** Path where the API is mounted */
	apiBasePath: string;
	/** Optional headers for the request */
	headers?: Headers;
	/** Additional context properties */
	[key: string]: unknown;
}

/**
 * Hooks for Form Builder client plugin
 * All hooks are optional and allow consumers to customize behavior
 */
export interface FormBuilderClientHooks {
	/**
	 * Called before loading the form list page. Return false to cancel loading.
	 * @param context - Loader context with path, params, etc.
	 */
	beforeLoadFormList?: (context: LoaderContext) => Promise<boolean> | boolean;
	/**
	 * Called after the form list is loaded.
	 * @param context - Loader context
	 */
	afterLoadFormList?: (context: LoaderContext) => Promise<void> | void;
	/**
	 * Called before loading the form builder page. Return false to cancel loading.
	 * @param id - The form ID (undefined for new forms)
	 * @param context - Loader context
	 */
	beforeLoadFormBuilder?: (
		id: string | undefined,
		context: LoaderContext,
	) => Promise<boolean> | boolean;
	/**
	 * Called after the form builder is loaded.
	 * @param id - The form ID (undefined for new forms)
	 * @param context - Loader context
	 */
	afterLoadFormBuilder?: (
		id: string | undefined,
		context: LoaderContext,
	) => Promise<void> | void;
	/**
	 * Called before loading the submissions page. Return false to cancel loading.
	 * @param formId - The form ID
	 * @param context - Loader context
	 */
	beforeLoadSubmissions?: (
		formId: string,
		context: LoaderContext,
	) => Promise<boolean> | boolean;
	/**
	 * Called after the submissions page is loaded.
	 * @param formId - The form ID
	 * @param context - Loader context
	 */
	afterLoadSubmissions?: (
		formId: string,
		context: LoaderContext,
	) => Promise<void> | void;
	/**
	 * Called when a loading error occurs.
	 * Use this for redirects on authorization failures.
	 * @param error - The error that occurred
	 * @param context - Loader context
	 */
	onLoadError?: (error: Error, context: LoaderContext) => Promise<void> | void;
}

/**
 * Configuration for Form Builder client plugin
 */
export interface FormBuilderClientConfig {
	/** Base URL for API calls (e.g., "http://localhost:3000") */
	apiBaseURL: string;
	/** Path where the API is mounted (e.g., "/api/data") */
	apiBasePath: string;
	/** Base URL of your site */
	siteBaseURL: string;
	/** Path where pages are mounted (e.g., "/pages") */
	siteBasePath: string;
	/** React Query client instance for caching */
	queryClient: QueryClient;
	/** Optional headers for SSR (e.g., forwarding cookies) */
	headers?: Headers;
	/** Optional hooks for customizing behavior (authorization, redirects, etc.) */
	hooks?: FormBuilderClientHooks;
}

/**
 * Create form list loader for SSR
 */
function createFormListLoader(config: FormBuilderClientConfig) {
	return async () => {
		if (typeof window === "undefined") {
			const { queryClient, apiBasePath, apiBaseURL, headers, hooks } = config;

			const context: LoaderContext = {
				path: "/forms",
				isSSR: true,
				apiBaseURL,
				apiBasePath,
				headers,
			};

			try {
				// Before hook - authorization check
				if (hooks?.beforeLoadFormList) {
					const canLoad = await hooks.beforeLoadFormList(context);
					if (!canLoad) {
						throw new Error("Load prevented by beforeLoadFormList hook");
					}
				}

				const client = createApiClient<FormBuilderApiRouter>({
					baseURL: apiBaseURL,
					basePath: apiBasePath,
				});
				const queries = createFormBuilderQueryKeys(client, headers);
				const limit = 20;

				// Prefetch forms using infinite query
				const listQuery = queries.forms.list({ limit, offset: 0 });
				await queryClient.prefetchInfiniteQuery({
					queryKey: listQuery.queryKey,
					queryFn: async ({ pageParam = 0 }) => {
						const response: unknown = await client("/forms", {
							method: "GET",
							query: { limit, offset: pageParam },
							headers,
						});
						if (
							typeof response === "object" &&
							response !== null &&
							"error" in response &&
							response.error
						) {
							throw new Error(String(response.error));
						}
						return (response as { data?: unknown }).data;
					},
					initialPageParam: 0,
				});

				// After hook
				if (hooks?.afterLoadFormList) {
					await hooks.afterLoadFormList(context);
				}

				// Check if there was an error
				const queryState = queryClient.getQueryState(listQuery.queryKey);
				if (queryState?.error && hooks?.onLoadError) {
					const error =
						queryState.error instanceof Error
							? queryState.error
							: new Error(String(queryState.error));
					await hooks.onLoadError(error, context);
				}
			} catch (error) {
				// Error hook - log the error but don't throw during SSR
				if (isConnectionError(error)) {
					console.warn(
						"[btst/form-builder] route.loader() failed — no server running at build time. " +
							"Use myStack.api.formBuilder.prefetchForRoute() for SSG data prefetching.",
					);
				}
				if (hooks?.onLoadError) {
					await hooks.onLoadError(error as Error, context);
				}
			}
		}
	};
}

/**
 * Create form builder loader for SSR
 */
function createFormBuilderLoader(
	id: string | undefined,
	config: FormBuilderClientConfig,
) {
	return async () => {
		if (typeof window === "undefined") {
			const { queryClient, apiBasePath, apiBaseURL, headers, hooks } = config;

			const context: LoaderContext = {
				path: id ? `/forms/${id}/edit` : "/forms/new",
				params: id ? { id } : {},
				isSSR: true,
				apiBaseURL,
				apiBasePath,
				headers,
			};

			try {
				// Before hook - authorization check
				if (hooks?.beforeLoadFormBuilder) {
					const canLoad = await hooks.beforeLoadFormBuilder(id, context);
					if (!canLoad) {
						throw new Error("Load prevented by beforeLoadFormBuilder hook");
					}
				}

				const client = createApiClient<FormBuilderApiRouter>({
					baseURL: apiBaseURL,
					basePath: apiBasePath,
				});
				const queries = createFormBuilderQueryKeys(client, headers);

				// Prefetch form if editing
				if (id) {
					await queryClient.prefetchQuery(queries.forms.byId(id));
				}

				// After hook
				if (hooks?.afterLoadFormBuilder) {
					await hooks.afterLoadFormBuilder(id, context);
				}

				// Check if there was an error
				if (id) {
					const queryState = queryClient.getQueryState(
						queries.forms.byId(id).queryKey,
					);
					if (queryState?.error && hooks?.onLoadError) {
						const error =
							queryState.error instanceof Error
								? queryState.error
								: new Error(String(queryState.error));
						await hooks.onLoadError(error, context);
					}
				}
			} catch (error) {
				// Error hook - log the error but don't throw during SSR
				if (isConnectionError(error)) {
					console.warn(
						"[btst/form-builder] route.loader() failed — no server running at build time. " +
							"Use myStack.api.formBuilder.prefetchForRoute() for SSG data prefetching.",
					);
				}
				if (hooks?.onLoadError) {
					await hooks.onLoadError(error as Error, context);
				}
			}
		}
	};
}

/**
 * Create submissions loader for SSR
 */
function createSubmissionsLoader(
	formId: string,
	config: FormBuilderClientConfig,
) {
	return async () => {
		if (typeof window === "undefined") {
			const { queryClient, apiBasePath, apiBaseURL, headers, hooks } = config;

			const context: LoaderContext = {
				path: `/forms/${formId}/submissions`,
				params: { formId },
				isSSR: true,
				apiBaseURL,
				apiBasePath,
				headers,
			};

			try {
				// Before hook - authorization check
				if (hooks?.beforeLoadSubmissions) {
					const canLoad = await hooks.beforeLoadSubmissions(formId, context);
					if (!canLoad) {
						throw new Error("Load prevented by beforeLoadSubmissions hook");
					}
				}

				const client = createApiClient<FormBuilderApiRouter>({
					baseURL: apiBaseURL,
					basePath: apiBasePath,
				});
				const queries = createFormBuilderQueryKeys(client, headers);
				const limit = 20;

				// Prefetch form and submissions
				await queryClient.prefetchQuery(queries.forms.byId(formId));

				const submissionsQuery = queries.formSubmissions.list({
					formId,
					limit,
					offset: 0,
				});
				await queryClient.prefetchInfiniteQuery({
					queryKey: submissionsQuery.queryKey,
					queryFn: async ({ pageParam = 0 }) => {
						const response: unknown = await client(
							"/forms/:formId/submissions",
							{
								method: "GET",
								params: { formId },
								query: { limit, offset: pageParam },
								headers,
							},
						);
						if (
							typeof response === "object" &&
							response !== null &&
							"error" in response &&
							response.error
						) {
							throw new Error(String(response.error));
						}
						return (response as { data?: unknown }).data;
					},
					initialPageParam: 0,
				});

				// After hook
				if (hooks?.afterLoadSubmissions) {
					await hooks.afterLoadSubmissions(formId, context);
				}

				// Check if there was an error
				const formState = queryClient.getQueryState(
					queries.forms.byId(formId).queryKey,
				);
				const submissionsState = queryClient.getQueryState(
					submissionsQuery.queryKey,
				);
				const queryError = formState?.error || submissionsState?.error;
				if (queryError && hooks?.onLoadError) {
					const error =
						queryError instanceof Error
							? queryError
							: new Error(String(queryError));
					await hooks.onLoadError(error, context);
				}
			} catch (error) {
				// Error hook - log the error but don't throw during SSR
				if (isConnectionError(error)) {
					console.warn(
						"[btst/form-builder] route.loader() failed — no server running at build time. " +
							"Use myStack.api.formBuilder.prefetchForRoute() for SSG data prefetching.",
					);
				}
				if (hooks?.onLoadError) {
					await hooks.onLoadError(error as Error, context);
				}
			}
		}
	};
}

/**
 * Create form list meta generator
 */
function createFormListMeta() {
	return () => {
		const title = "Forms";
		return [
			{ title },
			{ name: "title", content: title },
			{ name: "robots", content: "noindex" },
		];
	};
}

/**
 * Create form builder meta generator
 */
function createFormBuilderMeta(
	id: string | undefined,
	config: FormBuilderClientConfig,
) {
	return () => {
		const { queryClient, apiBasePath, apiBaseURL } = config;

		let formName = "";
		if (id) {
			const client = createApiClient<FormBuilderApiRouter>({
				baseURL: apiBaseURL,
				basePath: apiBasePath,
			});
			const queries = createFormBuilderQueryKeys(client);
			const form = queryClient.getQueryData(queries.forms.byId(id).queryKey) as
				| { name: string }
				| undefined;
			formName = form?.name || "";
		}

		const title = id ? `Edit ${formName || "Form"}` : "New Form";

		return [
			{ title },
			{ name: "title", content: title },
			{ name: "robots", content: "noindex" },
		];
	};
}

/**
 * Create submissions meta generator
 */
function createSubmissionsMeta(
	formId: string,
	config: FormBuilderClientConfig,
) {
	return () => {
		const { queryClient, apiBasePath, apiBaseURL } = config;
		const client = createApiClient<FormBuilderApiRouter>({
			baseURL: apiBaseURL,
			basePath: apiBasePath,
		});
		const queries = createFormBuilderQueryKeys(client);
		const form = queryClient.getQueryData(
			queries.forms.byId(formId).queryKey,
		) as { name: string } | undefined;

		const title = form?.name ? `${form.name} Submissions` : "Submissions";

		return [
			{ title },
			{ name: "title", content: title },
			{ name: "robots", content: "noindex" },
		];
	};
}

/**
 * Form Builder client plugin
 * Provides routes and components for the Form Builder admin interface
 */
export const formBuilderClientPlugin = (config: FormBuilderClientConfig) =>
	defineClientPlugin({
		name: "form-builder",

		routes: () => ({
			formList: createRoute("/forms", () => ({
				PageComponent: () => <FormListPageComponent />,
				loader: createFormListLoader(config),
				meta: createFormListMeta(),
			})),

			newForm: createRoute("/forms/new", () => ({
				PageComponent: () => <FormBuilderPageComponent />,
				loader: createFormBuilderLoader(undefined, config),
				meta: createFormBuilderMeta(undefined, config),
			})),

			editForm: createRoute("/forms/:id/edit", ({ params }) => ({
				PageComponent: () => <FormBuilderPageComponent id={params.id} />,
				loader: createFormBuilderLoader(params.id, config),
				meta: createFormBuilderMeta(params.id, config),
			})),

			submissions: createRoute("/forms/:id/submissions", ({ params }) => ({
				PageComponent: () => <SubmissionsPageComponent formId={params.id} />,
				loader: createSubmissionsLoader(params.id, config),
				meta: createSubmissionsMeta(params.id, config),
			})),
		}),

		sitemap: async () => {
			// Form Builder admin pages should NOT be in sitemap
			return [];
		},
	});
