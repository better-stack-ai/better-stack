// @vitest-environment jsdom
import { act } from "react";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { SearchPage } from "../client/components/pages/search-page.internal";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const setState = vi.hoisted(() => vi.fn());
vi.mock("@btst/stack/context", () => ({
	usePluginOverrides: () => ({}),
	useStack: () => ({ router: {} }),
}));
vi.mock("../client/hooks", () => ({
	useSearchState: () => ({
		state: { q: "Unified", sources: "", page: 1 },
		setState,
		loading: false,
		result: {
			error: null,
			refetch: vi.fn(),
			data: {
				items: [],
				sources: [{ id: "blog", label: "Blog" }],
				page: 1,
				limit: 20,
				hasMore: false,
				truncated: false,
			},
		},
	}),
}));

it("prevents lost query and source input before the server-rendered search controls hydrate", async () => {
	const host = document.createElement("div");
	host.innerHTML = renderToString(<SearchPage />);
	document.body.append(host);
	const input = host.querySelector("input")!;
	const select = host.querySelector("select")!;
	expect(input.matches(":disabled")).toBe(true);
	expect(select.matches(":disabled")).toBe(true);
	let root: ReturnType<typeof hydrateRoot> | undefined;
	try {
		await act(async () => {
			root = hydrateRoot(host, <SearchPage />);
		});
		expect(input.matches(":disabled")).toBe(false);
		expect(select.matches(":disabled")).toBe(false);
		await act(async () => {
			select.value = "blog";
			select.dispatchEvent(new Event("change", { bubbles: true }));
		});
		expect(setState).toHaveBeenCalledWith({ sources: "blog", page: 1 });
	} finally {
		await act(async () => root?.unmount());
		host.remove();
	}
});
