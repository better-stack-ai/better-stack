import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createClientStack } from "../../../client";
import { cmsClientPlugin } from "../client";
import { uiBuilderClientPlugin } from "../../ui-builder/client";

const contentType = {
	id: "type-1",
	name: "Article",
	slug: "article",
	schema: {},
	itemCount: 1,
	createdAt: "2026-01-01T00:00:00.000Z",
	updatedAt: "2026-01-01T00:00:00.000Z",
};

const contentItem = {
	id: "item-1",
	contentTypeId: contentType.id,
	slug: "runtime-article",
	data: "{}",
	parsedData: { title: "Runtime article" },
	contentType,
	createdAt: "2026-01-01T00:00:00.000Z",
	updatedAt: "2026-01-01T00:00:00.000Z",
};

const uiBuilderItem = {
	...contentItem,
	id: "page-1",
	contentTypeId: "ui-builder-type",
	slug: "runtime-page",
	parsedData: { layers: "[]", variables: "[]", status: "published" },
};

function jsonResponse(value: unknown, status = 200) {
	return new Response(JSON.stringify(value), {
		status,
		headers: { "content-type": "application/json" },
	});
}

function responseFor(input: RequestInfo | URL) {
	const url = new URL(input instanceof Request ? input.url : String(input));
	if (url.pathname.endsWith("/content-types")) return [contentType];
	if (url.pathname.includes("/content/ui-builder-page/page-1")) {
		return uiBuilderItem;
	}
	if (url.pathname.includes("/content/ui-builder-page")) {
		return { items: [uiBuilderItem], total: 1, limit: 10, offset: 0 };
	}
	if (url.pathname.includes("/content/article/item-1")) return contentItem;
	if (url.pathname.includes("/content/article")) {
		return { items: [contentItem], total: 1, limit: 20, offset: 0 };
	}
	return {};
}

