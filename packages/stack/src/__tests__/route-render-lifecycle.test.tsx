// @vitest-environment jsdom
import { act, lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { defineRoute, defineRoutes } from "@btst/yar";
import { QueryClientProvider } from "@tanstack/react-query";
import { ComposedRoute, RouteRenderer } from "../client/components/compose";
import { RouteLifecycle } from "../client/components/route-lifecycle";
import { StackProvider } from "../context";
import { createNextPage } from "../next/page";
import { defineClientPlugin } from "../plugins/client";
import { createTestClientStack } from "./client-stack-test-utils";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

function observerStack(onRouteRender: (context: { path: string }) => void) {
	return createTestClientStack({
		observer: defineClientPlugin({
			id: "observer",
			resolve: () => ({
				routes: () =>
					defineRoutes({
						first: defineRoute("/first", { page: () => <div>First page</div> }),
						second: defineRoute("/second", {
							page: () => <div>Second page</div>,
						}),
					}),
				hooks: { onRouteRender },
			}),
		}),
	});
}

it("observes plain RouteRenderer pages and navigation once, including StrictMode and rerenders", async () => {
	const onRouteRender = vi.fn();
	const stack = observerStack(onRouteRender);
	const container = document.createElement("div");
	const root = createRoot(container);
	const render = (path: string) => (
		<StrictMode>
			<StackProvider stack={stack}>
				<RouteRenderer router={stack.router} path={path} onError={() => {}} />
			</StackProvider>
		</StrictMode>
	);
	try {
		await act(async () => root.render(render("/first")));
		await act(async () => root.render(render("/first")));
		await act(async () => root.render(render("/second")));
		await act(async () => root.render(render("/first")));
		expect(container.textContent).toBe("First page");
		expect(onRouteRender.mock.calls).toEqual([
			[{ path: "/first" }],
			[{ path: "/second" }],
			[{ path: "/first" }],
		]);
	} finally {
		await act(async () => root.unmount());
		stack.provider.queryClient.clear();
	}
});

it("observes plain framework pages that do not use ComposedRoute", async () => {
	const onRouteRender = vi.fn();
	const stack = observerStack(onRouteRender);
	const page = createNextPage({
		getStackClient: () => stack,
		getQueryClient: () => stack.provider.queryClient,
	});
	const element = await page.Page({
		params: Promise.resolve({ all: ["first"] }),
	});
	const container = document.createElement("div");
	const root = createRoot(container);
	try {
		await act(async () =>
			root.render(
				<QueryClientProvider client={stack.provider.queryClient}>
					<StackProvider stack={stack}>{element}</StackProvider>
				</QueryClientProvider>,
			),
		);
		expect(container.textContent).toBe("First page");
		expect(onRouteRender).toHaveBeenCalledExactlyOnceWith({ path: "/first" });
	} finally {
		await act(async () => root.unmount());
		stack.provider.queryClient.clear();
	}
});

it("observes standalone ComposedRoute pages used by static routes without duplicate nested notifications", async () => {
	const onRouteRender = vi.fn();
	const stack = observerStack(onRouteRender);
	const container = document.createElement("div");
	const root = createRoot(container);
	const Page = () => (
		<RouteRenderer router={stack.router} path="/first" onError={() => {}} />
	);
	const render = () => (
		<StrictMode>
			<StackProvider stack={stack}>
				<ComposedRoute
					path="/static"
					PageComponent={Page}
					LoadingComponent={() => null}
					onError={() => {}}
				/>
			</StackProvider>
		</StrictMode>
	);
	try {
		await act(async () => root.render(render()));
		await act(async () => root.render(render()));
		expect(container.textContent).toBe("First page");
		expect(onRouteRender).toHaveBeenCalledExactlyOnceWith({ path: "/static" });
	} finally {
		await act(async () => root.unmount());
		stack.provider.queryClient.clear();
	}
});

it("waits for a suspended root to commit before observing its route", async () => {
	const onRouteRender = vi.fn();
	const stack = observerStack(onRouteRender);
	const container = document.createElement("div");
	const root = createRoot(container);
	let resolve!: (value: { default: () => React.ReactNode }) => void;
	const Page = lazy(
		() =>
			new Promise<{ default: () => React.ReactNode }>((done) => {
				resolve = done;
			}),
	);
	try {
		await act(async () =>
			root.render(
				<StackProvider stack={stack}>
					<Suspense fallback={<div>Loading</div>}>
						<RouteLifecycle path="/pending">
							<Page />
						</RouteLifecycle>
					</Suspense>
				</StackProvider>,
			),
		);
		expect(container.textContent).toBe("Loading");
		expect(onRouteRender).not.toHaveBeenCalled();
		await act(async () => resolve({ default: () => <div>Ready</div> }));
		expect(container.textContent).toBe("Ready");
		expect(onRouteRender).toHaveBeenCalledExactlyOnceWith({ path: "/pending" });
	} finally {
		await act(async () => root.unmount());
		stack.provider.queryClient.clear();
	}
});

it("does not double count delayed nested ComposedRoute or RouteRenderer commits", async () => {
	const onRouteRender = vi.fn();
	const stack = observerStack(onRouteRender);
	const container = document.createElement("div");
	const root = createRoot(container);
	let resolve!: (value: { default: () => React.ReactNode }) => void;
	const Page = lazy(
		() =>
			new Promise<{ default: () => React.ReactNode }>((done) => {
				resolve = done;
			}),
	);
	try {
		await act(async () =>
			root.render(
				<StackProvider stack={stack}>
					<RouteLifecycle path="/outer">
						<ComposedRoute
							path="/inner"
							PageComponent={Page}
							LoadingComponent={() => <div>Loading</div>}
							onError={() => {}}
						/>
					</RouteLifecycle>
				</StackProvider>,
			),
		);
		expect(container.textContent).toBe("Loading");
		expect(onRouteRender).toHaveBeenCalledExactlyOnceWith({ path: "/outer" });
		await act(async () =>
			resolve({
				default: () => (
					<RouteRenderer
						router={stack.router}
						path="/first"
						onError={() => {}}
					/>
				),
			}),
		);
		expect(container.textContent).toBe("First page");
		expect(onRouteRender).toHaveBeenCalledOnce();
	} finally {
		await act(async () => root.unmount());
		stack.provider.queryClient.clear();
	}
});

it("keeps failing observers from interrupting other observers or the page", async () => {
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
		await act(async () =>
			root.render(
				<StackProvider stack={stack}>
					<RouteLifecycle path="/working">
						<div>Page</div>
					</RouteLifecycle>
				</StackProvider>,
			),
		);
		expect(container.textContent).toBe("Page");
		expect(onRouteRender).toHaveBeenCalledExactlyOnceWith({ path: "/working" });
	} finally {
		await act(async () => root.unmount());
		stack.provider.queryClient.clear();
	}
});
