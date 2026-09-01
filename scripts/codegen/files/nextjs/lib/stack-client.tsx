import {
	createClientStack,
	type ClientPluginEndpointOverride,
} from "@btst/stack/client";
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
	apiOrigin: string;
	siteOrigin: string;
	headers?: Headers;
	/** Request-only identity used to align protected SSR query keys. */
	requestIdentity?: StackIdentity;
}

export type ResolvedStackClientOrigins = Pick<
	AppClientStackRuntime,
	"apiOrigin" | "siteOrigin"
>;

export interface StackClientOrigins {
	apiOrigin?: string;
	siteOrigin?: string;
}

export type StackClientOptions = StackClientOrigins;

const getBrowserSiteOrigin = () =>
	process.env.NEXT_PUBLIC_SITE_URL ||
	process.env.NEXT_PUBLIC_BASE_URL ||
	(typeof window === "undefined"
		? "http://localhost:3000"
		: window.location.origin);

const getBrowserApiOrigin = (siteOrigin: string) =>
	process.env.NEXT_PUBLIC_API_URL ||
	process.env.NEXT_PUBLIC_BASE_URL ||
	siteOrigin;

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

function getCrossOriginApiEndpoint(apiOrigin: string, siteOrigin: string) {
	if (apiOrigin === siteOrigin) return undefined;
	return {
		api: {
			baseURL: apiOrigin,
			basePath: "/api/data",
			credentials: "include",
		},
	} satisfies ClientPluginEndpointOverride;
}

/** One canonical plugin/runtime composition shared by SSR and browser stacks. */
export const createAppClientStack = (
	queryClient: QueryClient,
	runtime: AppClientStackRuntime,
) => {
	const { apiOrigin, siteOrigin, requestIdentity } = runtime;
	const crossOriginApiEndpoint = getCrossOriginApiEndpoint(
		apiOrigin,
		siteOrigin,
	);
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
					afterLoadPosts: async (posts, filter, context) => {
						console.log(
							`[${context.isSSR ? "SSR" : "CSR"}] afterLoadPosts:`,
							filter.published ? "published" : "drafts",
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
				identityPartition: requestIdentity ?? undefined,
				mode: "authenticated",
				seo: {
					siteName: "BTST Chat",
					description: "AI-powered chat assistant",
				},
				hooks: {
					beforeLoadConversations: async (context) => {
						console.log(
							`[${context.isSSR ? "SSR" : "CSR"}] beforeLoadConversations`,
						);
					},
					afterLoadConversations: async (conversations, context) => {
						console.log(
							`[${context.isSSR ? "SSR" : "CSR"}] afterLoadConversations:`,
							conversations?.length || 0,
						);
					},
				},
			}),
			cms: cmsClientPlugin(),
			formBuilder: formBuilderClientPlugin(),
			uiBuilder: uiBuilderClientPlugin({
				hooks: {
					beforeLoadPageList: async (context) => {
						console.log(
							`[${context.isSSR ? "SSR" : "CSR"}] beforeLoadPageList`,
						);
					},
					beforeLoadPageBuilder: async (pageId, context) => {
						console.log(
							`[${context.isSSR ? "SSR" : "CSR"}] beforeLoadPageBuilder:`,
							pageId || "new",
						);
					},
				},
			}),
			routeDocs: routeDocsClientPlugin({
				title: "Client Route Documentation",
				description: "Documentation for all client routes in this application",
			}),
			kanban: kanbanClientPlugin({
				identityPartition: requestIdentity ?? undefined,
				seo: {
					siteName: "BTST Kanban",
					description: "Manage your projects with kanban boards",
				},
				hooks: {
					beforeLoadBoards: async (context) => {
						console.log(`[${context.isSSR ? "SSR" : "CSR"}] beforeLoadBoards`);
					},
					afterLoadBoards: async (boards, context) => {
						console.log(
							`[${context.isSSR ? "SSR" : "CSR"}] afterLoadBoards:`,
							boards?.length || 0,
						);
					},
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
				identityPartition: requestIdentity ?? undefined,
			}),
		},
		...(crossOriginApiEndpoint
			? {
					endpoints: {
						todos: crossOriginApiEndpoint,
						blog: crossOriginApiEndpoint,
						aiChat: crossOriginApiEndpoint,
						cms: crossOriginApiEndpoint,
						formBuilder: crossOriginApiEndpoint,
						kanban: crossOriginApiEndpoint,
						comments: crossOriginApiEndpoint,
						media: crossOriginApiEndpoint,
					},
				}
			: {}),
	});
};

/** Browser-safe stack: public origin only, never request headers. */
export const getStackClient = (
	queryClient: QueryClient,
	options?: StackClientOrigins,
) => {
	const siteOrigin = options?.siteOrigin ?? getBrowserSiteOrigin();
	return createAppClientStack(queryClient, {
		apiOrigin: options?.apiOrigin ?? getBrowserApiOrigin(siteOrigin),
		siteOrigin,
	});
};

/** Focused browser stack for standalone CMS hook examples. */
export const getCmsBrowserClientStack = (
	queryClient: QueryClient,
	origins: ResolvedStackClientOrigins,
) => {
	const crossOriginApiEndpoint = getCrossOriginApiEndpoint(
		origins.apiOrigin,
		origins.siteOrigin,
	);
	return createClientStack({
		...resolveSharedClientRuntime(queryClient, {
			...origins,
		}),
		plugins: { cms: cmsClientPlugin() },
		...(crossOriginApiEndpoint
			? {
					endpoints: {
						cms: crossOriginApiEndpoint,
					},
				}
			: {}),
	});
};