function requestDetails(input: RequestInfo | URL, init?: RequestInit) {
	const request = input instanceof Request ? input : new Request(input, init);
	return { url: request.url, headers: request.headers };
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe("CMS and UI Builder resolved client runtime", () => {
	it("drives every CMS and UI Builder loader and metadata read from one inherited runtime", async () => {
		const queryClient = new QueryClient();
		const requests: Array<{ url: string; headers: Headers }> = [];
		vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
			requests.push(requestDetails(input, init));
			return jsonResponse(responseFor(input));
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
			plugins: {
				cms: cmsClientPlugin(),
				uiBuilder: uiBuilderClientPlugin(),
			},
		});

		for (const path of [
			"/cms",
			"/cms/article",
			"/cms/article/new",
			"/cms/article/item-1",
			"/ui-builder",
			"/ui-builder/new",
			"/ui-builder/page-1/edit",
		]) {
			const route = stack.router.getRoute(path);
			expect(route, path).toBeTruthy();
			await route?.loader?.();
			await route?.meta?.();
		}

		expect(stack.provider.queryClient).toBe(queryClient);
		expect(stack.provider.plugins.cms.id).toBe("cms");
		expect(stack.provider.plugins.uiBuilder.id).toBe("uiBuilder");
		expect(stack.provider.plugins.cms.site).toEqual({
			baseURL: "https://www.example.com",
			basePath: "/pages",
		});
		expect(stack.provider.plugins.uiBuilder.site).toEqual({
			baseURL: "https://www.example.com",
			basePath: "/pages",
		});
		expect(queryClient.getQueryCache().getAll().length).toBeGreaterThan(0);
		expect(requests.length).toBeGreaterThan(0);
		expect(
			requests.some((request) => request.url.includes("/content-types")),
		).toBe(true);
		expect(
			requests.some((request) =>
				request.url.includes("/content/ui-builder-page"),
			),
		).toBe(true);
		for (const request of requests) {
			expect(request.url).toMatch(/^https:\/\/app\.example\.com\/api\/data\//);
			expect(request.headers.get("authorization")).toBe("Bearer server-token");
			expect(request.headers.get("cookie")).toBe("session=server");
			expect(request.headers.get("x-request")).toBe("request-value");
		}
	});

	it("uses same-origin path overrides for both CMS and its UI Builder consumer", async () => {
		const requests: string[] = [];
		vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
			requests.push(input instanceof Request ? input.url : String(input));
			return jsonResponse(responseFor(input));
		});
		const stack = createClientStack({
			api: { baseURL: "https://app.example.com", basePath: "/api/data" },
			site: { baseURL: "https://app.example.com", basePath: "/pages" },
			queryClient: new QueryClient(),
			plugins: {
				cms: cmsClientPlugin(),
				uiBuilder: uiBuilderClientPlugin(),
			},
			endpoints: {
				cms: { api: { basePath: "/api/cms" } },
				uiBuilder: { api: { basePath: "/api/cms" } },
			},
		});

		await stack.router.getRoute("/cms")?.loader?.();
		await stack.router.getRoute("/ui-builder")?.loader?.();

		expect(requests.length).toBeGreaterThanOrEqual(2);
		for (const url of requests) {
			expect(url).toMatch(/^https:\/\/app\.example\.com\/api\/cms\//);
		}
	});

	it("isolates sensitive headers for both plugins across an origin override", async () => {
		const requests: Array<{ url: string; headers: Headers }> = [];
		vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
			requests.push(requestDetails(input, init));
			return jsonResponse(responseFor(input));
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
			plugins: {
				cms: cmsClientPlugin(),
				uiBuilder: uiBuilderClientPlugin(),
			},
			endpoints: {
				cms: {
					api: {
						baseURL: "https://content.example.net",
						basePath: "/btst/cms",
						browserHeaders: { "x-public-client": "public-value" },
					},
				},
				uiBuilder: {
					api: {
						baseURL: "https://content.example.net",
						basePath: "/btst/cms",
						browserHeaders: { "x-public-client": "public-value" },
					},
				},
			},
		});

		await stack.router.getRoute("/cms")?.loader?.();
		await stack.router.getRoute("/ui-builder")?.loader?.();

		expect(requests.length).toBeGreaterThanOrEqual(2);
		for (const request of requests) {
			expect(request.url).toMatch(
				/^https:\/\/content\.example\.net\/btst\/cms\//,
			);
			expect(request.headers.get("authorization")).toBeNull();
			expect(request.headers.get("cookie")).toBeNull();
			expect(request.headers.get("x-request")).toBeNull();
			expect(request.headers.get("x-public-client")).toBe("public-value");
		}
	});

	it("reports CMS loader failures once through onErrorLoad", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			jsonResponse({ message: "unavailable" }, 500),
		);
		const onErrorLoad = vi.fn((_error: Error, _context: unknown) => {
			throw new Error("reporter failed");
		});
		const stack = createClientStack({
			api: { baseURL: "https://app.example.com", basePath: "/api/data" },
			site: { baseURL: "https://app.example.com", basePath: "/pages" },
			queryClient: new QueryClient(),
			plugins: { cms: cmsClientPlugin({ hooks: { onErrorLoad } }) },
		});

		await expect(
			stack.router.getRoute("/cms")?.loader?.(),
		).resolves.toBeUndefined();
		expect(onErrorLoad).toHaveBeenCalledTimes(1);
		expect(onErrorLoad.mock.calls[0]?.[1]).toMatchObject({
			path: "/cms",
			isSSR: true,
			apiBaseURL: "https://app.example.com",
			apiBasePath: "/api/data",
		});
	});

	it("reports UI Builder loader failures once through onErrorLoad", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			jsonResponse({ message: "unavailable" }, 500),
		);
		const onErrorLoad = vi.fn();
		const stack = createClientStack({
			api: { baseURL: "https://app.example.com", basePath: "/api/data" },
			site: { baseURL: "https://app.example.com", basePath: "/pages" },
			queryClient: new QueryClient(),
			plugins: {
				uiBuilder: uiBuilderClientPlugin({ hooks: { onErrorLoad } }),
			},
		});

		await expect(
			stack.router.getRoute("/ui-builder")?.loader?.(),
		).resolves.toBeUndefined();
		expect(onErrorLoad).toHaveBeenCalledTimes(1);
		expect(onErrorLoad.mock.calls[0]?.[1]).toMatchObject({
			path: "/ui-builder",
			isSSR: true,
			apiBaseURL: "https://app.example.com",
			apiBasePath: "/api/data",
		});
	});
});
