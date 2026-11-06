// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useListState } from "../client/hooks/use-list-state";
import { StackProvider } from "../context";
import { nextRouter } from "../next/router";
import { createEmptyTestClientStack } from "./client-stack-test-utils";

const navigation = vi.hoisted(() => ({
	push: vi.fn((path: string) => {
		setTimeout(() => window.history.pushState(null, "", path), 0);
	}),
	replace: vi.fn((path: string) => {
		setTimeout(() => window.history.replaceState(null, "", path), 0);
	}),
	refresh: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => navigation }));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("next/link", () => ({ default: () => null }));

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const schema = {
	search: { type: "string", default: "" },
	offset: { type: "number", default: 0 },
} as const;

describe("Next.js list-state binding", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		vi.useFakeTimers();
		window.history.replaceState(
			null,
			"",
			"/pages/helpdesk?search=public&offset=25",
		);
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(async () => {
		await act(async () => root.unmount());
		container.remove();
		vi.useRealTimers();
		vi.clearAllMocks();
	});

	it.each([false, true])(
		"updates list state after loading a filtered URL (replace: %s)",
		async (replace) => {
			function Probe() {
				const [state, setState] = useListState("helpdesk", schema);
				return (
					<button
						onClick={() =>
							setState({ search: "private", offset: 0 }, { replace })
						}
					>
						{state.search}:{state.offset}
					</button>
				);
			}
			await act(async () => {
				root.render(
					<StackProvider
						stack={createEmptyTestClientStack()}
						router={nextRouter()}
					>
						<Probe />
					</StackProvider>,
				);
			});
			expect(container.textContent).toBe("public:25");
			const previousLength = window.history.length;
			await act(async () => container.querySelector("button")!.click());
			vi.runAllTimers();
			expect(window.location.pathname).toBe("/pages/helpdesk");
			expect(window.location.search).toBe("?search=private");
			expect(container.textContent).toBe("private:0");
			expect(window.history.length).toBe(previousLength + (replace ? 0 : 1));
		},
	);
});
