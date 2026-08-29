import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createClientStack } from "../../../client";
import {
	formBuilderClientPlugin,
	type FormBuilderClientConfig,
} from "../client";

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

describe("Form Builder resolved client runtime", () => {
	it("drives loaders, endpoint overrides, request headers, and cache from one runtime", async () => {
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
			site: { baseURL: "https://app.example.com", basePath: "/pages" },
			queryClient,
			plugins: { formBuilder: formBuilderClientPlugin() },
			endpoints: { formBuilder: { api: { basePath: "/api/forms" } } },
		});

		await stack.router.getRoute("/forms")?.loader?.();

		expect(stack.provider.queryClient).toBe(queryClient);
		expect(queryClient.getQueryCache().getAll()).toHaveLength(1);
		expect(requests).toHaveLength(1);
		expect(requests[0]?.url).toMatch(
			/^https:\/\/app\.example\.com\/api\/forms\/forms\?/,
		);
		expect(requests[0]?.headers.get("authorization")).toBe(
			"Bearer server-token",
		);
		expect(requests[0]?.headers.get("cookie")).toBe("session=server");
		expect(requests[0]?.headers.get("x-request")).toBe("request-value");
	});

	it("isolates sensitive request headers across a Form Builder origin override", async () => {
		const requests: Headers[] = [];
		vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
			requests.push(requestDetails(input, init).headers);
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
			plugins: { formBuilder: formBuilderClientPlugin() },
			endpoints: {
				formBuilder: {
					api: {
						baseURL: "https://forms.example.net",
						basePath: "/btst/forms",
						browserHeaders: { "x-public-client": "public-value" },
					},
				},
			},
		});

		await stack.router.getRoute("/forms")?.loader?.();

		expect(requests).toHaveLength(1);
		expect(requests[0]?.get("authorization")).toBeNull();
		expect(requests[0]?.get("cookie")).toBeNull();
		expect(requests[0]?.get("x-request")).toBeNull();
		expect(requests[0]?.get("x-public-client")).toBe("public-value");
	});

	it("does not revive removed transport fields and contains one error report", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			jsonResponse({ message: "forms unavailable" }, 500),
		);
		const onErrorLoad = vi.fn((_error: Error, _context: unknown) => {
			throw new Error("reporter unavailable");
		});
		const legacyConfig = {
			headers: { authorization: "Bearer hidden-plugin-token" },
			hooks: { onErrorLoad },
		} as unknown as FormBuilderClientConfig;
		const stack = createClientStack({
			api: { baseURL: "https://app.example.com", basePath: "/api/data" },
			site: { baseURL: "https://app.example.com", basePath: "/pages" },
			queryClient: new QueryClient(),
			plugins: { formBuilder: formBuilderClientPlugin(legacyConfig) },
		});

		await expect(
			stack.router.getRoute("/forms")?.loader?.(),
		).resolves.toBeUndefined();
		expect(onErrorLoad).toHaveBeenCalledTimes(1);
		expect(onErrorLoad.mock.calls[0]?.[1]).toMatchObject({
			path: "/forms",
			isSSR: true,
			apiBaseURL: "https://app.example.com",
			apiBasePath: "/api/data",
		});
	});
});
