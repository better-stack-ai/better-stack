// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { StackProvider, type StackAuthProvider } from "@btst/stack/context";
import { useBoard } from "../client/hooks/kanban-hooks";

(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("Kanban protected query identity partition", () => {
	let container: HTMLDivElement;
	let root: Root;
	let queryClient: QueryClient;
	let fetchMock: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		queryClient = new QueryClient();
		fetchMock = vi.spyOn(globalThis, "fetch" as never);
	});

	afterEach(async () => {
		await act(async () => {
			root.unmount();
		});
		queryClient.clear();
		container.remove();
		vi.restoreAllMocks();
	});

	function responseFor(name: string) {
		return new Response(
			JSON.stringify({
				id: "board-1",
				name,
				slug: "board-1",
				columns: [],
				createdAt: "2026-01-01T00:00:00.000Z",
				updatedAt: "2026-01-01T00:00:00.000Z",
			}),
			{ status: 200, headers: { "content-type": "application/json" } },
		);
	}

	async function waitFor(check: () => boolean, timeout = 3_000) {
		const start = Date.now();
		while (!check()) {
			if (Date.now() - start > timeout) throw new Error("waitFor timed out");
			await act(async () => {
				await new Promise((resolve) => setTimeout(resolve, 10));
			});
		}
	}

	it("does not reuse a prior user's pending response after the auth source changes", async () => {
		fetchMock
			.mockResolvedValueOnce(responseFor("User A board"))
			.mockResolvedValueOnce(responseFor("User B board"));
		const pendingIdentity = () => new Promise<null>(() => {});
		const userA = { getIdentity: pendingIdentity } satisfies StackAuthProvider;
		const userB = { getIdentity: pendingIdentity } satisfies StackAuthProvider;
		let boardName: string | undefined;

		function Probe() {
			boardName = useBoard("board-1").data?.name;
			return null;
		}

		async function render(auth: StackAuthProvider) {
			await act(async () => {
				root.render(
					<StackProvider
						basePath="/pages"
						api={{ baseURL: "http://test.local", basePath: "/api" }}
						auth={auth}
					>
						<QueryClientProvider client={queryClient}>
							<Probe />
						</QueryClientProvider>
					</StackProvider>,
				);
			});
		}

		await render(userA);
		await waitFor(() => boardName === "User A board");
		await render(userB);
		await waitFor(
			() => fetchMock.mock.calls.length === 2 && boardName === "User B board",
		);
	});
});
