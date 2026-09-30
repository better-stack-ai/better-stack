// @vitest-environment jsdom
import { act, lazy } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import { createClientStack } from "@btst/stack/client";
import { StackProvider } from "@btst/stack/context";
import { blogClientPlugin } from "@btst/stack/plugins/blog/client";
import { createHomePage } from "../client/components/pages/home-page";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

it("reports a failed page module through the existing blog error hook and UI", async () => {
	const error = new Error("Page module unavailable");
	const Page = createHomePage(lazy(() => Promise.reject(error)));
	const onRouteError = vi.fn();
	const queryClient = new QueryClient();
	const stack = createClientStack({
		api: { baseURL: "http://test.local", basePath: "/api/data" },
		site: { baseURL: "http://test.local", basePath: "/pages" },
		queryClient,
		plugins: { blog: blogClientPlugin() },
	});
	const container = document.createElement("div");
	const root = createRoot(container);
	const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
	try {
		await act(async () =>
			root.render(
				<QueryClientProvider client={queryClient}>
					<StackProvider
						stack={stack}
						overrides={{ blog: { onRouteError, uploadImage: async () => "" } }}
					>
						<Page />
					</StackProvider>
				</QueryClientProvider>,
			),
		);
		expect(
			container.querySelector('[data-testid="error-placeholder"]'),
		).not.toBeNull();
		expect(onRouteError).toHaveBeenCalledExactlyOnceWith("posts", error, {
			path: "/blog",
			isSSR: false,
			published: true,
		});
	} finally {
		await act(async () => root.unmount());
		queryClient.clear();
		consoleError.mockRestore();
	}
});
