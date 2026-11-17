// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createClientStack } from "@btst/stack/client";
import { StackProvider } from "@btst/stack/context";
import { afterEach, expect, it, vi } from "vitest";
import { SearchInput } from "../client/components";
import { useSearchState } from "../client/hooks/use-search-state";
import { searchClientPlugin } from "../client/plugin";
import type { SearchListState } from "../client/search-state";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const search = vi.hoisted(() => vi.fn());
vi.mock("../client/hooks/use-search", () => ({
	useSearch: search,
}));

function setup() {
	vi.useFakeTimers();
	vi.stubGlobal(
		"ResizeObserver",
		class {
			observe() {}
			unobserve() {}
			disconnect() {}
		},
	);
	Element.prototype.scrollIntoView = vi.fn();
	search.mockReturnValue({
		isLoading: false,
		isFetching: false,
		error: null,
		refetch: vi.fn(),
		data: {
			items: [
				{
					key: "blog:one",
					title: "Guide one",
					sourceLabel: "Blog",
					href: "/guide-one",
				},
			],
			sources: [
				{ id: "blog", label: "Blog" },
				{ id: "docs", label: "Docs" },
			],
			hasMore: true,
			truncated: false,
		},
	});
	const queryClient = new QueryClient();
	const stack = createClientStack({
		api: { baseURL: "https://app.test", basePath: "/api/data" },
		site: { baseURL: "https://app.test", basePath: "/pages" },
		queryClient,
		plugins: { search: searchClientPlugin() },
	});
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	let params = new URLSearchParams("q=host&sources=private&page=4&tab=keep");
	const navigate = vi.fn();
	const writeURL = vi.fn((next: URLSearchParams) => {
		params = next;
	});
	const router = {
		navigate,
		getSearchParams: () => params,
		setSearchParams: writeURL,
	};
	return {
		navigate,
		writeURL,
		params: () => params,
		render: async (children: React.ReactNode, urlBound = true) =>
			act(async () => {
				root.render(
					<QueryClientProvider client={queryClient}>
						<StackProvider
							stack={stack}
							router={urlBound ? router : { navigate }}
							initialIdentity={null}
						>
							{children}
						</StackProvider>
					</QueryClientProvider>,
				);
			}),
		cleanup: async () => {
			await act(async () => root.unmount());
			host.remove();
			queryClient.clear();
		},
	};
}

async function click(element: Element | null) {
	expect(element).not.toBeNull();
	await act(async () => (element as HTMLElement).click());
}

async function type(value: string) {
	const input = document.querySelector<HTMLInputElement>(
		'[data-testid="search-input"]',
	)!;
	await act(async () => {
		Object.getOwnPropertyDescriptor(
			HTMLInputElement.prototype,
			"value",
		)!.set!.call(input, value);
		input.dispatchEvent(new Event("input", { bubbles: true }));
	});
	await act(async () => vi.advanceTimersByTime(301));
}

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
	vi.clearAllMocks();
});

it("retains parent-owned query, source and page across result navigation and remount, without changing host URL state", async () => {
	const app = setup();
	let retained: SearchListState;
	let remount: () => void;
	function Host() {
		const [state, setState] = useState<SearchListState>({
			q: "guide",
			sources: "",
			page: 2,
		});
		const [key, setKey] = useState(0);
		retained = state;
		remount = () => setKey((value) => value + 1);
		return (
			<SearchInput
				key={key}
				searchState={state}
				onSearchStateChange={setState}
			/>
		);
	}
	try {
		await app.render(<Host />);
		await click(document.querySelector('[data-testid="search-button"]'));
		expect(
			document.querySelector<HTMLInputElement>('[data-testid="search-input"]')!
				.value,
		).toBe("guide");
		const select = document.querySelector("select")!;
		await act(async () => {
			select.value = "docs";
			select.dispatchEvent(new Event("change", { bubbles: true }));
		});
		expect(retained!).toEqual({ q: "guide", sources: "docs", page: 1 });
		await type("second guide");
		expect(retained!).toEqual({ q: "second guide", sources: "docs", page: 1 });
		await click(
			[...document.querySelectorAll("button")].find(
				(button) => button.textContent === "Next page",
			)!,
		);
		expect(retained!.page).toBe(2);
		await click(document.querySelector('[data-testid="search-result"]'));
		expect(app.navigate).toHaveBeenCalledExactlyOnceWith("/guide-one");
		await act(async () => remount!());
		expect(document.querySelector('[data-testid="search-modal"]')).toBeNull();
		await click(document.querySelector('[data-testid="search-button"]'));
		expect(
			document.querySelector<HTMLInputElement>('[data-testid="search-input"]')!
				.value,
		).toBe("second guide");
		expect(document.querySelector("select")!.value).toBe("docs");
		expect(
			document.querySelector('nav[aria-label="Search pagination"]')!
				.textContent,
		).toContain("Page 2");
		await type("");
		expect(retained!).toEqual({ q: "", sources: "docs", page: 1 });
		expect(app.writeURL).not.toHaveBeenCalled();
		expect(app.params().toString()).toBe(
			"q=host&sources=private&page=4&tab=keep",
		);
	} finally {
		await app.cleanup();
	}
});

it("keeps fixed source restrictions and an empty fixed scope with controlled state", async () => {
	const app = setup();
	let latest: ReturnType<typeof useSearchState>;
	function Probe({ sources }: { sources: string[] }) {
		latest = useSearchState({
			sources,
			searchState: { q: "guide", sources: "private", page: 2 },
		});
		return null;
	}
	try {
		await app.render(<Probe sources={["blog"]} />);
		expect(search).toHaveBeenLastCalledWith(
			{ q: "guide", sources: ["blog"], page: 2, limit: 20 },
			true,
		);
		await app.render(<Probe sources={[]} />);
		expect(search).toHaveBeenLastCalledWith(
			{ q: "guide", sources: [], page: 2, limit: 20 },
			false,
		);
		expect(latest!.result.data).toBeUndefined();
		await act(async () => latest!.setState({ q: "ignored" }));
		expect(latest!.state.q).toBe("guide");
		expect(app.writeURL).not.toHaveBeenCalled();
	} finally {
		await app.cleanup();
	}
});

it("keeps existing URL-backed updates and uncontrolled local defaults", async () => {
	const app = setup();
	let latest: ReturnType<typeof useSearchState>;
	function Probe() {
		latest = useSearchState();
		return null;
	}
	try {
		await app.render(<Probe />);
		expect(latest!.state).toEqual({ q: "host", sources: "private", page: 4 });
		await act(async () =>
			latest!.setState({ q: "new", page: 1 }, { replace: true }),
		);
		expect(app.writeURL).toHaveBeenCalledTimes(1);
		expect(app.params().get("q")).toBe("new");
		expect(app.params().get("tab")).toBe("keep");
		await app.render(<Probe key="local" />, false);
		expect(latest!.state).toEqual({ q: "", sources: "", page: 1 });
		await act(async () =>
			latest!.setState({ q: "local", sources: "blog", page: 2 }),
		);
		expect(latest!.state).toEqual({ q: "local", sources: "blog", page: 2 });
		expect(app.writeURL).toHaveBeenCalledTimes(1);
	} finally {
		await app.cleanup();
	}
});
