// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StackProvider, type StackIdentity } from "@btst/stack/context";
import { createClientStack } from "@btst/stack/client";
import { afterEach, expect, it, vi } from "vitest";
import { searchClientPlugin } from "../client/plugin";
import { useSearch } from "../client/hooks";
import { createSearchQueryKeys } from "../query-keys";
import type { SearchResponse } from "../types";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const auth = vi.hoisted(() => ({
	identity: { id: "reader-one" } as StackIdentity | null,
	isPending: false,
	error: undefined as Error | undefined,
	generation: 1,
}));
vi.mock("@btst/stack/context", async (original) => ({
	...(await original<typeof import("@btst/stack/context")>()),
	useIdentity: () => auth,
	useIdentitySourceGeneration: () => auth.generation,
}));

const data = (title: string): SearchResponse => ({
	items: [
		{
			key: "app:record",
			sourceId: "app",
			resourceId: "record",
			sourceLabel: "Application",
			title,
			snippet: "",
			href: "/record",
		},
	],
	sources: [{ id: "app", label: "Application" }],
	page: 1,
	limit: 20,
	hasMore: false,
	nextPage: null,
	truncated: false,
});

afterEach(() => vi.restoreAllMocks());

it("hydrates the matching identity, discards stale searches on identity changes, and blocks unresolved/error identities", async () => {
	auth.identity = { id: "reader-one" };
	auth.generation = 1;
	auth.isPending = false;
	auth.error = undefined;
	let title = "Reader two search";
	const fetch = vi
		.spyOn(globalThis, "fetch")
		.mockImplementation(async () => Response.json(data(title)));
	const queryClient = new QueryClient();
	const queries = createSearchQueryKeys(vi.fn());
	const initialKey = queries.searchResults.list(
		{ q: "search" },
		auth.identity,
	).queryKey;
	queryClient.setQueryData(initialKey, data("Reader one search"));
	const stack = createClientStack({
		api: { baseURL: "https://app.test", basePath: "/api/data" },
		site: { baseURL: "https://app.test", basePath: "/pages" },
		queryClient,
		plugins: { search: searchClientPlugin() },
	});
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	function Probe() {
		const result = useSearch({ q: "search" });
		return (
			<p>
				{result.error
					? "Identity failed"
					: result.isLoading
						? "Loading"
						: result.data?.items[0]?.title}
			</p>
		);
	}
	const render = () =>
		root.render(
			<StackProvider stack={stack}>
				<QueryClientProvider client={queryClient}>
					<Probe />
				</QueryClientProvider>
			</StackProvider>,
		);
	try {
		await act(async () => render());
		expect(host.textContent).toBe("Reader one search");
		expect(fetch).not.toHaveBeenCalled();
		auth.identity = null;
		auth.isPending = true;
		auth.generation = 2;
		await act(async () => render());
		expect(host.textContent).toBe("Loading");
		expect(queryClient.getQueryData(initialKey)).toBeUndefined();
		expect(fetch).not.toHaveBeenCalled();
		auth.identity = { id: "reader-two" };
		auth.isPending = false;
		await act(async () => {
			render();
			await new Promise((resolve) => setTimeout(resolve, 20));
		});
		await act(async () => {
			await vi.waitFor(() =>
				expect(host.textContent).toBe("Reader two search"),
			);
		});
		expect(fetch).toHaveBeenCalledOnce();
		title = "Same identity, new authorization source";
		auth.generation = 3;
		await act(async () => render());
		expect(host.textContent).not.toBe("Reader two search");
		await act(async () => {
			await vi.waitFor(() => expect(host.textContent).toBe(title));
		});
		expect(fetch).toHaveBeenCalledTimes(2);
		auth.identity = null;
		auth.error = new Error("Identity unavailable");
		auth.generation = 4;
		await act(async () => render());
		expect(host.textContent).toBe("Identity failed");
		expect(
			queryClient
				.getQueryCache()
				.findAll({ queryKey: ["searchResults"] })
				.every((query) => !query.state.data),
		).toBe(true);
		expect(fetch).toHaveBeenCalledTimes(2);
	} finally {
		await act(async () => root.unmount());
		host.remove();
		queryClient.clear();
	}
});
