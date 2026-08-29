// NO "use client" here! This file runs on both server and client.
import { lazy } from "react";
import {
	defineClientPlugin,
	createApiClient,
	isConnectionError,
	type ResolvedClientPluginRuntime,
} from "@btst/stack/plugins/client";
import { defineRoute, defineRoutes } from "@btst/yar";
import type { ComponentType } from "react";
import type { QueryClient } from "@tanstack/react-query";
import { createSanitizedSSRLoaderError } from "../../utils";
import type { FormBuilderApiRouter } from "../api";
import { createFormBuilderQueryKeys } from "../query-keys";
import type { PaginatedFormSubmissions } from "../types";
import { FORM_BUILDER_PLUGIN_ID } from "./constants";
import type { FormBuilderPluginOverrides } from "./overrides";

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
	 * Called before loading the form list page. Throw an error to cancel loading.
	 * @param context - Loader context with path, params, etc.
	 */
	beforeLoadFormList?: (context: LoaderContext) => Promise<void> | void;
	/**
	 * Called after the form list is loaded.
	 * @param context - Loader context
	 */
	afterLoadFormList?: (context: LoaderContext) => Promise<void> | void;
	/**
	 * Called before loading the form builder page. Throw an error to cancel loading.
	 * @param id - The form ID (undefined for new forms)
	 * @param context - Loader context
	 */
	beforeLoadFormBuilder?: (
		id: string | undefined,
		context: LoaderContext,
	) => Promise<void> | void;
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
	 * Called before loading the submissions page. Throw an error to cancel loading.
	 * @param formId - The form ID
	 * @param context - Loader context
	 */
	beforeLoadSubmissions?: (
		formId: string,
		context: LoaderContext,
	) => Promise<void> | void;
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
	 * Use this to report loader failures. Router error handling remains authoritative.
	 * @param error - The error that occurred
	 * @param context - Loader context
	 */
	onErrorLoad?: (error: Error, context: LoaderContext) => Promise<void> | void;
}

/**
 * Configuration for Form Builder client plugin
 */
export interface FormBuilderClientConfig {
	/** Optional hooks for route loading, redirects, and telemetry. */
	hooks?: FormBuilderClientHooks;

	/**
	 * Optional page component overrides.
	 * Replace any plugin page with a custom React component.
	 * The built-in component is used as the fallback when not provided.
	 */
	pageComponents?: {
		/** Replaces the form list page */
		formList?: ComponentType;
		/** Replaces the new form page */
		newForm?: ComponentType;
		/** Replaces the form editor page */
		editForm?: ComponentType<{ params: { id: string } }>;
		/** Replaces the form submissions page */
		submissions?: ComponentType<{ params: { id: string } }>;
	};
}

interface ResolvedFormBuilderClientConfig extends FormBuilderClientConfig {
	apiBaseURL: string;
	apiBasePath: string;
	siteBaseURL: string;
	siteBasePath: string;
	queryClient: QueryClient;
	headers?: Headers;
	credentials?: RequestCredentials;
}

function resolveFormBuilderClientConfig(
	config: FormBuilderClientConfig,
	runtime: ResolvedClientPluginRuntime<typeof FORM_BUILDER_PLUGIN_ID>,
): ResolvedFormBuilderClientConfig {
	return {
		hooks: config.hooks,
		pageComponents: config.pageComponents,
		apiBaseURL: runtime.api.baseURL,
		apiBasePath: runtime.api.basePath,
		siteBaseURL: runtime.site.baseURL,
		siteBasePath: runtime.site.basePath,
		queryClient: runtime.queryClient,
		...(runtime.api.headers ? { headers: runtime.api.headers } : {}),
		...(runtime.api.credentials
			? { credentials: runtime.api.credentials }
			: {}),
	};
}

function createFormBuilderApiClient(config: ResolvedFormBuilderClientConfig) {
	return createApiClient<FormBuilderApiRouter>({
		baseURL: config.apiBaseURL,
		basePath: config.apiBasePath,
		headers: config.headers,
		credentials: config.credentials,
	});
}

