import { createClientStack } from "@btst/stack/client";
import { todosClientPlugin } from "~/lib/plugins/todo/client/client";
import { blogClientPlugin } from "@btst/stack/plugins/blog/client";
import { aiChatClientPlugin } from "@btst/stack/plugins/ai-chat/client";
import { cmsClientPlugin } from "@btst/stack/plugins/cms/client";
import { formBuilderClientPlugin } from "@btst/stack/plugins/form-builder/client";
import { uiBuilderClientPlugin } from "@btst/stack/plugins/ui-builder/client";
import { routeDocsClientPlugin } from "@btst/stack/plugins/route-docs/client";
import { kanbanClientPlugin } from "@btst/stack/plugins/kanban/client";
import { commentsClientPlugin } from "@btst/stack/plugins/comments/client";
import { mediaClientPlugin } from "@btst/stack/plugins/media/client";
import type { StackIdentity } from "@btst/stack/context";
import type { QueryClient } from "@tanstack/react-query";

export interface AppClientStackRuntime {
	apiOrigin: string;
	siteOrigin: string;
	headers?: Headers;
	/** Request-only identity used to align protected SSR query keys. */
	requestIdentity?: StackIdentity;
}

const getBrowserSiteOrigin = () =>
	import.meta.env.VITE_PUBLIC_SITE_URL ||
	import.meta.env.VITE_BASE_URL ||
	(typeof window === "undefined"
		? "http://localhost:3000"
		: window.location.origin);

const getBrowserApiOrigin = (siteOrigin: string) =>
	import.meta.env.VITE_PUBLIC_API_URL ||
	import.meta.env.VITE_BASE_URL ||
	siteOrigin;

interface StackClientOptions {
	apiOrigin?: string;
	siteOrigin?: string;
}

function resolveSharedClientRuntime(
	queryClient: QueryClient,
	{ apiOrigin, siteOrigin, headers }: AppClientStackRuntime,
) {
	return {
		api: {
			baseURL: apiOrigin,
			basePath: "/api/data",
			...(headers ? { headers } : {}),
		},
		site: { baseURL: siteOrigin, basePath: "/pages" },
		queryClient,
	};
}

/** One canonical plugin/runtime composition shared by SSR and browser stacks. */
export const createAppClientStack = (
	queryClient: QueryClient,
	runtime: AppClientStackRuntime,
) => {
	const { siteOrigin, requestIdentity } = runtime;
	return createClientStack({
		...resolveSharedClientRuntime(queryClient, runtime),
		plugins: {
			todos: todosClientPlugin(),
			blog: blogClientPlugin({
				seo: {
					siteName: "BTST Blog",
					author: "BTST Team",
					twitterHandle: "@olliethedev",
					locale: "en_US",
					defaultImage: `${siteOrigin}/og-image.png`,
				},
				hooks: {
					beforeLoadPosts: async (filter, context) => {
						console.log(
							`[${context.isSSR ? "SSR" : "CSR"}] beforeLoadPosts:`,
							filter.published ? "published" : "drafts",
							{ filter },
						);
					},
					afterLoadPosts: async (posts, _filter, context) => {
						console.log(
							`[${context.isSSR ? "SSR" : "CSR"}] afterLoadPosts:`,
							posts?.length || 0,
							"posts loaded",
						);
					},
					beforeLoadPost: async (slug, context) => {
						console.log(
							`[${context.isSSR ? "SSR" : "CSR"}] beforeLoadPost:`,
							slug,
						);
					},
					afterLoadPost: async (post, slug, context) => {
						console.log(
							`[${context.isSSR ? "SSR" : "CSR"}] afterLoadPost:`,
							slug,
							post?.title || "not found",
						);
					},
					onErrorLoad: async (error, context) => {
						console.log(
							`[${context.isSSR ? "SSR" : "CSR"}] Load error:`,
							error.message,
						);
					},
				},
			}),
			aiChat: aiChatClientPlugin({
				...(requestIdentity ? { identityPartition: requestIdentity } : {}),
				mode: "authenticated",
			}),
			cms: cmsClientPlugin(),
			formBuilder: formBuilderClientPlugin(),
			uiBuilder: uiBuilderClientPlugin(),
			routeDocs: routeDocsClientPlugin({
				title: "Client Route Documentation",
				description: "Documentation for all client routes in this application",
			}),
			kanban: kanbanClientPlugin({
				...(requestIdentity ? { identityPartition: requestIdentity } : {}),
				seo: {
					siteName: "BTST Kanban",
					description: "Manage your projects with kanban boards",
				},
			}),
			comments: commentsClientPlugin({
				hooks: requestIdentity
					? {
							beforeLoadUserComments: (context) => {
								context.currentUserId = requestIdentity.id;
							},
						}
					: undefined,
			}),
			media: mediaClientPlugin({
				uploadMode: "direct",
				...(requestIdentity ? { identityPartition: requestIdentity } : {}),
			}),
		},
	});
};

/** Browser-safe stack: public origin only, never request headers. */
export const getStackClient = (
	queryClient: QueryClient,
	options?: StackClientOptions,
) => {
	const siteOrigin = options?.siteOrigin ?? getBrowserSiteOrigin();
	return createAppClientStack(queryClient, {
		apiOrigin: options?.apiOrigin ?? getBrowserApiOrigin(siteOrigin),
		siteOrigin,
	});
};

/** Focused browser stack for standalone CMS hook examples. */
export const getCmsBrowserClientStack = (queryClient: QueryClient) =>
	createClientStack({
		...resolveSharedClientRuntime(queryClient, {
			apiOrigin: getBrowserApiOrigin(getBrowserSiteOrigin()),
			siteOrigin: getBrowserSiteOrigin(),
		}),
		plugins: { cms: cmsClientPlugin() },
	});
