// @vitest-environment jsdom
import { act, lazy } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { ComposedRoute } from "../client/components/compose";
import { StackProvider } from "../context";
import { defineClientPlugin } from "../plugins/client";
import { createTestClientStack } from "./client-stack-test-utils";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

it("observes committed pages and navigation without repeating on rerenders", async () => {
	const onRouteRender = vi.fn();
	const stack = createTestClientStack({
		observer: defineClientPlugin({
			id: "observer",
			resolve: () => ({ routes: () => ({}), hooks: { onRouteRender } }),
		}),
	});
	const root = createRoot(document.createElement("div"));
	const Page = () => <div>Page</div>;
	const render = (path: string) => (
		<StackProvider stack={stack}>
			<ComposedRoute
				path={path}
				PageComponent={Page}
				LoadingComponent={() => null}
				onError={() => {}}
			/>
		</StackProvider>
	);
	try {
		await act(async () => root.render(render("/first")));
		await act(async () => root.render(render("/first")));
		await act(async () => root.render(render("/second")));
		expect(onRouteRender.mock.calls).toEqual([
			[{ path: "/first" }],
			[{ path: "/second" }],
		]);
	} finally {
		await act(async () => root.unmount());
		stack.provider.queryClient.clear();
	}
});

it("does not observe a page that is still suspended", async () => {
	const onRouteRender = vi.fn();
	const stack = createTestClientStack({
		observer: defineClientPlugin({
			id: "observer",
			resolve: () => ({ routes: () => ({}), hooks: { onRouteRender } }),
		}),
	});
	const container = document.createElement("div");
	const root = createRoot(container);
	const Page = lazy(() => new Promise<{ default: () => null }>(() => {}));
	try {
		await act(async () => {
			root.render(
				<StackProvider stack={stack}>
					<ComposedRoute
						path="/pending"
						PageComponent={Page}
						LoadingComponent={() => <div>Loading</div>}
						onError={() => {}}
					/>
				</StackProvider>,
			);
		});
		expect(container.textContent).toBe("Loading");
		expect(onRouteRender).not.toHaveBeenCalled();
	} finally {
		await act(async () => root.unmount());
		stack.provider.queryClient.clear();
	}
});

it("keeps a failing observer from interrupting other observers or the page", async () => {
	const onRouteRender = vi.fn();
	const observer = (id: string, callback: () => void | Promise<void>) =>
		defineClientPlugin({
			id,
			resolve: () => ({
				routes: () => ({}),
				hooks: { onRouteRender: callback },
			}),
		});
	const stack = createTestClientStack({
		throwing: observer("throwing", () => {
			throw new Error("observer failed");
		}),
		rejecting: observer("rejecting", () =>
			Promise.reject(new Error("offline")),
		),
		working: observer("working", onRouteRender),
	});
	const container = document.createElement("div");
	const root = createRoot(container);
	try {
		await act(async () => {
			root.render(
				<StackProvider stack={stack}>
					<ComposedRoute
						path="/working"
						PageComponent={() => <div>Page</div>}
						LoadingComponent={() => null}
						onError={() => {}}
					/>
				</StackProvider>,
			);
		});
		expect(container.textContent).toBe("Page");
		expect(onRouteRender).toHaveBeenCalledWith({ path: "/working" });
	} finally {
		await act(async () => root.unmount());
		stack.provider.queryClient.clear();
	}
});