function createLoadErrorReporter(
	hooks: FormBuilderClientHooks | undefined,
	context: LoaderContext,
) {
	let reported = false;
	return async (error: unknown) => {
		if (reported || !hooks?.onErrorLoad) return;
		reported = true;
		try {
			await hooks.onErrorLoad(
				error instanceof Error ? error : new Error(String(error)),
				context,
			);
		} catch {
			// Reporting hooks cannot make an SSR loader reject or run twice.
		}
	};
}

/**
 * Create form list loader for SSR
 */
function createFormListLoader(config: ResolvedFormBuilderClientConfig) {
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
			const reportError = createLoadErrorReporter(hooks, context);
			const queries = createFormBuilderQueryKeys(
				createFormBuilderApiClient(config),
			);
			const limit = 20;
			const listQuery = queries.forms.list({ limit });

			try {
				// Before-load lifecycle hook
				if (hooks?.beforeLoadFormList) {
					await hooks.beforeLoadFormList(context);
				}

				// Prefetch forms using infinite query (matches useSuspenseInfiniteQuery in hooks)
				await queryClient.prefetchInfiniteQuery({
					...listQuery,
					initialPageParam: 0,
				});

				// After hook
				if (hooks?.afterLoadFormList) {
					await hooks.afterLoadFormList(context);
				}

				// Check if there was an error
				const queryState = queryClient.getQueryState(listQuery.queryKey);
				if (queryState?.error) {
					await reportError(queryState.error);
				}
			} catch (error) {
				// Error hook - log the error but don't throw during SSR
				if (isConnectionError(error)) {
					console.warn(
						"[btst/form-builder] route.loader() failed — no server running at build time. " +
							"Use myStack.raw.formBuilder.prefetchForRoute() for SSG data prefetching.",
					);
				} else {
					const errToStore = createSanitizedSSRLoaderError();
					await queryClient.prefetchInfiniteQuery({
						queryKey: listQuery.queryKey,
						queryFn: () => {
							throw errToStore;
						},
						initialPageParam: 0,
						retry: false,
					});
				}
				await reportError(error);
			}
		}
	};
}

/**
 * Create form builder loader for SSR
 */
function createFormBuilderLoader(
	id: string | undefined,
	config: ResolvedFormBuilderClientConfig,
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
			const reportError = createLoadErrorReporter(hooks, context);
			const queries = createFormBuilderQueryKeys(
				createFormBuilderApiClient(config),
			);
			const formQuery = id ? queries.forms.forUpdate(id) : undefined;

			try {
				// Before-load lifecycle hook
				if (hooks?.beforeLoadFormBuilder) {
					await hooks.beforeLoadFormBuilder(id, context);
				}

				// Prefetch form if editing
				if (id) {
					await queryClient.prefetchQuery(formQuery!);
				}

				// After hook
				if (hooks?.afterLoadFormBuilder) {
					await hooks.afterLoadFormBuilder(id, context);
				}

				// Check if there was an error
				if (id) {
					const queryState = queryClient.getQueryState(formQuery!.queryKey);
					if (queryState?.error) {
						await reportError(queryState.error);
					}
				}
			} catch (error) {
				// Error hook - log the error but don't throw during SSR
				if (isConnectionError(error)) {
					console.warn(
						"[btst/form-builder] route.loader() failed — no server running at build time. " +
							"Use myStack.raw.formBuilder.prefetchForRoute() for SSG data prefetching.",
					);
				} else if (formQuery) {
					const errToStore = createSanitizedSSRLoaderError();
					await queryClient.prefetchQuery({
						queryKey: formQuery.queryKey,
						queryFn: () => {
							throw errToStore;
						},
						retry: false,
					});
				}
				await reportError(error);
			}
		}
	};
}

/**
 * Create submissions loader for SSR
 */
