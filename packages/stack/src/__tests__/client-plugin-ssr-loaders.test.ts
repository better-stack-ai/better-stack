import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { createApiClient, SSR_LOADER_ERROR_MESSAGE } from "../plugins/client";
import { blogClientPlugin } from "../plugins/blog/client";
import type { BlogApiRouter } from "../plugins/blog/api";
import { createBlogQueryKeys } from "../plugins/blog/query-keys";
import { cmsClientPlugin } from "../plugins/cms/client";
import type { CMSApiRouter } from "../plugins/cms/api";
import { createCMSQueryKeys } from "../plugins/cms/query-keys";
import { formBuilderClientPlugin } from "../plugins/form-builder/client";
import type { FormBuilderApiRouter } from "../plugins/form-builder/api";
import { createFormBuilderQueryKeys } from "../plugins/form-builder/query-keys";
import { uiBuilderClientPlugin } from "../plugins/ui-builder/client";
import { createUIBuilderQueryKeys } from "../plugins/ui-builder/query-keys";
import { commentsClientPlugin } from "../plugins/comments/client";
import type { CommentsApiRouter } from "../plugins/comments/api";
import { createCommentsQueryKeys } from "../plugins/comments/query-keys";
import { aiChatClientPlugin } from "../plugins/ai-chat/client";
import type { AiChatApiRouter } from "../plugins/ai-chat/api";
import { createAiChatQueryKeys } from "../plugins/ai-chat/query-keys";
import { mediaClientPlugin } from "../plugins/media/client";
import type { MediaApiRouter } from "../plugins/media/api";
import { createMediaQueryKeys } from "../plugins/media/query-keys";

const API_BASE_URL = "http://localhost:3000";
const API_BASE_PATH = "/api/data";
const SITE_BASE_URL = "http://localhost:3000";
const SITE_BASE_PATH = "/pages";
const TEST_HEADERS = new Headers();

function getErrorMessage(
	queryClient: QueryClient,
	queryKey: readonly unknown[],
) {
	const error = queryClient.getQueryState(queryKey)?.error;
	return error instanceof Error ? error.message : null;
}

function mockFetchApiError(errorMessage: string) {
	return vi.spyOn(globalThis, "fetch").mockResolvedValue(
		new Response(JSON.stringify({ message: errorMessage }), {
			status: 500,
			headers: { "content-type": "application/json" },
		}),
	);
}

