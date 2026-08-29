import { createStackClient } from "@btst/stack/client";
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
import { QueryClient } from "@tanstack/react-query";

// Get base URL function - works on both server and client
// On server: uses process.env.BASE_URL
// On client: uses import.meta.env.VITE_BASE_URL or falls back to window.location.origin
const getBaseURL = () =>
	typeof window !== "undefined"
		? import.meta.env.VITE_BASE_URL || window.location.origin
		: process.env.BASE_URL || "http://localhost:3008";

// Create the client library with plugins
export const getStackClient = (
	queryClient: QueryClient,
	options?: {
		headers?: Headers;
		currentUserId?: string;
		identity?: { readonly id: string; readonly [key: string]: unknown };
	},
) => {
	const baseURL = getBaseURL();
	return createStackClient({
		api: {
			baseURL,
			basePath: "/api/data",
			...(options?.headers ? { headers: options.headers } : {}),
		},
		site: { baseURL, basePath: "/pages" },
		queryClient,
		plugins: {
			todos: todosClientPlugin({
				queryClient: queryClient,
				apiBaseURL: baseURL,
				apiBasePath: "/api/data",
				siteBaseURL: baseURL,
				siteBasePath: "/pages",
			}),
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
					afterLoadPosts: async (posts, filter, context) => {
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
				identityPartition: options?.identity,
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
				identityPartition: options?.identity,
				seo: {
					siteName: "BTST Kanban",
					description: "Manage your projects with kanban boards",
				},
			}),
			comments: commentsClientPlugin({
				hooks: options?.currentUserId
					? {
							beforeLoadUserComments: (context) => {
								context.currentUserId = options.currentUserId;
							},
						}
					: undefined,
			}),
			media: mediaClientPlugin({
				uploadMode: "direct",
				identityPartition: options?.identity,
			}),
		},
	});
};