function createSubmissionsLoader(
	formId: string,
	config: ResolvedFormBuilderClientConfig,
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
			const reportError = createLoadErrorReporter(hooks, context);
			const queries = createFormBuilderQueryKeys(
				createFormBuilderApiClient(config),
			);
			const limit = 20;
			const submissionsQuery = queries.formSubmissions.list({ formId, limit });

			try {
				// Before-load lifecycle hook
				if (hooks?.beforeLoadSubmissions) {
					await hooks.beforeLoadSubmissions(formId, context);
				}

				// The submission operation returns the form facts needed by the page.
				await queryClient.prefetchInfiniteQuery({
					...submissionsQuery,
					initialPageParam: 0,
				});

				// After hook
				if (hooks?.afterLoadSubmissions) {
					await hooks.afterLoadSubmissions(formId, context);
				}

				// Check if there was an error
				const submissionsState = queryClient.getQueryState(
					submissionsQuery.queryKey,
				);
				const queryError = submissionsState?.error;
				if (queryError) {
					await reportError(queryError);
				}
			} catch (error) {
				// Error hook - log the error but don't throw during SSR
				if (isConnectionError(error)) {
					console.warn(
						"[btst/form-builder] route.loader() failed — no server running at build time. " +
							"Use myStack.raw.formBuilder.prefetchForRoute() for SSG data prefetching.",
					);
				} else {
					const errToStore = createSanitizedSSRLoaderError();
					await queryClient.prefetchInfiniteQuery({
						queryKey: submissionsQuery.queryKey,
						queryFn: () => {
							throw errToStore;
						},
						initialPageParam: 0,
						retry: false,
					});
				}
				await reportError(error);
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
	config: ResolvedFormBuilderClientConfig,
) {
	return () => {
		const { queryClient } = config;

		let formName = "";
		if (id) {
			const queries = createFormBuilderQueryKeys(
				createFormBuilderApiClient(config),
			);
			const form = queryClient.getQueryData(
				queries.forms.forUpdate(id).queryKey,
			) as { name: string } | undefined;
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
	config: ResolvedFormBuilderClientConfig,
) {
	return () => {
		const { queryClient } = config;
		const queries = createFormBuilderQueryKeys(
			createFormBuilderApiClient(config),
		);
		const data = queryClient.getQueryData(
			queries.formSubmissions.list({ formId, limit: 20 }).queryKey,
		) as { pages?: PaginatedFormSubmissions[] } | undefined;
		const form = data?.pages?.[0]?.form;

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
function createResolvedFormBuilderPlugin(
	config: ResolvedFormBuilderClientConfig,
) {
	return {
		routes: () =>
			defineRoutes(
				{
					formList: defineRoute("/forms", {
						page: FormListPageComponent,
						loader: createFormListLoader(config),
						meta: createFormListMeta(),
					}),

					newForm: defineRoute("/forms/new", {
						page: () => <FormBuilderPageComponent />,
						loader: createFormBuilderLoader(undefined, config),
						meta: createFormBuilderMeta(undefined, config),
					}),

					editForm: defineRoute("/forms/:id/edit", {
						page: ({ params }) => <FormBuilderPageComponent id={params.id} />,
						loader: ({ params }) =>
							createFormBuilderLoader(params.id, config)(),
						meta: ({ params }) => createFormBuilderMeta(params.id, config)(),
					}),

					submissions: defineRoute("/forms/:id/submissions", {
						page: ({ params }) => (
							<SubmissionsPageComponent formId={params.id} />
						),
						loader: ({ params }) =>
							createSubmissionsLoader(params.id, config)(),
						meta: ({ params }) => createSubmissionsMeta(params.id, config)(),
					}),
				},
				{ pages: config.pageComponents },
			),

		sitemap: async () => {
			// Form Builder admin pages should NOT be in sitemap
			return [];
		},
	};
}

export const formBuilderClientPlugin = (config: FormBuilderClientConfig = {}) =>
	defineClientPlugin<FormBuilderPluginOverrides>()({
		id: FORM_BUILDER_PLUGIN_ID,
		resolve: (runtime) =>
			createResolvedFormBuilderPlugin(
				resolveFormBuilderClientConfig(config, runtime),
			),
	});
