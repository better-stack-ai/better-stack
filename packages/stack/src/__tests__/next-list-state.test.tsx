// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { StackProvider, useStack } from "../context";
import { useListState } from "../client/hooks/use-list-state";
import { nextRouter } from "../next/router";
import { createEmptyTestClientStack } from "./client-stack-test-utils";
import { QueryClient } from "@tanstack/react-query";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const navigation = vi.hoisted(() => ({
	push: vi.fn(),
	replace: vi.fn(),
	refresh: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => navigation }));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("next/link", () => ({ default: () => null }));

afterEach(() => vi.restoreAllMocks());

it("keeps controlled list fields in sync with Next query history while retaining router navigation", async () => {
	window.history.replaceState(null, "", "/pages/search?q=Unified");
	const pendingNavigations: Array<() => void> = [];
	navigation.push.mockImplementation((href: string) =>
		pendingNavigations.push(() => window.history.pushState(null, "", href)),
	);
	navigation.replace.mockImplementation((href: string) =>
		pendingNavigations.push(() => window.history.replaceState(null, "", href)),
	);
	const pushHistory = vi.spyOn(window.history, "pushState");
	const replaceHistory = vi.spyOn(window.history, "replaceState");
	const queryClient = new QueryClient();
	const preset = nextRouter();
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	function Probe() {
		const { router } = useStack();
		const [state, setState] = useListState("search", {
			q: { type: "string", default: "", history: "replace" },
			sources: { type: "string", default: "" },
		});
		return (
			<>
				<select
					aria-label="Source"
					value={state.sources}
					onChange={(event) => setState({ sources: event.target.value })}
				>
					<option value="">All sources</option>
					<option value="blog">Blog</option>
				</select>
				<input
					aria-label="Search"
					value={state.q}
					onChange={(event) => setState({ q: event.target.value })}
				/>
				<button
					type="button"
					onClick={() => void router?.navigate?.("/pages/blog")}
				>
					Blog
				</button>
				<button type="button" onClick={() => void router?.refresh?.()}>
					Refresh
				</button>
			</>
		);
	}
	try {
		await act(async () =>
			root.render(
				<StackProvider
					stack={createEmptyTestClientStack(queryClient)}
					router={preset}
				>
					<Probe />
				</StackProvider>,
			),
		);
		const select = host.querySelector("select")!;
		await act(async () => {
			select.value = "blog";
			select.dispatchEvent(new Event("change", { bubbles: true }));
		});
		await act(async () => {
			for (const commit of pendingNavigations.splice(0)) commit();
		});
		expect(window.location.search).toBe("?q=Unified&sources=blog");
		expect(select.value).toBe("blog");
		expect(pushHistory).toHaveBeenCalledOnce();
		const input = host.querySelector("input")!;
		await act(async () => {
			Object.getOwnPropertyDescriptor(
				HTMLInputElement.prototype,
				"value",
			)!.set!.call(input, "Updated");
			input.dispatchEvent(new Event("input", { bubbles: true }));
		});
		await act(async () => {
			for (const commit of pendingNavigations.splice(0)) commit();
		});
		expect(window.location.search).toBe("?q=Updated&sources=blog");
		expect(input.value).toBe("Updated");
		expect(replaceHistory).toHaveBeenCalledOnce();
		const buttons = host.querySelectorAll("button");
		await act(async () => buttons[0]!.click());
		expect(navigation.push).toHaveBeenCalledWith("/pages/blog");
		await act(async () => buttons[1]!.click());
		expect(navigation.refresh).toHaveBeenCalledOnce();
	} finally {
		await act(async () => root.unmount());
		host.remove();
		queryClient.clear();
	}
});
