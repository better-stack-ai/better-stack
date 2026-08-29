import { createClientStack } from "@btst/stack/client";
import { todosClientPlugin } from "@/lib/plugins/todo/client/client";
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
	baseURL: string;
	headers?: Headers;
	/** Request-only identity used to align protected SSR query keys. */
	requestIdentity?: StackIdentity;
}

const getBrowserBaseURL = () =>
	import.meta.env.VITE_BASE_URL ||
	(typeof window === "undefined"
		? "http://localhost:3007"
		: window.location.origin);

function resolveSharedClientRuntime(
	queryClient: QueryClient,
	{ baseURL, headers }: AppClientStackRuntime,
) {
	return {
		api: {
			baseURL,
			basePath: "/api/data",
			...(headers ? { headers } : {}),
		},
		site: { baseURL, basePath: "/pages" },
		queryClient,
	};
}

/** One canonical plugin/runtime composition shared by SSR and browser stacks. */
export const createAppClientStack = (
	queryClient: QueryClient,
	runtime: AppClientStackRuntime,
) => {
	const { baseURL, requestIdentity } = runtime;
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
					defaultImage: `${baseURL}/og-image.png`,
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
export const getStackClient = (queryClient: QueryClient) =>
	createAppClientStack(queryClient, {
		baseURL: getBrowserBaseURL(),
	});

/** Focused browser stack for standalone CMS hook examples. */
export const getCmsBrowserClientStack = (queryClient: QueryClient) =>
	createClientStack({
		...resolveSharedClientRuntime(queryClient, {
			baseURL: getBrowserBaseURL(),
		}),
		plugins: { cms: cmsClientPlugin() },
	});
