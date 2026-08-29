// @vitest-environment jsdom
import { QueryClient } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createClientStack } from "../../../client";
import { StackProvider, usePluginSiteNavigation } from "@btst/stack/context";
import { formBuilderClientPlugin } from "../client";
import { FormListPage } from "../client/components/pages/form-list-page.internal";
import { useCreateForm, useForms } from "../client/hooks";
import { FORM_BUILDER_PLUGIN_ID } from "../client/constants";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

function jsonResponse(value: unknown) {
	return new Response(JSON.stringify(value), {
		status: 200,
		headers: { "content-type": "application/json" },
	});
}

async function waitFor(check: () => boolean, timeout = 3000) {
	const start = Date.now();
	while (!check()) {
		if (Date.now() - start > timeout) throw new Error("waitFor timed out");
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 10));
		});
	}
}

describe("Form Builder browser runtime", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(async () => {
		await act(async () => root.unmount());
		container.remove();
		vi.restoreAllMocks();
	});

	it.each([
		[
			"same-origin path",
			{ api: { basePath: "/api/forms" } },
			/^https:\/\/app\.example\.com\/api\/forms\/forms/,
		],
		[
			"cross-origin endpoint",
			{
				api: {
					baseURL: "https://forms.example.net",
					basePath: "/btst/forms",
					browserHeaders: { "x-public-client": "public-value" },
					credentials: "include" as const,
				},
			},
			/^https:\/\/forms\.example\.net\/btst\/forms\/forms/,
		],
		[
			"root-mounted endpoint",
			{ api: { basePath: "/" } },
			/^https:\/\/app\.example\.com\/forms(?:\?|$)/,
		],
	] as const)(
		"uses the resolved %s for browser reads and mutations",
		async (label, endpoint, expectedURL) => {
			const requests: Array<{
				url: string;
				method: string;
				headers: Headers;
				credentials?: RequestCredentials;
			}> = [];
			vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
				const request =
					input instanceof Request ? input : new Request(input, init);
				requests.push({
					url: request.url,
					method: request.method,
					headers: request.headers,
					credentials: request.credentials,
				});
				return request.method === "GET"
					? jsonResponse({ items: [], total: 0, limit: 20, offset: 0 })
					: jsonResponse({
							id: "form-1",
							name: "Contact",
							slug: "contact",
							status: "active",
						});
			});
			const browserWindow = globalThis.window;
			Object.defineProperty(globalThis, "window", {
				configurable: true,
				value: undefined,
			});
			const stack = (() => {
				try {
					return createClientStack({
						api: {
							baseURL: "https://app.example.com",
							basePath: "/api/data",
							headers: {
								authorization: "Bearer server-token",
								cookie: "session=server",
							},
						},
						site: { baseURL: "https://app.example.com", basePath: "/pages" },
						queryClient: new QueryClient(),
						plugins: { formBuilder: formBuilderClientPlugin() },
						endpoints: { formBuilder: endpoint },
					});
				} finally {
					Object.defineProperty(globalThis, "window", {
						configurable: true,
						value: browserWindow,
					});
				}
			})();

			let query: ReturnType<typeof useForms> | undefined;
			let create: ReturnType<typeof useCreateForm> | undefined;
			function Probe() {
				query = useForms();
				create = useCreateForm();
				return null;
			}

			await act(async () => {
				root.render(
					<StackProvider stack={stack}>
						<Probe />
					</StackProvider>,
				);
			});
			await waitFor(() => query?.isLoading === false);
			await act(async () => {
				await create?.mutateAsync({
					name: "Contact",
					slug: "contact",
					schema: JSON.stringify({ type: "object" }),
				});
			});

			expect(requests.some((request) => request.method === "GET")).toBe(true);
			expect(requests.some((request) => request.method === "POST")).toBe(true);
			for (const request of requests) {
				expect(request.url).toMatch(expectedURL);
				expect(request.headers.get("authorization")).toBeNull();
				expect(request.headers.get("cookie")).toBeNull();
				if (label === "cross-origin endpoint") {
					expect(request.headers.get("x-public-client")).toBe("public-value");
					expect(request.credentials).toBe("include");
				}
			}
		},
	);

	it.each([
		["root-mounted same-origin", { basePath: "/" }, "/forms/new"],
		[
			"cross-origin",
			{ baseURL: "https://forms.example.net", basePath: "/workspace" },
			"https://forms.example.net/workspace/forms/new",
		],
	] as const)(
		"renders links from a %s Form Builder site",
		async (_, site, href) => {
			vi.spyOn(globalThis, "fetch").mockResolvedValue(
				jsonResponse({ items: [], total: 0, limit: 20, offset: 0 }),
			);
			const stack = createClientStack({
				api: { baseURL: "https://app.example.com", basePath: "/api/data" },
				site: { baseURL: window.location.origin, basePath: "/pages" },
				queryClient: new QueryClient(),
				plugins: { formBuilder: formBuilderClientPlugin() },
				endpoints: {
					formBuilder: { site },
				},
			});

			await act(async () => {
				root.render(
					<StackProvider stack={stack}>
						<FormListPage />
					</StackProvider>,
				);
			});
			await waitFor(() => container.querySelector("a") !== null);

			expect(container.querySelector("a")?.getAttribute("href")).toBe(href);
		},
	);

	it("keeps cross-origin Form Builder links stable during SSR and hydration", async () => {
		const stack = createClientStack({
			api: { baseURL: "https://app.example.com", basePath: "/api/data" },
			site: { baseURL: "https://app.example.com", basePath: "/pages" },
			queryClient: new QueryClient(),
			plugins: { formBuilder: formBuilderClientPlugin() },
			endpoints: {
				formBuilder: {
					site: {
						baseURL: "https://forms.example.net",
						basePath: "/workspace",
					},
				},
			},
		});
		function LinkProbe() {
			const { resolve } = usePluginSiteNavigation(FORM_BUILDER_PLUGIN_ID);
			return <a href={resolve("forms", "new").href}>New form</a>;
		}

		const browserWindow = globalThis.window;
		let serverHTML: string;
		Object.defineProperty(globalThis, "window", {
			configurable: true,
			value: undefined,
		});
		try {
			serverHTML = renderToString(
				<StackProvider stack={stack}>
					<LinkProbe />
				</StackProvider>,
			);
		} finally {
			Object.defineProperty(globalThis, "window", {
				configurable: true,
				value: browserWindow,
			});
		}

		expect(serverHTML).toContain(
			'href="https://forms.example.net/workspace/forms/new"',
		);
		await act(async () => {
			root.render(
				<StackProvider stack={stack}>
					<LinkProbe />
				</StackProvider>,
			);
		});
		expect(container.querySelector("a")?.getAttribute("href")).toBe(
			"https://forms.example.net/workspace/forms/new",
		);
	});
});
