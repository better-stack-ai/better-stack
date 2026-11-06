import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createClientStack } from "@btst/stack/client";
import {
	createApiClient,
	defineClientPlugin,
	defineRoute,
} from "@btst/stack/plugins/client";
import { feedbackClientPlugin } from "../client/plugin";
import { createFeedbackQueryKeys } from "../query-keys";

const identity = { id: "reader-one" };
const post = {
	id: "post-one",
	slug: "saved-views",
	title: "Saved views",
	isVoted: true,
};
const api = {
	baseURL: "https://app.test",
	basePath: "/api/feedback",
	headers: { cookie: "session=reader-one" },
};
const site = { baseURL: "https://app.test", basePath: "/pages" };
afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe("feedback SSR loaders", () => {
	it("keeps all four SSR routes alongside another plugin using post and loads identity-partitioned data", async () => {
		const requests: Request[] = [];
		vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
			const request =
				input instanceof Request ? input : new Request(input, init);
			requests.push(request);
			const path = new URL(request.url).pathname;
			const data = path.endsWith("/roadmap")
				? { planned: [post], in_progress: [], shipped: [] }
				: path.endsWith("/saved-views")
					? post
					: { items: [post], total: 1 };
			return Response.json(data);
		});
		const beforeLoad = vi.fn();
		const afterLoad = vi.fn();
		const queryClient = new QueryClient();
		const stack = createClientStack({
			api,
			site,
			queryClient,
			plugins: {
				feedback: feedbackClientPlugin({
					identityPartition: identity,
					hooks: { beforeLoad, afterLoad },
				}),
				blog: defineClientPlugin({
					id: "blog",
					resolve: () => ({
						routes: () => ({
							post: defineRoute("/blog/:slug", { page: () => null }),
							roadmap: defineRoute("/another-roadmap", { page: () => null }),
							changelog: defineRoute("/another-changelog", {
								page: () => null,
							}),
						}),
					}),
				}),
			},
		});
		const queries = createFeedbackQueryKeys(createApiClient(api));
		const cases = [
			[
				"/feedback",
				queries.feedbackPosts.list({ limit: 25, offset: 0 }, identity),
				{ items: [post], total: 1 },
			],
			[
				"/feedback/saved-views",
				queries.feedbackPosts.detail("saved-views", identity),
				post,
			],
			[
				"/feedback/roadmap",
				queries.feedbackRoadmap.list(identity),
				{ planned: [post], in_progress: [], shipped: [] },
			],
			[
				"/feedback/changelog",
				queries.feedbackChangelog.list({ limit: 25, offset: 0 }, identity),
				{ items: [post], total: 1 },
			],
		] as const;
		for (const [path, query, result] of cases) {
			const route = stack.router.getRoute(path);
			expect(route?.PageComponent).toBeDefined();
			await route?.loader?.();
			expect(queryClient.getQueryData(query.queryKey)).toEqual(result);
			expect(route?.meta?.()).toContainEqual({
				property: "og:url",
				content: `https://app.test/pages${path}`,
			});
		}
		expect(
			stack.router.getRoute("/blog/another-post")?.PageComponent,
		).toBeDefined();
		expect(requests).toHaveLength(4);
		for (const request of requests)
			expect(request.headers.get("cookie")).toBe("session=reader-one");
		expect(beforeLoad).toHaveBeenCalledTimes(4);
		expect(afterLoad).toHaveBeenCalledTimes(4);
		expect(
			queryClient.getQueryData(
				queries.feedbackPosts.detail("saved-views", { id: "reader-two" })
					.queryKey,
			),
		).toBeUndefined();
		expect(
			queryClient.getQueryData(queries.feedbackRoadmap.list().queryKey),
		).toBeUndefined();
		queryClient.clear();
	});

	it("contains API and lifecycle failures in the query cache and skips browser prefetch", async () => {
		const fetch = vi
			.spyOn(globalThis, "fetch")
			.mockResolvedValue(
				Response.json({ message: "Unavailable" }, { status: 503 }),
			);
		const onErrorLoad = vi.fn(() => {
			throw new Error("Reporter failed");
		});
		const afterLoad = vi.fn();
		const queryClient = new QueryClient();
		const stack = createClientStack({
			api,
			site,
			queryClient,
			plugins: {
				feedback: feedbackClientPlugin({ hooks: { onErrorLoad, afterLoad } }),
			},
		});
		await expect(
			stack.router.getRoute("/feedback")?.loader?.(),
		).resolves.toBeUndefined();
		expect(queryClient.getQueryCache().getAll()[0]?.state.status).toBe("error");
		expect(onErrorLoad).toHaveBeenCalledTimes(1);
		expect(afterLoad).not.toHaveBeenCalled();
		vi.stubGlobal("window", {});
		await stack.router.getRoute("/feedback/roadmap")?.loader?.();
		expect(fetch).toHaveBeenCalledTimes(1);
		queryClient.clear();
	});
});
