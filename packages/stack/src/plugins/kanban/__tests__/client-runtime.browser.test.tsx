// @vitest-environment jsdom
import { QueryClient } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createClientStack } from "../../../client";
import { StackProvider } from "@btst/stack/context";
import { kanbanClientPlugin } from "../client";
import { BoardsListPage } from "../client/components/pages/boards-list-page.internal";
import { useBoardMutations, useBoards } from "../client/hooks";
import { useKanbanSiteLocation } from "../client/navigation";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const board = {
	id: "board-1",
	name: "Roadmap",
	slug: "roadmap",
	description: "Team roadmap",
	ownerId: "owner-1",
	organizationId: null,
	columns: [],
	createdAt: "2026-01-01T00:00:00.000Z",
	updatedAt: "2026-01-01T00:00:00.000Z",
};

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

describe("Kanban browser runtime", () => {
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
			{ api: { basePath: "/api/boards" } },
			/^https:\/\/app\.example\.com\/api\/boards\/boards/,
		],
		[
			"cross-origin endpoint",
			{
				api: {
					baseURL: "https://boards.example.net",
					basePath: "/btst/kanban",
					browserHeaders: { "x-public-client": "public-value" },
					credentials: "include" as const,
				},
			},
			/^https:\/\/boards\.example\.net\/btst\/kanban\/boards/,
		],
		[
			"root-mounted endpoint",
			{ api: { basePath: "/" } },
			/^https:\/\/app\.example\.com\/boards(?:\?|$)/,
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
					? jsonResponse({ items: [board], total: 1, limit: 50, offset: 0 })
					: jsonResponse(board);
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
						plugins: { kanban: kanbanClientPlugin() },
						endpoints: { kanban: endpoint },
					});
				} finally {
					Object.defineProperty(globalThis, "window", {
						configurable: true,
						value: browserWindow,
					});
				}
			})();

			let query: ReturnType<typeof useBoards> | undefined;
			let mutations: ReturnType<typeof useBoardMutations> | undefined;
			function Probe() {
				query = useBoards();
				mutations = useBoardMutations();
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
				await mutations?.createBoard({ name: "Roadmap" });
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
		["root-mounted same-origin", { basePath: "/" }, "/kanban/board-1"],
		[
			"cross-origin",
			{ baseURL: "https://boards.example.net", basePath: "/workspace" },
			"https://boards.example.net/workspace/kanban/board-1",
		],
	] as const)(
		"renders board links from a %s Kanban site",
		async (_, site, href) => {
			vi.spyOn(globalThis, "fetch").mockResolvedValue(
				jsonResponse({ items: [board], total: 1, limit: 50, offset: 0 }),
			);
			const stack = createClientStack({
				api: { baseURL: "https://app.example.com", basePath: "/api/data" },
				site: { baseURL: window.location.origin, basePath: "/pages" },
				queryClient: new QueryClient(),
				plugins: { kanban: kanbanClientPlugin() },
				endpoints: {
					kanban: { site },
				},
			});

			await act(async () => {
				root.render(
					<StackProvider stack={stack}>
						<BoardsListPage />
					</StackProvider>,
				);
			});
			await waitFor(() => container.querySelector("a") !== null);

			expect(container.querySelector("a")?.getAttribute("href")).toBe(href);
		},
	);

	it("keeps cross-origin Kanban links stable during SSR and hydration", async () => {
		const stack = createClientStack({
			api: { baseURL: "https://app.example.com", basePath: "/api/data" },
			site: { baseURL: "https://app.example.com", basePath: "/pages" },
			queryClient: new QueryClient(),
			plugins: { kanban: kanbanClientPlugin() },
			endpoints: {
				kanban: {
					site: {
						baseURL: "https://boards.example.net",
						basePath: "/workspace",
					},
				},
			},
		});
		function LinkProbe() {
			const { resolve } = useKanbanSiteLocation();
			return <a href={resolve("kanban", "board-1").href}>Board</a>;
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
			'href="https://boards.example.net/workspace/kanban/board-1"',
		);
		await act(async () => {
			root.render(
				<StackProvider stack={stack}>
					<LinkProbe />
				</StackProvider>,
			);
		});
		expect(container.querySelector("a")?.getAttribute("href")).toBe(
			"https://boards.example.net/workspace/kanban/board-1",
		);
	});
});
