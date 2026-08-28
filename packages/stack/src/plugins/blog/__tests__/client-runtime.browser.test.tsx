// @vitest-environment jsdom
import { QueryClient, dehydrate, hydrate } from "@tanstack/react-query";
import { act, Suspense } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createClientStack } from "../../../client";
import { StackProvider } from "@btst/stack/context";
import { createApiClient } from "../../client";
import type { BlogApiRouter } from "../api";
import { blogClientPlugin } from "../client";
import { useCreatePost, usePost, useSuspensePosts } from "../client/hooks";
import { createBlogQueryKeys } from "../query-keys";
import type { SerializedPost } from "../types";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const post = {
	id: "post-1",
	title: "Runtime post",
	content: "Runtime content",
	excerpt: "Runtime excerpt",
	slug: "runtime-post",
	published: true,
	image: undefined,
	tags: [],
	authorId: "author-1",
	publishedAt: "2026-01-02T00:00:00.000Z",
	createdAt: "2026-01-01T00:00:00.000Z",
	updatedAt: "2026-01-03T00:00:00.000Z",
} as SerializedPost;

function jsonResponse(value: unknown) {
	return new Response(JSON.stringify(value), {
		status: 200,
		headers: { "content-type": "application/json" },
	});
}

async function waitFor(check: () => boolean, timeout = 3000) {
	const start = Date.now();
	while (!check()) {
		if (Date.now() - start > timeout) throw new Error("waitFor timed out");
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 10));
		});
	}
}

describe("Blog browser runtime", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(async () => {
		await act(async () => root.unmount());
		container.remove();
		vi.restoreAllMocks();
	});

	it("hydrates Blog hooks through the resolved stack cache without refetching", async () => {
		const serverQueryClient = new QueryClient();
		const queryKeys = createBlogQueryKeys(
			createApiClient<BlogApiRouter>({
				baseURL: "https://app.example.com",
				basePath: "/api/data",
			}),
		);
		const listQuery = queryKeys.posts.list({
			limit: 10,
			published: true,
		});
		serverQueryClient.setQueryData(listQuery.queryKey, {
			pages: [[post]],
			pageParams: [0],
		});

		const browserQueryClient = new QueryClient();
		hydrate(browserQueryClient, dehydrate(serverQueryClient));
		const stack = createClientStack({
			api: { baseURL: "https://app.example.com", basePath: "/api/data" },
			site: { baseURL: "https://app.example.com", basePath: "/pages" },
			queryClient: browserQueryClient,
			plugins: { blog: blogClientPlugin() },
		});
		const fetchMock = vi.spyOn(globalThis, "fetch");

		function Probe() {
			const { posts } = useSuspensePosts({ published: true });
			return <span>{posts[0]?.title}</span>;
		}

		await act(async () => {
			root.render(
				<StackProvider stack={stack}>
					<Suspense fallback={<span>loading</span>}>
						<Probe />
					</Suspense>
				</StackProvider>,
			);
		});

		expect(container.textContent).toBe("Runtime post");
		expect(fetchMock).not.toHaveBeenCalled();
		expect(stack.provider.queryClient).toBe(browserQueryClient);
	});

	it("uses the resolved Blog endpoint for browser queries and mutations", async () => {
		const requests: Array<{
			url: string;
			headers: Headers;
			method: string;
			credentials?: RequestCredentials;
		}> = [];
		vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
			const request = {
				url: input instanceof Request ? input.url : String(input),
				headers: new Headers(
					input instanceof Request ? input.headers : init?.headers,
				),
				method:
					input instanceof Request ? input.method : (init?.method ?? "GET"),
				credentials:
					input instanceof Request ? input.credentials : init?.credentials,
			};
			requests.push(request);
			return request.method === "GET"
				? jsonResponse({ items: [post], total: 1, limit: 1, offset: 0 })
				: jsonResponse(post);
		});
		const stack = createClientStack({
			api: { baseURL: "https://app.example.com", basePath: "/api/data" },
			site: { baseURL: "https://app.example.com", basePath: "/pages" },
			queryClient: new QueryClient(),
			plugins: { blog: blogClientPlugin() },
			endpoints: {
				blog: {
					api: {
						baseURL: "https://content.example.net",
						basePath: "/btst/blog",
						browserHeaders: { "x-public-client": "public-value" },
						credentials: "include",
					},
				},
			},
		});

		let query: ReturnType<typeof usePost> | undefined;
		let create: ReturnType<typeof useCreatePost> | undefined;
		function Probe() {
			query = usePost("runtime-post");
			create = useCreatePost();
			return null;
		}

		await act(async () => {
			root.render(
				<StackProvider stack={stack}>
					<Probe />
				</StackProvider>,
			);
		});
		await waitFor(() => query?.isLoading === false);
		await act(async () => {
			await create?.mutateAsync({
				title: post.title,
				content: post.content,
				excerpt: post.excerpt,
				slug: post.slug,
				published: true,
				tags: [],
			});
		});

		expect(query?.post).toEqual(post);
		expect(requests).toHaveLength(2);
		for (const request of requests) {
			expect(request.url).toMatch(
				/^https:\/\/content\.example\.net\/btst\/blog\//,
			);
			expect(request.headers.get("x-public-client")).toBe("public-value");
			expect(request.headers.get("authorization")).toBeNull();
			expect(request.headers.get("cookie")).toBeNull();
			expect(request.credentials).toBe("include");
		}
	});

	it("uses a same-origin path-only Blog endpoint for browser queries and mutations", async () => {
		const requests: Array<{ url: string; method: string }> = [];
		vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
			const request = {
				url: input instanceof Request ? input.url : String(input),
				method:
					input instanceof Request ? input.method : (init?.method ?? "GET"),
			};
			requests.push(request);
			return request.method === "GET"
				? jsonResponse({ items: [post], total: 1, limit: 1, offset: 0 })
				: jsonResponse(post);
		});
		const stack = createClientStack({
			api: { baseURL: "https://app.example.com", basePath: "/api/data" },
			site: { baseURL: "https://app.example.com", basePath: "/pages" },
			queryClient: new QueryClient(),
			plugins: { blog: blogClientPlugin() },
			endpoints: { blog: { api: { basePath: "/api/blog" } } },
		});

		let query: ReturnType<typeof usePost> | undefined;
		let create: ReturnType<typeof useCreatePost> | undefined;
		function Probe() {
			query = usePost("runtime-post");
			create = useCreatePost();
			return null;
		}

		await act(async () => {
			root.render(
				<StackProvider stack={stack}>
					<Probe />
				</StackProvider>,
			);
		});
		await waitFor(() => query?.isLoading === false);
		await act(async () => {
			await create?.mutateAsync({
				title: post.title,
				content: post.content,
				excerpt: post.excerpt,
				slug: post.slug,
				published: true,
				tags: [],
			});
		});

		expect(query?.post).toEqual(post);
		expect(requests).toHaveLength(2);
		expect(requests).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					url: expect.stringMatching(
						/^https:\/\/app\.example\.com\/api\/blog\/posts\?slug=runtime-post&/,
					),
					method: "GET",
				}),
				expect.objectContaining({
					url: "https://app.example.com/api/blog/posts",
					method: "POST",
				}),
			]),
		);
	});
});
