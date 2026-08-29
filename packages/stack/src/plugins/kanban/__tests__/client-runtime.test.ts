import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createClientStack } from "../../../client";
import { kanbanClientPlugin, type KanbanClientConfig } from "../client";

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

afterEach(() => vi.restoreAllMocks());

describe("Kanban resolved client runtime", () => {
	it("drives loaders, root-mounted metadata, headers, and cache from one runtime", async () => {
		const queryClient = new QueryClient();
		const requests: Array<{ url: string; headers: Headers }> = [];
		vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
			requests.push(requestDetails(input, init));
			return jsonResponse({ items: [], total: 0, limit: 50, offset: 0 });
		});

		const stack = createClientStack({
			api: {
				baseURL: "https://app.example.com",
				basePath: "/api/data",
				headers: { cookie: "session=server", "x-request": "request-value" },
			},
			site: { baseURL: "https://www.example.com", basePath: "/" },
			queryClient,
			plugins: { kanban: kanbanClientPlugin() },
			endpoints: { kanban: { api: { basePath: "/api/boards" } } },
		});

		await stack.router.getRoute("/kanban")?.loader?.();
		await stack.generateSitemap();

		expect(stack.router.getRoute("/kanban")?.meta?.()).toEqual(
			expect.arrayContaining([
				{ property: "og:url", content: "https://www.example.com/kanban" },
			]),
		);
		expect(stack.provider.queryClient).toBe(queryClient);
		expect(queryClient.getQueryCache().getAll()).toHaveLength(1);
		expect(requests[0]?.url).toMatch(
			/^https:\/\/app\.example\.com\/api\/boards\/boards\?/,
		);
		expect(requests[0]?.headers.get("cookie")).toBe("session=server");
		expect(requests[0]?.headers.get("x-request")).toBe("request-value");
		expect(requests[1]?.url).toMatch(
			/^https:\/\/app\.example\.com\/api\/boards\/boards\?/,
		);
		expect(requests[1]?.headers.get("cookie")).toBeNull();
		expect(requests[1]?.headers.get("x-request")).toBeNull();
	});

	it("isolates sensitive request headers across a Kanban origin override", async () => {
		const requests: Headers[] = [];
		vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
			requests.push(requestDetails(input, init).headers);
			return jsonResponse({ items: [], total: 0, limit: 50, offset: 0 });
		});

		const stack = createClientStack({
			api: {
				baseURL: "https://app.example.com",
				basePath: "/api/data",
				headers: {
					authorization: "Bearer server-token",
					cookie: "session=server",
				},
			},
			site: { baseURL: "https://app.example.com", basePath: "/pages" },
			queryClient: new QueryClient(),
			plugins: { kanban: kanbanClientPlugin() },
			endpoints: {
				kanban: {
					api: {
						baseURL: "https://boards.example.net",
						basePath: "/btst/kanban",
						browserHeaders: { "x-public-client": "public-value" },
					},
				},
			},
		});

		await stack.router.getRoute("/kanban")?.loader?.();

		expect(requests).toHaveLength(1);
		expect(requests[0]?.get("authorization")).toBeNull();
		expect(requests[0]?.get("cookie")).toBeNull();
		expect(requests[0]?.get("x-public-client")).toBe("public-value");
	});

	it("does not revive removed transport fields and contains one error report", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			jsonResponse({ message: "boards unavailable" }, 500),
		);
		const onErrorLoad = vi.fn((_error: Error, _context: unknown) => {
			throw new Error("reporter unavailable");
		});
		const legacyConfig = {
			headers: { authorization: "Bearer hidden-plugin-token" },
			hooks: { onErrorLoad },
		} as unknown as KanbanClientConfig;
		const stack = createClientStack({
			api: { baseURL: "https://app.example.com", basePath: "/api/data" },
			site: { baseURL: "https://app.example.com", basePath: "/pages" },
			queryClient: new QueryClient(),
			plugins: { kanban: kanbanClientPlugin(legacyConfig) },
		});

		await expect(
			stack.router.getRoute("/kanban")?.loader?.(),
		).resolves.toBeUndefined();
		expect(onErrorLoad).toHaveBeenCalledTimes(1);
		expect(onErrorLoad.mock.calls[0]?.[1]).toMatchObject({
			path: "/kanban",
			isSSR: true,
			apiBaseURL: "https://app.example.com",
			apiBasePath: "/api/data",
		});
	});
});