describe("client plugin SSR loaders", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("blog drafts loader seeds query error when beforeLoadPosts throws", async () => {
		const queryClient = new QueryClient();
		const expectedError = new Error("blog drafts blocked");

		const plugin = blogClientPlugin({
			apiBaseURL: API_BASE_URL,
			apiBasePath: API_BASE_PATH,
			siteBaseURL: SITE_BASE_URL,
			siteBasePath: SITE_BASE_PATH,
			queryClient,
			headers: TEST_HEADERS,
			hooks: {
				beforeLoadPosts: () => {
					throw expectedError;
				},
			},
		});

		const route = plugin.routes().drafts();
		await route.loader?.();

		const client = createApiClient<BlogApiRouter>({
			baseURL: API_BASE_URL,
			basePath: API_BASE_PATH,
		});
		const queries = createBlogQueryKeys(client, TEST_HEADERS);
		const listQuery = queries.posts.list({
			query: undefined,
			limit: 10,
			published: false,
		});

		expect(getErrorMessage(queryClient, listQuery.queryKey)).toBe(
			SSR_LOADER_ERROR_MESSAGE,
		);
	});

	it("cms content list loader seeds query error when beforeLoadContentList throws", async () => {
		const queryClient = new QueryClient();
		const expectedError = new Error("cms list blocked");
		const typeSlug = "article";

		const plugin = cmsClientPlugin({
			apiBaseURL: API_BASE_URL,
			apiBasePath: API_BASE_PATH,
			siteBaseURL: SITE_BASE_URL,
			siteBasePath: SITE_BASE_PATH,
			queryClient,
			headers: TEST_HEADERS,
			hooks: {
				beforeLoadContentList: () => {
					throw expectedError;
				},
			},
		});

		const route = plugin.routes().contentList({ params: { typeSlug } });
		await route.loader?.();

		const client = createApiClient<CMSApiRouter>({
			baseURL: API_BASE_URL,
			basePath: API_BASE_PATH,
		});
		const queries = createCMSQueryKeys(client, TEST_HEADERS);
		const listQuery = queries.cmsContent.list({
			typeSlug,
			limit: 20,
			offset: 0,
		});

		expect(getErrorMessage(queryClient, listQuery.queryKey)).toBe(
			SSR_LOADER_ERROR_MESSAGE,
		);
	});

	it("form list loader seeds query error when beforeLoadFormList throws", async () => {
		const queryClient = new QueryClient();
		const expectedError = new Error("form list blocked");

		const plugin = formBuilderClientPlugin({
			apiBaseURL: API_BASE_URL,
			apiBasePath: API_BASE_PATH,
			siteBaseURL: SITE_BASE_URL,
			siteBasePath: SITE_BASE_PATH,
			queryClient,
			headers: TEST_HEADERS,
			hooks: {
				beforeLoadFormList: () => {
					throw expectedError;
				},
			},
		});

		const route = plugin.routes().formList();
		await route.loader?.();

		const client = createApiClient<FormBuilderApiRouter>({
			baseURL: API_BASE_URL,
			basePath: API_BASE_PATH,
		});
		const queries = createFormBuilderQueryKeys(client, TEST_HEADERS);
		const listQuery = queries.forms.list({ limit: 20, offset: 0 });

		expect(getErrorMessage(queryClient, listQuery.queryKey)).toBe(
			SSR_LOADER_ERROR_MESSAGE,
		);
	});

	it("ui-builder list loader seeds query error when beforeLoadPageList throws", async () => {
		const queryClient = new QueryClient();
		const expectedError = new Error("ui-builder list blocked");

		const plugin = uiBuilderClientPlugin({
			apiBaseURL: API_BASE_URL,
			apiBasePath: API_BASE_PATH,
			siteBaseURL: SITE_BASE_URL,
			siteBasePath: SITE_BASE_PATH,
			queryClient,
			headers: TEST_HEADERS,
			componentRegistry: {},
			hooks: {
				beforeLoadPageList: () => {
					throw expectedError;
				},
			},
		});

		const route = plugin.routes().pageList();
		await route.loader?.();

		const client = createApiClient<CMSApiRouter>({
			baseURL: API_BASE_URL,
			basePath: API_BASE_PATH,
		});
		const queries = createUIBuilderQueryKeys(client, TEST_HEADERS);
		const listQuery = queries.cmsContent.list({ limit: 10, offset: 0 });

		expect(getErrorMessage(queryClient, listQuery.queryKey)).toBe(
			SSR_LOADER_ERROR_MESSAGE,
		);
	});

	it("comments moderation loader seeds query error when beforeLoadModeration throws", async () => {
		const queryClient = new QueryClient();
		const expectedError = new Error("comments moderation blocked");

		const plugin = commentsClientPlugin({
			apiBaseURL: API_BASE_URL,
			apiBasePath: API_BASE_PATH,
			siteBaseURL: SITE_BASE_URL,
			siteBasePath: SITE_BASE_PATH,
			queryClient,
			headers: TEST_HEADERS,
			hooks: {
				beforeLoadModeration: () => {
					throw expectedError;
				},
			},
		});

		const route = plugin.routes().moderation();
		await route.loader?.();

		const client = createApiClient<CommentsApiRouter>({
			baseURL: API_BASE_URL,
			basePath: API_BASE_PATH,
		});
		const queries = createCommentsQueryKeys(client, TEST_HEADERS);
		const listQuery = queries.comments.list({
			status: "pending",
			limit: 20,
			offset: 0,
		});

		expect(getErrorMessage(queryClient, listQuery.queryKey)).toBe(
			SSR_LOADER_ERROR_MESSAGE,
		);
	});

	it("comments user loader seeds query error with user-scoped key when beforeLoadUserComments throws", async () => {
		const queryClient = new QueryClient();
		const expectedError = new Error("comments user view blocked");
		const currentUserId = "user-123";

		const plugin = commentsClientPlugin({
			apiBaseURL: API_BASE_URL,
			apiBasePath: API_BASE_PATH,
			siteBaseURL: SITE_BASE_URL,
			siteBasePath: SITE_BASE_PATH,
			queryClient,
			headers: TEST_HEADERS,
			hooks: {
				beforeLoadUserComments: (context) => {
					context.currentUserId = currentUserId;
					throw expectedError;
				},
			},
		});

		const route = plugin.routes().userComments();
		await route.loader?.();

		const client = createApiClient<CommentsApiRouter>({
			baseURL: API_BASE_URL,
			basePath: API_BASE_PATH,
		});
		const queries = createCommentsQueryKeys(client, TEST_HEADERS);
		const listQuery = queries.comments.list({
			authorId: currentUserId,
			sort: "desc",
			limit: 20,
			offset: 0,
		});

		expect(getErrorMessage(queryClient, listQuery.queryKey)).toBe(
			SSR_LOADER_ERROR_MESSAGE,
		);
	});

	it("comments moderation loader calls onLoadError when prefetch stores API error", async () => {
		const queryClient = new QueryClient();
		const apiErrorMessage = "comments moderation api failed";
		const onLoadError = vi.fn();
		mockFetchApiError(apiErrorMessage);

		const plugin = commentsClientPlugin({
			apiBaseURL: API_BASE_URL,
			apiBasePath: API_BASE_PATH,
			siteBaseURL: SITE_BASE_URL,
			siteBasePath: SITE_BASE_PATH,
			queryClient,
			headers: TEST_HEADERS,
			hooks: {
				onLoadError,
			},
		});

		const route = plugin.routes().moderation();
		await route.loader?.();

		expect(onLoadError).toHaveBeenCalledTimes(1);
		const [errorArg] = onLoadError.mock.calls[0] ?? [];
		expect(errorArg).toBeInstanceOf(Error);
		expect((errorArg as Error).message).toBe(apiErrorMessage);
	});

	it("comments user loader calls onLoadError when user-scoped prefetch stores API error", async () => {
		const queryClient = new QueryClient();
		const apiErrorMessage = "comments user api failed";
		const onLoadError = vi.fn();
		const currentUserId = "user-123";
		mockFetchApiError(apiErrorMessage);

		const plugin = commentsClientPlugin({
			apiBaseURL: API_BASE_URL,
			apiBasePath: API_BASE_PATH,
			siteBaseURL: SITE_BASE_URL,
			siteBasePath: SITE_BASE_PATH,
			queryClient,
			headers: TEST_HEADERS,
			hooks: {
				beforeLoadUserComments: (context) => {
					context.currentUserId = currentUserId;
				},
				onLoadError,
			},
		});

		const route = plugin.routes().userComments();
		await route.loader?.();

		expect(onLoadError).toHaveBeenCalledTimes(1);
		const [errorArg, contextArg] = onLoadError.mock.calls[0] ?? [];
		expect(errorArg).toBeInstanceOf(Error);
		expect((errorArg as Error).message).toBe(apiErrorMessage);
		expect(contextArg).toMatchObject({ currentUserId });
	});

	it("media library loader prefetches the complete folder tree in its identity key", async () => {
		const queryClient = new QueryClient();
		const identity = { id: "media-user" };
		const requestedUrls: string[] = [];
		vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
			const url =
				typeof input === "string"
					? input
					: input instanceof URL
						? input.href
						: input.url;
			requestedUrls.push(url);
			return new Response(
				JSON.stringify(
					url.includes("/media/assets") ? { items: [], total: 0 } : [],
				),
				{ status: 200, headers: { "content-type": "application/json" } },
			);
		});
		const plugin = mediaClientPlugin({
			apiBaseURL: API_BASE_URL,
			apiBasePath: API_BASE_PATH,
			siteBaseURL: SITE_BASE_URL,
			siteBasePath: SITE_BASE_PATH,
			queryClient,
			headers: TEST_HEADERS,
			identityPartition: identity,
		});

		await plugin.routes().library().loader?.();

		const client = createApiClient<MediaApiRouter>({
			baseURL: API_BASE_URL,
			basePath: API_BASE_PATH,
		});
		const foldersQuery = createMediaQueryKeys(
			client,
			TEST_HEADERS,
		).mediaFolders.list(undefined, identity);
		expect(queryClient.getQueryData(foldersQuery.queryKey)).toEqual([]);
		const folderUrl = new URL(
			requestedUrls.find((url) => url.includes("/media/folders")) ?? "",
		);
		expect(folderUrl.searchParams.has("parentId")).toBe(false);
	});

	it("media library loader reports a stored folder-prefetch error", async () => {
		const queryClient = new QueryClient();
		const onLoadError = vi.fn();
		vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
			const url =
				typeof input === "string"
					? input
					: input instanceof URL
						? input.href
						: input.url;
			return url.includes("/media/folders")
				? new Response(JSON.stringify({ message: "folders unavailable" }), {
						status: 500,
						headers: { "content-type": "application/json" },
					})
				: new Response(JSON.stringify({ items: [], total: 0 }), {
						status: 200,
						headers: { "content-type": "application/json" },
					});
		});
		const plugin = mediaClientPlugin({
			apiBaseURL: API_BASE_URL,
			apiBasePath: API_BASE_PATH,
			siteBaseURL: SITE_BASE_URL,
			siteBasePath: SITE_BASE_PATH,
			queryClient,
			headers: TEST_HEADERS,
			hooks: { onLoadError },
		});

		await plugin.routes().library().loader?.();

		expect(onLoadError).toHaveBeenCalledTimes(1);
		const [errorArg] = onLoadError.mock.calls[0] ?? [];
		expect(errorArg).toBeInstanceOf(Error);
		expect((errorArg as Error).message).toBe("folders unavailable");
	});

	it("AI Chat list loader seeds a sanitized query error when a hook throws", async () => {
		const queryClient = new QueryClient();
		const plugin = aiChatClientPlugin({
			apiBaseURL: API_BASE_URL,
			apiBasePath: API_BASE_PATH,
			siteBaseURL: SITE_BASE_URL,
			siteBasePath: SITE_BASE_PATH,
			queryClient,
			headers: TEST_HEADERS,
			hooks: {
				beforeLoadConversations: () => {
					throw new Error("private loader detail");
				},
			},
		});

		await plugin.routes().chat().loader?.();

		const client = createApiClient<AiChatApiRouter>({
			baseURL: API_BASE_URL,
			basePath: API_BASE_PATH,
		});
		const query = createAiChatQueryKeys(
			client,
			TEST_HEADERS,
		).conversations.list();
		expect(getErrorMessage(queryClient, query.queryKey)).toBe(
			SSR_LOADER_ERROR_MESSAGE,
		);
	});

	it("AI Chat detail loader seeds sanitized detail and list errors", async () => {
		const queryClient = new QueryClient();
		const id = "conv-1";
		const plugin = aiChatClientPlugin({
			apiBaseURL: API_BASE_URL,
			apiBasePath: API_BASE_PATH,
			siteBaseURL: SITE_BASE_URL,
			siteBasePath: SITE_BASE_PATH,
			queryClient,
			headers: TEST_HEADERS,
			hooks: {
				beforeLoadConversation: () => {
					throw new Error("private conversation detail");
				},
			},
		});

		const routes = plugin.routes();
		const chatConversation = (
			routes as unknown as {
				chatConversation: (args: { params: { id: string } }) => {
					loader?: () => Promise<void>;
				};
			}
		).chatConversation;
		await chatConversation({ params: { id } }).loader?.();

		const client = createApiClient<AiChatApiRouter>({
			baseURL: API_BASE_URL,
			basePath: API_BASE_PATH,
		});
		const queries = createAiChatQueryKeys(client, TEST_HEADERS);
		expect(
			getErrorMessage(queryClient, queries.conversations.detail(id).queryKey),
		).toBe(SSR_LOADER_ERROR_MESSAGE);
		expect(
			getErrorMessage(queryClient, queries.conversations.list().queryKey),
		).toBe(SSR_LOADER_ERROR_MESSAGE);
	});
});
