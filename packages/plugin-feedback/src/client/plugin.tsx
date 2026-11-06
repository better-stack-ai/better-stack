import { lazy, type ComponentType } from "react";
import { defineRoute, defineRoutes } from "@btst/yar";
import {
	createApiClient,
	createSanitizedSSRLoaderError,
	defineClientPlugin,
	isConnectionError,
} from "@btst/stack/plugins/client";
import {
	createFeedbackQueryKeys,
	type FeedbackIdentityPartition,
} from "../query-keys";
import { FEEDBACK_PLUGIN_ID } from "./constants";
import type { FeedbackPluginOverrides } from "./overrides";

const Board = lazy(() =>
	import("./components/pages").then((m) => ({
		default: m.FeedbackPageComponent,
	})),
);
const Post = lazy(() =>
	import("./components/pages").then((m) => ({
		default: m.FeedbackPostPageComponent,
	})),
);
const Roadmap = lazy(() =>
	import("./components/pages").then((m) => ({
		default: m.FeedbackRoadmapPageComponent,
	})),
);
const Changelog = lazy(() =>
	import("./components/pages").then((m) => ({
		default: m.FeedbackChangelogPageComponent,
	})),
);

export interface FeedbackLoaderContext {
	path: string;
	isSSR: boolean;
}

export interface FeedbackClientConfig {
	/** Match the current identity when hydrating personalized voting data. */
	identityPartition?: FeedbackIdentityPartition;
	hooks?: {
		beforeLoad?: (context: FeedbackLoaderContext) => void | Promise<void>;
		afterLoad?: (context: FeedbackLoaderContext) => void | Promise<void>;
		onErrorLoad?: (
			error: Error,
			context: FeedbackLoaderContext,
		) => void | Promise<void>;
	};
	pageComponents?: {
		feedback?: ComponentType;
		post?: ComponentType<{ params: { slug: string } }>;
		roadmap?: ComponentType;
		changelog?: ComponentType;
	};
}

export const feedbackClientPlugin = (config: FeedbackClientConfig = {}) =>
	defineClientPlugin<FeedbackPluginOverrides>()({
		id: FEEDBACK_PLUGIN_ID,
		resolve: (runtime) => {
			const queries = createFeedbackQueryKeys(
				createApiClient({ ...runtime.api }),
			);
			const preload =
				(
					path: string,
					entry: {
						queryKey: readonly unknown[];
						queryFn: () => Promise<unknown>;
					},
				) =>
				async () => {
					if (typeof window !== "undefined") return;
					const context = { path, isSSR: true };
					let error: unknown;
					try {
						await config.hooks?.beforeLoad?.(context);
						await runtime.queryClient.prefetchQuery({ ...entry, retry: false });
						error = runtime.queryClient.getQueryState(entry.queryKey)?.error;
						if (!error) await config.hooks?.afterLoad?.(context);
					} catch (caught) {
						error = caught;
						await runtime.queryClient.prefetchQuery({
							queryKey: entry.queryKey,
							queryFn: () => {
								throw createSanitizedSSRLoaderError();
							},
							retry: false,
							staleTime: 0,
						});
					}
					if (!error) return;
					if (isConnectionError(error))
						console.warn(
							"[btst/feedback] API unavailable during SSR prefetch.",
						);
					try {
						await config.hooks?.onErrorLoad?.(
							error instanceof Error ? error : new Error(String(error)),
							context,
						);
					} catch {
						/* Reporting cannot reject a route loader. */
					}
				};
			const meta = (title: string, path: string) => [
				{ title },
				{ property: "og:title", content: title },
				{
					property: "og:url",
					content: `${runtime.site.baseURL.replace(/\/$/, "")}${runtime.site.basePath === "/" ? "" : runtime.site.basePath.replace(/\/$/, "")}${path}`,
				},
			];
			return {
				routes: () =>
					defineRoutes(
						{
							feedback: defineRoute("/feedback", {
								page: Board,
								loader: preload(
									"/feedback",
									queries.feedbackPosts.list(
										{ limit: 25, offset: 0 },
										config.identityPartition,
									),
								),
								meta: () => meta("Feature requests", "/feedback"),
							}),
							roadmap: defineRoute("/feedback/roadmap", {
								page: Roadmap,
								loader: preload(
									"/feedback/roadmap",
									queries.feedbackRoadmap.list(config.identityPartition),
								),
								meta: () => meta("Roadmap", "/feedback/roadmap"),
							}),
							changelog: defineRoute("/feedback/changelog", {
								page: Changelog,
								loader: preload(
									"/feedback/changelog",
									queries.feedbackChangelog.list(
										{ limit: 25, offset: 0 },
										config.identityPartition,
									),
								),
								meta: () => meta("Changelog", "/feedback/changelog"),
							}),
							post: defineRoute("/feedback/:slug", {
								page: ({ params }) => <Post slug={params.slug} />,
								loader: ({ params }) =>
									preload(
										`/feedback/${params.slug}`,
										queries.feedbackPosts.detail(
											params.slug,
											config.identityPartition,
										),
									)(),
								meta: ({ params }) =>
									meta(
										"Feature request",
										`/feedback/${encodeURIComponent(params.slug)}`,
									),
							}),
						},
						{ pages: config.pageComponents },
					),
			};
		},
	});
