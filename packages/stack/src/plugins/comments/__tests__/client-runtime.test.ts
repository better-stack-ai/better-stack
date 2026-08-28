import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createClientStack } from "../../../client";
import { commentsClientPlugin, type CommentsClientConfig } from "../client";

function requestDetails(input: RequestInfo | URL, init?: RequestInit) {
	const request = input instanceof Request ? input : new Request(input, init);
	return { url: request.url, headers: request.headers };
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

describe("Comments resolved client runtime", () => {
	it("drives loaders, overridden metadata, inherited headers, and cache from one runtime", async () => {
		const queryClient = new QueryClient();
		const requests: Array<{ url: string; headers: Headers }> = [];
		vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
			requests.push(requestDetails(input, init));
			return jsonResponse({ items: [], total: 0, limit: 20, offset: 0 });
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
			site: { baseURL: "https://www.example.com", basePath: "/pages" },
			queryClient,
			plugins: { comments: commentsClientPlugin() },
			endpoints: {
				comments: {
					api: { basePath: "/api/comments" },
					site: {
						baseURL: "https://community.example.net",
						basePath: "/discussion",
					},
				},
			},
		});

		await stack.router.getRoute("/comments/moderation")?.loader?.();

		const metadata = stack.router.getRoute("/comments/moderation")?.meta?.();
		expect(metadata).toEqual(
			expect.arrayContaining([
				{
					property: "og:url",
					content:
						"https://community.example.net/discussion/comments/moderation",
				},
			]),
		);
		expect(stack.router.getRoute("/comments")?.meta?.()).toEqual(
			expect.arrayContaining([
				{
					property: "og:url",
					content: "https://community.example.net/discussion/comments",
				},
			]),
		);
		expect(stack.provider.queryClient).toBe(queryClient);
		expect(queryClient.getQueryCache().getAll()).toHaveLength(1);
		expect(requests).toHaveLength(1);
		expect(requests[0]?.url).toMatch(
			/^https:\/\/app\.example\.com\/api\/comments\/comments\?/,
		);
		expect(requests[0]?.headers.get("authorization")).toBe(
			"Bearer server-token",
		);
		expect(requests[0]?.headers.get("cookie")).toBe("session=server");
		expect(requests[0]?.headers.get("x-request")).toBe("request-value");
	});

	it.each([
		{
			label: "an inherited nested site mount",
			basePath: "/pages",
			expectedBase: "https://www.example.com/pages",
		},
		{
			label: "an inherited root site mount",
			basePath: "/",
			expectedBase: "https://www.example.com",
		},
	])(
		"normalizes metadata for every Comments route with $label",
		({ basePath, expectedBase }) => {
			const stack = createClientStack({
				api: { baseURL: "https://app.example.com", basePath: "/api/data" },
				site: { baseURL: "https://www.example.com", basePath },
				queryClient: new QueryClient(),
				plugins: { comments: commentsClientPlugin() },
			});

			for (const routePath of ["/comments/moderation", "/comments"] as const) {
				expect(stack.router.getRoute(routePath)?.meta?.()).toEqual(
					expect.arrayContaining([
						{
							property: "og:url",
							content: `${expectedBase}${routePath}`,
						},
					]),
				);
			}
		},
	);

	it("isolates sensitive request headers across a Comments origin override", async () => {
		const requests: Array<{ url: string; headers: Headers }> = [];
		vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
			requests.push(requestDetails(input, init));
			return jsonResponse({ items: [], total: 0, limit: 20, offset: 0 });
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
			plugins: { comments: commentsClientPlugin() },
			endpoints: {
				comments: {
					api: {
						baseURL: "https://discussion.example.net",
						basePath: "/btst/comments",
						browserHeaders: { "x-public-client": "public-value" },
					},
				},
			},
		});

		await stack.router.getRoute("/comments/moderation")?.loader?.();

		expect(requests).toHaveLength(1);
		expect(requests[0]?.url).toMatch(
			/^https:\/\/discussion\.example\.net\/btst\/comments\/comments\?/,
		);
		expect(requests[0]?.headers.get("authorization")).toBeNull();
		expect(requests[0]?.headers.get("cookie")).toBeNull();
		expect(requests[0]?.headers.get("x-request")).toBeNull();
		expect(requests[0]?.headers.get("x-public-client")).toBe("public-value");
	});

	it("does not revive removed transport fields from untyped plugin options", async () => {
		const requests: Headers[] = [];
		vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
			requests.push(requestDetails(input, init).headers);
			return jsonResponse({ items: [], total: 0, limit: 20, offset: 0 });
		});
		const legacyConfig = {
			headers: {
				authorization: "Bearer hidden-plugin-token",
				cookie: "session=hidden-plugin",
			},
		} as unknown as CommentsClientConfig;
		const stack = createClientStack({
			api: { baseURL: "https://app.example.com", basePath: "/api/data" },
			site: { baseURL: "https://app.example.com", basePath: "/pages" },
			queryClient: new QueryClient(),
			plugins: { comments: commentsClientPlugin(legacyConfig) },
			endpoints: {
				comments: {
					api: {
						baseURL: "https://discussion.example.net",
						basePath: "/btst/comments",
					},
				},
			},
		});

		await stack.router.getRoute("/comments/moderation")?.loader?.();

		expect(requests).toHaveLength(1);
		expect(requests[0]?.get("authorization")).toBeNull();
		expect(requests[0]?.get("cookie")).toBeNull();
	});

	it("reports each loader failure once and contains reporter failures", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			jsonResponse({ message: "comments unavailable" }, 500),
		);
		const onErrorLoad = vi.fn((_error: Error, _context: unknown) => {
			throw new Error("reporter unavailable");
		});
		const stack = createClientStack({
			api: { baseURL: "https://app.example.com", basePath: "/api/data" },
			site: { baseURL: "https://app.example.com", basePath: "/pages" },
			queryClient: new QueryClient(),
			plugins: { comments: commentsClientPlugin({ hooks: { onErrorLoad } }) },
		});

		await expect(
			stack.router.getRoute("/comments/moderation")?.loader?.(),
		).resolves.toBeUndefined();
		expect(onErrorLoad).toHaveBeenCalledTimes(1);
		expect(onErrorLoad.mock.calls[0]?.[1]).toMatchObject({
			path: "/comments/moderation",
			isSSR: true,
			apiBaseURL: "https://app.example.com",
			apiBasePath: "/api/data",
		});
	});
});
