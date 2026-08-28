import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createClientStack } from "../../../client";
import { blogClientPlugin } from "../client";

const post = {
	id: "post-1",
	title: "Runtime post",
	content: "Runtime content",
	excerpt: "Runtime excerpt",
	slug: "runtime-post",
	published: true,
	image: null,
	tags: [],
	authorId: "author-1",
	publishedAt: "2026-01-02T00:00:00.000Z",
	createdAt: "2026-01-01T00:00:00.000Z",
	updatedAt: "2026-01-03T00:00:00.000Z",
};

const tag = {
	id: "tag-1",
	name: "Runtime",
	slug: "runtime",
	createdAt: "2026-01-01T00:00:00.000Z",
	updatedAt: "2026-01-03T00:00:00.000Z",
};

function requestDetails(input: RequestInfo | URL, init?: RequestInit) {
	const request = input instanceof Request ? input : new Request(input, init);
	return { url: request.url, headers: request.headers };
}

function blogResponse(input: RequestInfo | URL) {
	const url = new URL(input instanceof Request ? input.url : String(input));
	if (url.pathname.endsWith("/tags")) return [tag];
	return { items: [post], total: 1, limit: 100, offset: 0 };
}

function jsonResponse(value: unknown, status = 200) {
	return new Response(JSON.stringify(value), {
		status,
		headers: { "content-type": "application/json" },
	});
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe("Blog resolved client runtime", () => {
	it("drives every loader, metadata, sitemap and cache from one inherited runtime", async () => {
		const queryClient = new QueryClient();
		const requests: Array<{ url: string; headers: Headers }> = [];
		vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
			requests.push(requestDetails(input, init));
			return jsonResponse(blogResponse(input));
		});

		const stack = createClientStack({
			api: {
				baseURL: "https://app.example.com",
				basePath: "/api/data",
				headers: {
					authorization: "Bearer server-token",
					cookie: "session=server",
					"x-request": "request-value",
				},
			},
			site: {
				baseURL: "https://www.example.com",
				basePath: "/articles",
			},
			queryClient,
			plugins: { blog: blogClientPlugin({ seo: { siteName: "Example" } }) },
			endpoints: {
				blog: {
					api: { basePath: "/api/blog" },
				},
			},
		});

		for (const path of [
			"/blog",
			"/blog/drafts",
			"/blog/new",
			"/blog/runtime-post",
			"/blog/runtime-post/edit",
			"/blog/tag/runtime",
		]) {
			const route = stack.router.getRoute(path);
			expect(route, path).toBeTruthy();
			await route?.loader?.();
		}

		const metadata = await Promise.all(
			[
				"/blog",
				"/blog/drafts",
				"/blog/new",
				"/blog/runtime-post",
				"/blog/runtime-post/edit",
				"/blog/tag/runtime",
			].map(async (path) => stack.router.getRoute(path)?.meta?.()),
		);
		const metaUrls = metadata
			.flat()
			.filter(
				(entry) => entry && "property" in entry && entry.property === "og:url",
			)
			.map((entry) => entry?.content);
		expect(metaUrls).toEqual(
			expect.arrayContaining([
				"https://www.example.com/articles/blog",
				"https://www.example.com/articles/blog/drafts",
				"https://www.example.com/articles/blog/new",
				"https://www.example.com/articles/blog/runtime-post",
				"https://www.example.com/articles/blog/runtime-post/edit",
				"https://www.example.com/articles/blog/tag/runtime",
			]),
		);

		await expect(stack.generateSitemap()).resolves.toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					url: "https://www.example.com/articles/blog",
				}),
				expect.objectContaining({
					url: "https://www.example.com/articles/blog/runtime-post",
				}),
				expect.objectContaining({
					url: "https://www.example.com/articles/blog/tag/runtime",
				}),
			]),
		);

		expect(stack.provider.queryClient).toBe(queryClient);
		expect(queryClient.getQueryCache().getAll().length).toBeGreaterThan(0);
		expect(requests.length).toBeGreaterThan(0);
		for (const request of requests) {
			expect(request.url).toMatch(/^https:\/\/app\.example\.com\/api\/blog\//);
			expect(request.headers.get("authorization")).toBe("Bearer server-token");
			expect(request.headers.get("cookie")).toBe("session=server");
			expect(request.headers.get("x-request")).toBe("request-value");
		}
	});

	it("isolates sensitive request headers across a Blog origin override", async () => {
		const requests: Array<{ url: string; headers: Headers }> = [];
		vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
			requests.push(requestDetails(input, init));
			return jsonResponse(blogResponse(input));
		});

		const stack = createClientStack({
			api: {
				baseURL: "https://app.example.com",
				basePath: "/api/data",
				headers: {
					authorization: "Bearer server-token",
					cookie: "session=server",
					"x-request": "request-value",
				},
			},
			site: { baseURL: "https://app.example.com", basePath: "/pages" },
			queryClient: new QueryClient(),
			plugins: { blog: blogClientPlugin() },
			endpoints: {
				blog: {
					api: {
						baseURL: "https://content.example.net",
						basePath: "/btst/blog",
						browserHeaders: { "x-public-client": "public-value" },
					},
				},
			},
		});

		await stack.router.getRoute("/blog")?.loader?.();
		await stack.generateSitemap();

		expect(requests.length).toBeGreaterThan(0);
		for (const request of requests) {
			expect(request.url).toMatch(
				/^https:\/\/content\.example\.net\/btst\/blog\//,
			);
			expect(request.headers.get("authorization")).toBeNull();
			expect(request.headers.get("cookie")).toBeNull();
			expect(request.headers.get("x-request")).toBeNull();
			expect(request.headers.get("x-public-client")).toBe("public-value");
		}
	});

	it.each([
		[
			"query",
			() => Promise.resolve(jsonResponse({ message: "unavailable" }, 500)),
		],
		["transport", () => Promise.reject(new Error("fetch failed"))],
	])("calls onErrorLoad once for a %s failure", async (_kind, fetchResult) => {
		vi.spyOn(globalThis, "fetch").mockImplementation(fetchResult);
		const onErrorLoad = vi.fn();
		const stack = createClientStack({
			api: { baseURL: "https://app.example.com", basePath: "/api/data" },
			site: { baseURL: "https://app.example.com", basePath: "/pages" },
			queryClient: new QueryClient(),
			plugins: { blog: blogClientPlugin({ hooks: { onErrorLoad } }) },
		});

		await expect(
			stack.router.getRoute("/blog")?.loader?.(),
		).resolves.toBeUndefined();
		expect(onErrorLoad).toHaveBeenCalledTimes(1);
		expect(onErrorLoad.mock.calls[0]?.[1]).toMatchObject({
			path: "/blog",
			isSSR: true,
			apiBaseURL: "https://app.example.com",
			apiBasePath: "/api/data",
		});
	});
});
