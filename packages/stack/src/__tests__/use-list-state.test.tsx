// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useListState } from "../client/hooks/use-list-state";
import { StackProvider } from "../context";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const schema = {
	tab: { type: "string" as const, default: "pending" },
	page: { type: "number" as const, default: 1 },
	filter: { type: "string" as const, default: "", history: "replace" as const },
};

function createMockRouter() {
	let params = new URLSearchParams();
	const setSearchParams = vi.fn(
		(next: URLSearchParams, opts?: { replace?: boolean }) => {
			params = new URLSearchParams(next.toString());
			void opts;
		},
	);
	return {
		getSearchParams: () => new URLSearchParams(params.toString()),
		setSearchParams,
	};
}

describe("useListState", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(async () => {
		await act(async () => {
			root.unmount();
		});
		container.remove();
		vi.restoreAllMocks();
	});

	async function renderHook(onCapture: (value: unknown) => void) {
		const router = createMockRouter();
		function Probe() {
			const [state, setState] = useListState("comments-moderation", schema);
			onCapture({ state, setState });
			return null;
		}
		await act(async () => {
			root.render(
				<StackProvider basePath="/pages" router={router}>
					<Probe />
				</StackProvider>,
			);
		});
		return router;
	}

	it("round-trips state through the router search params", async () => {
		let captured: any;
		const router = await renderHook((value) => {
			captured = value;
		});

		expect(captured.state).toEqual({ tab: "pending", page: 1, filter: "" });
		expect(router.setSearchParams).not.toHaveBeenCalled();

		await act(async () => {
			captured.setState({ tab: "spam", page: 3 });
		});

		expect(captured.state).toEqual({ tab: "spam", page: 3, filter: "" });
		expect(router.setSearchParams).toHaveBeenCalledTimes(1);
		const call = router.setSearchParams.mock.calls[0];
		expect(call).toBeDefined();
		const [nextParams] = call!;
		expect(nextParams.toString()).toBe("tab=spam&page=3");
	});

	it("uses replace history for rapid filter changes", async () => {
		let captured: any;
		const router = await renderHook((value) => {
			captured = value;
		});

		await act(async () => {
			captured.setState({ filter: "abc" });
		});

		expect(router.setSearchParams).toHaveBeenCalledWith(
			expect.any(URLSearchParams),
			{ replace: true },
		);
	});

	it("uses push history for discrete tab changes", async () => {
		let captured: any;
		const router = await renderHook((value) => {
			captured = value;
		});

		await act(async () => {
			captured.setState({ tab: "spam" });
		});

		expect(router.setSearchParams).toHaveBeenCalledWith(
			expect.any(URLSearchParams),
			{ replace: false },
		);
	});

	it("preserves prior URL fields when batched in one event", async () => {
		let captured: any;
		const router = await renderHook((value) => {
			captured = value;
		});

		await act(async () => {
			captured.setState({ tab: "spam" });
			captured.setState({ page: 3 });
		});

		const lastCall =
			router.setSearchParams.mock.calls[
				router.setSearchParams.mock.calls.length - 1
			];
		expect(lastCall).toBeDefined();
		const [nextParams] = lastCall!;
		expect(nextParams.toString()).toBe("tab=spam&page=3");
	});
});
