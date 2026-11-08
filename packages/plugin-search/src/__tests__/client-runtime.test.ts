import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createClientStack } from "@btst/stack/client";
import { StackProvider } from "@btst/stack/context";
import { createApiClient } from "@btst/stack/plugins/client";
import { createElement, type ReactElement } from "react";
import { renderToPipeableStream } from "react-dom/server";
import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import { searchClientPlugin } from "../client/plugin";
import { createSearchQueryKeys } from "../query-keys";
import type { SearchResponse } from "../types";

function renderServerMarkup(element: ReactElement): Promise<string> {
	return new Promise((resolve, reject) => {
		const output = new PassThrough();
		const chunks: Buffer[] = [];
		output.on("data", (chunk: Buffer) => chunks.push(chunk));
		output.on("end", () => resolve(Buffer.concat(chunks).toString()));
		output.on("error", reject);
		const stream = renderToPipeableStream(element, {
			onAllReady: () => stream.pipe(output),
			onShellError: reject,
			onError: reject,
		});
	});
}

const identity = { id: "reader-one" };
const api = {
	baseURL: "https://app.test",
	basePath: "/api/data",
	headers: { cookie: "session=reader-one" },
};
const response: SearchResponse = {
	items: [
		{
			key: "blog:one",
			sourceId: "blog",
			resourceId: "one",
			sourceLabel: "Blog",
			title: "Public search post",
			snippet: "Searchable public content",
			href: "/pages/blog/one",
		},
	],
	sources: [{ id: "blog", label: "Blog" }],
	page: 2,
	limit: 20,
	hasMore: false,
	nextPage: null,
	truncated: false,
};

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe("Search SSR and query resources", () => {
	it.each(["provider router", "explicit request snapshot"])(
		"renders visible SSR results from %s query state",
		async (source) => {
			vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json(response));
			const queryClient = new QueryClient();
			const searchParams = "q=search&sources=blog&page=2";
			const createStack = (withSnapshot: boolean) =>
				createClientStack({
					api,
					site: { baseURL: "https://app.test", basePath: "/pages" },
					queryClient,
					plugins: {
						search: searchClientPlugin(
							withSnapshot ? { searchParams } : undefined,
						),
					},
				});
			const requestStack = createStack(true);
			await requestStack.router.getRoute("/search")?.loader?.();
			const providerStack = createStack(source === "explicit request snapshot");
			const Page = providerStack.router.getRoute("/search")!.PageComponent!;
			try {
				const html = await renderServerMarkup(
					createElement(
						QueryClientProvider,
						{ client: queryClient },
						createElement(
							StackProvider,
							{
								stack: providerStack,
								router: {
									getSearchParams: () =>
										new URLSearchParams(
											source === "provider router" ? searchParams : "",
										),
								},
							},
							createElement(Page),
						),
					),
				);
				expect(html).toContain('value="search"');
				expect(html).toContain(
					'<option value="blog" selected="">Blog</option>',
				);
				expect(html).toMatch(/<a\b[^>]*href="\/pages\/blog\/one"/);
				expect(html).toMatch(
					/>Public <mark\b[^>]*>search<\/mark> post<\/span>/,
				);
				expect(html).toMatch(/Page (?:<!-- -->)?2/);
			} finally {
				queryClient.clear();
			}
		},
	);

	it("prefetches URL state with request credentials and the same identity-partitioned query used by the UI", async () => {
		const requests: Request[] = [];
		vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
			requests.push(
				input instanceof Request ? input : new Request(input, init),
			);
			return Response.json(response);
		});
		const beforeLoad = vi.fn();
		const afterLoad = vi.fn();
		const queryClient = new QueryClient();
		const stack = createClientStack({
			api,
			site: { baseURL: "https://app.test", basePath: "/pages" },
			queryClient,
			plugins: {
				search: searchClientPlugin({
					searchParams: "q=search&sources=blog&page=2",
					identityPartition: identity,
					hooks: { beforeLoad, afterLoad },
				}),
			},
		});
		const route = stack.router.getRoute("/search");
		expect(route?.PageComponent).toBeDefined();
		await route?.loader?.();
		const queries = createSearchQueryKeys(createApiClient(api));
		const entry = queries.searchResults.list(
			{ q: "search", sources: ["blog"], page: 2 },
			identity,
		);
		expect(queryClient.getQueryData(entry.queryKey)).toEqual(response);
		expect(
			queryClient.getQueryData(
				queries.searchResults.list(
					{ q: "search", sources: ["blog"], page: 2 },
					{ id: "other" },
				).queryKey,
			),
		).toBeUndefined();
		expect(requests).toHaveLength(1);
		const request = requests[0]!;
		expect(request.headers.get("cookie")).toBe("session=reader-one");
		expect(new URL(request.url).searchParams.get("q")).toBe("search");
		expect(new URL(request.url).searchParams.get("sources")).toBe("blog");
		expect(new URL(request.url).searchParams.get("page")).toBe("2");
		expect(request.url).not.toContain("reader-one");
		expect(beforeLoad).toHaveBeenCalledOnce();
		expect(afterLoad).toHaveBeenCalledOnce();
		queryClient.clear();
	});

	it.each([
		null,
		{},
		{ ...response, items: null },
		{ ...response, sources: null },
		{ ...response, sources: [{ id: "blog" }] },
		{ ...response, items: [{ ...response.items[0], title: null }] },
		{
			...response,
			items: [{ ...response.items[0], href: "javascript:alert(1)" }],
		},
		{ ...response, hasMore: "yes" },
		{ ...response, nextPage: "2" },
		{ ...response, page: 0 },
	])(
		"rejects malformed successful response %j before it enters the Search cache",
		async (body) => {
			vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json(body));
			const queryClient = new QueryClient();
			const queries = createSearchQueryKeys(createApiClient(api));
			const entry = queries.searchResults.list({ q: "search" });
			try {
				await expect(
					queryClient.fetchQuery({ ...entry, retry: false }),
				).rejects.toThrow();
				expect(queryClient.getQueryData(entry.queryKey)).toBeUndefined();
			} finally {
				queryClient.clear();
			}
		},
	);

	it("normalizes source ordering and query whitespace without sharing identities or pagination", () => {
		const queries = createSearchQueryKeys(vi.fn());
		const key = queries.searchResults.list(
			{ q: " search ", sources: ["school", "blog"] },
			identity,
		).queryKey;
		expect(
			queries.searchResults.list(
				{ q: "search", sources: ["blog", "school"], page: 1, limit: 20 },
				identity,
			).queryKey,
		).toEqual(key);
		expect(
			queries.searchResults.list(
				{ q: "search", sources: ["blog", "school"], page: 2 },
				identity,
			).queryKey,
		).not.toEqual(key);
	});

	it("sanitizes API and lifecycle failures, contains reporter errors, and skips browser prefetch", async () => {
		const fetch = vi
			.spyOn(globalThis, "fetch")
			.mockResolvedValue(
				Response.json({ message: "private provider detail" }, { status: 502 }),
			);
		const onErrorLoad = vi.fn(() => {
			throw new Error("Reporter failed");
		});
		const queryClient = new QueryClient();
		const stack = createClientStack({
			api,
			site: { baseURL: "https://app.test", basePath: "/pages" },
			queryClient,
			plugins: {
				search: searchClientPlugin({
					searchParams: "q=search",
					hooks: { onErrorLoad },
				}),
			},
		});
		await expect(
			stack.router.getRoute("/search")?.loader?.(),
		).resolves.toBeUndefined();
		const state = queryClient.getQueryCache().getAll()[0]?.state;
		expect(state?.status).toBe("error");
		expect((state?.error as Error).message).toBe("Failed to load data.");
		expect(onErrorLoad).toHaveBeenCalledOnce();
		vi.stubGlobal("window", {});
		await stack.router.getRoute("/search")?.loader?.();
		expect(fetch).toHaveBeenCalledOnce();
		queryClient.clear();
	});
});
