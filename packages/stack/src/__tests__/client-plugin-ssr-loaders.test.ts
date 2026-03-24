import { describe, expect, it } from "vitest";
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
import { UI_BUILDER_TYPE_SLUG } from "../plugins/ui-builder";
import { commentsClientPlugin } from "../plugins/comments/client";
import type { CommentsApiRouter } from "../plugins/comments/api";
import { createCommentsQueryKeys } from "../plugins/comments/query-keys";

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

describe("client plugin SSR loaders", () => {
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
		const queries = createCMSQueryKeys(client, TEST_HEADERS);
		const listQuery = queries.cmsContent.list({
			typeSlug: UI_BUILDER_TYPE_SLUG,
			limit: 20,
			offset: 0,
		});
		const uiBuilderQueryKey = [...listQuery.queryKey, "ui-builder"] as const;

		expect(getErrorMessage(queryClient, uiBuilderQueryKey)).toBe(
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
});
