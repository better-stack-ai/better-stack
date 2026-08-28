import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createClientStack } from "../client";
import { aiChatClientPlugin } from "../plugins/ai-chat/client";
import { createAiChatQueryKeys } from "../plugins/ai-chat/query-keys";
import { createApiClient, SSR_LOADER_ERROR_MESSAGE } from "../plugins/client";
import type { AiChatApiRouter } from "../plugins/ai-chat/api";

const appApi = {
	baseURL: "https://app.example.com",
	basePath: "/api/data",
} as const;
const appSite = {
	baseURL: "https://app.example.com",
	basePath: "/pages",
} as const;

function response(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json" },
	});
}

function observedRequest(call: unknown[]) {
	return new Request(
		call[0] as RequestInfo | URL,
		call[1] as RequestInit | undefined,
	);
}

describe("AI Chat resolved client runtime", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("declares aiChat while preserving chat URLs, modes, metadata and sitemap behavior", async () => {
		const authenticated = aiChatClientPlugin({
			seo: { description: "Private assistant" },
		});
		expect(authenticated.id).toBe("aiChat");

		const authenticatedStack = createClientStack({
			api: appApi,
			site: appSite,
			queryClient: new QueryClient(),
			plugins: { aiChat: authenticated },
			endpoints: {
				aiChat: {
					site: {
						baseURL: "https://community.example.com",
						basePath: "/assistant",
					},
				},
			},
		});
		const home = authenticatedStack.router.getRoute("/chat");
		const conversation = authenticatedStack.router.getRoute("/chat/conv-1");
		expect(home).toBeTruthy();
		expect(conversation).toBeTruthy();
		expect(home?.meta?.()).toContainEqual({
			property: "og:url",
			content: "https://community.example.com/assistant/chat",
		});
		expect(conversation?.meta?.()).toContainEqual({
			property: "og:url",
			content: "https://community.example.com/assistant/chat/conv-1",
		});
		await expect(authenticatedStack.generateSitemap()).resolves.toEqual([]);

		const publicStack = createClientStack({
			api: appApi,
			site: appSite,
			queryClient: new QueryClient(),
			plugins: { aiChat: aiChatClientPlugin({ mode: "public" }) },
		});
		expect(publicStack.provider.plugins.aiChat.config).toEqual({
			mode: "public",
		});
		expect(publicStack.router.getRoute("/chat")).toBeTruthy();
		expect(publicStack.router.getRoute("/chat/conv-1")).toBeNull();
	});

	it("builds root-mounted chat metadata without protocol-relative paths", () => {
		const stack = createClientStack({
			api: appApi,
			site: { baseURL: "https://app.example.com", basePath: "/" },
			queryClient: new QueryClient(),
			plugins: { aiChat: aiChatClientPlugin() },
		});

		expect(stack.router.getRoute("/chat")?.meta?.()).toContainEqual({
			property: "og:url",
			content: "https://app.example.com/chat",
		});
		expect(stack.router.getRoute("/chat/conv-1")?.meta?.()).toContainEqual({
			property: "og:url",
			content: "https://app.example.com/chat/conv-1",
		});
	});

	it("uses one same-origin override and request headers for loader hydration", async () => {
		const fetchMock = vi
			.spyOn(globalThis, "fetch")
			.mockResolvedValue(response([]));
		const queryClient = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});
		const stack = createClientStack({
			api: {
				...appApi,
				headers: {
					cookie: "session=server",
					authorization: "Bearer server",
				},
			},
			site: appSite,
			queryClient,
			plugins: { aiChat: aiChatClientPlugin() },
			endpoints: { aiChat: { api: { basePath: "/api/assistant" } } },
		});

		await stack.router.getRoute("/chat")?.loader?.();

		expect(fetchMock).toHaveBeenCalledOnce();
		const request = observedRequest(fetchMock.mock.calls[0] ?? []);
		expect(request.url).toContain(
			"https://app.example.com/api/assistant/chat/conversations",
		);
		expect(request.headers.get("cookie")).toBe("session=server");
		expect(request.headers.get("authorization")).toBe("Bearer server");
		const query = createAiChatQueryKeys(
			createApiClient<AiChatApiRouter>({
				baseURL: appApi.baseURL,
				basePath: "/api/assistant",
			}),
		).conversations.list("anonymous");
		expect(queryClient.getQueryData(query.queryKey)).toEqual([]);
		expect(stack.provider.queryClient).toBe(queryClient);
		expect(stack.provider.plugins.aiChat.api).not.toHaveProperty("headers");
	});

	it("isolates sensitive server headers across an explicit API origin", async () => {
		const fetchMock = vi
			.spyOn(globalThis, "fetch")
			.mockResolvedValue(response([]));
		const stack = createClientStack({
			api: {
				...appApi,
				headers: {
					cookie: "session=server",
					authorization: "Bearer server",
				},
			},
			site: appSite,
			queryClient: new QueryClient({
				defaultOptions: { queries: { retry: false } },
			}),
			plugins: { aiChat: aiChatClientPlugin() },
			endpoints: {
				aiChat: {
					api: {
						baseURL: "https://chat.example.com",
						basePath: "/btst",
						browserHeaders: { "x-public-client": "ai-chat" },
						credentials: "omit",
					},
				},
			},
		});

		await stack.router.getRoute("/chat")?.loader?.();

		const request = observedRequest(fetchMock.mock.calls[0] ?? []);
		expect(request.url).toContain(
			"https://chat.example.com/btst/chat/conversations",
		);
		expect(request.headers.get("x-public-client")).toBe("ai-chat");
		expect(request.headers.get("cookie")).toBeNull();
		expect(request.headers.get("authorization")).toBeNull();
		expect(stack.provider.plugins.aiChat.api.credentials).toBe("omit");
		expect(stack.provider.plugins.aiChat.api).not.toHaveProperty("headers");
	});

	it("reports a failed loader once with the canonical context and safe cache error", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			response({ message: "private backend detail" }, 500),
		);
		const queryClient = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});
		const onErrorLoad = vi.fn();
		const stack = createClientStack({
			api: {
				...appApi,
				headers: { cookie: "session=server" },
			},
			site: appSite,
			queryClient,
			plugins: {
				aiChat: aiChatClientPlugin({ hooks: { onErrorLoad } }),
			},
		});

		await stack.router.getRoute("/chat")?.loader?.();

		expect(onErrorLoad).toHaveBeenCalledOnce();
		expect(onErrorLoad).toHaveBeenCalledWith(
			expect.any(Error),
			expect.objectContaining({
				path: "/chat",
				isSSR: true,
				apiBaseURL: appApi.baseURL,
				apiBasePath: appApi.basePath,
			}),
		);
		const query = createAiChatQueryKeys(
			createApiClient<AiChatApiRouter>(appApi),
		).conversations.list("anonymous");
		expect(queryClient.getQueryState(query.queryKey)?.error).toMatchObject({
			message: SSR_LOADER_ERROR_MESSAGE,
		});
	});

	it("contains list source and error-hook failures without rejecting the loader", async () => {
		const sourceError = new Error("list source failed");
		const onErrorLoad = vi.fn(async () => {
			throw new Error("list reporter failed");
		});
		const stack = createClientStack({
			api: appApi,
			site: appSite,
			queryClient: new QueryClient({
				defaultOptions: { queries: { retry: false } },
			}),
			plugins: {
				aiChat: aiChatClientPlugin({
					hooks: {
						beforeLoadConversations: () => {
							throw sourceError;
						},
						onErrorLoad,
					},
				}),
			},
		});

		await expect(
			stack.router.getRoute("/chat")?.loader?.(),
		).resolves.toBeUndefined();
		expect(onErrorLoad).toHaveBeenCalledOnce();
		expect(onErrorLoad).toHaveBeenCalledWith(
			sourceError,
			expect.objectContaining({ path: "/chat", isSSR: true }),
		);
	});

	it("contains detail source and error-hook failures without rejecting the loader", async () => {
		const sourceError = new Error("detail source failed");
		const onErrorLoad = vi.fn(async () => {
			throw new Error("detail reporter failed");
		});
		const stack = createClientStack({
			api: appApi,
			site: appSite,
			queryClient: new QueryClient({
				defaultOptions: { queries: { retry: false } },
			}),
			plugins: {
				aiChat: aiChatClientPlugin({
					hooks: {
						beforeLoadConversation: () => {
							throw sourceError;
						},
						onErrorLoad,
					},
				}),
			},
		});

		await expect(
			stack.router.getRoute("/chat/conv-1")?.loader?.(),
		).resolves.toBeUndefined();
		expect(onErrorLoad).toHaveBeenCalledOnce();
		expect(onErrorLoad).toHaveBeenCalledWith(
			sourceError,
			expect.objectContaining({
				path: "/chat/conv-1",
				params: { id: "conv-1" },
				isSSR: true,
			}),
		);
	});

	it("sanitizes each backend failure when a detail loader also has a connection failure", async () => {
		vi.spyOn(console, "warn").mockImplementation(() => undefined);
		vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
			const url =
				typeof input === "string"
					? input
					: input instanceof URL
						? input.href
						: input.url;
			if (url.endsWith("/chat/conversations/conv-1")) {
				throw new Error("fetch failed");
			}
			return response({ message: "private list failure" }, 500);
		});
		const queryClient = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});
		const onErrorLoad = vi.fn();
		const stack = createClientStack({
			api: appApi,
			site: appSite,
			queryClient,
			plugins: {
				aiChat: aiChatClientPlugin({ hooks: { onErrorLoad } }),
			},
		});

		await stack.router.getRoute("/chat/conv-1")?.loader?.();

		const queries = createAiChatQueryKeys(
			createApiClient<AiChatApiRouter>(appApi),
		);
		expect(
			queryClient.getQueryState(
				queries.conversations.detail("conv-1", "anonymous").queryKey,
			)?.error,
		).toMatchObject({ message: "fetch failed" });
		expect(
			queryClient.getQueryState(
				queries.conversations.list("anonymous").queryKey,
			)?.error,
		).toMatchObject({ message: SSR_LOADER_ERROR_MESSAGE });
		expect(onErrorLoad).toHaveBeenCalledOnce();
	});
});
