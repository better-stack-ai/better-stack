// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StackProvider, useIdentity } from "@btst/stack/context";
import { createIdentityTestAuth } from "../../../__tests__/auth-test-utils";
import { createTestClientStack } from "../../../__tests__/client-stack-test-utils";
import type { StackClientAuth } from "../../../shared/auth-types";
import { useBoard } from "../client/hooks/kanban-hooks";
import { kanbanClientPlugin } from "../client/plugin";

const kanbanProviderOverrides = {
	kanban: {
		resolveUser: () => null,
		searchUsers: () => [],
	},
};

function createKanbanStack(queryClient: QueryClient) {
	return createTestClientStack({ kanban: kanbanClientPlugin() }, queryClient, {
		api: { baseURL: "http://test.local", basePath: "/api" },
	});
}

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
		const userA = createIdentityTestAuth(pendingIdentity);
		const userB = createIdentityTestAuth(pendingIdentity);
		let boardName: string | undefined;

		function Probe() {
			boardName = useBoard("board-1").data?.name;
			return null;
		}

		async function render(auth: StackClientAuth) {
			await act(async () => {
				root.render(
					<StackProvider
						stack={createKanbanStack(queryClient)}
						overrides={kanbanProviderOverrides}
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

	it("stops using the resolved user's cache while a stable provider refetches", async () => {
		fetchMock.mockImplementation(() =>
			Promise.resolve(
				responseFor(
					fetchMock.mock.calls.length === 1 ? "User A board" : "User B board",
				),
			),
		);
		let finishIdentity: ((identity: { id: string }) => void) | undefined;
		const auth = createIdentityTestAuth(
			() =>
				new Promise<{ id: string }>((resolve) => {
					finishIdentity = resolve;
				}),
		);
		let boardName: string | undefined;
		let identityPending = false;
		let refetchIdentity: (() => Promise<void>) | undefined;

		function Probe() {
			const identityState = useIdentity();
			refetchIdentity = identityState.refetch;
			identityPending = identityState.isPending;
			boardName = useBoard("board-1").data?.name;
			return null;
		}

		await act(async () => {
			root.render(
				<StackProvider
					stack={createKanbanStack(queryClient)}
					overrides={kanbanProviderOverrides}
					auth={auth}
					initialIdentity={{ id: "user-a" }}
				>
					<QueryClientProvider client={queryClient}>
						<Probe />
					</QueryClientProvider>
				</StackProvider>,
			);
		});
		await waitFor(() => boardName === "User A board");

		let resolution: Promise<void> | undefined;
		await act(async () => {
			resolution = refetchIdentity?.();
			await Promise.resolve();
		});
		expect(identityPending).toBe(true);
		expect(boardName).not.toBe("User A board");
		await waitFor(() => fetchMock.mock.calls.length >= 2);
		finishIdentity?.({ id: "user-b" });
		await act(async () => resolution);
		await waitFor(() => boardName === "User B board");
	});

	it("does not cache an authenticated response under the anonymous key when identity resolution fails", async () => {
		let backendAuthenticated = true;
		fetchMock.mockImplementation(() =>
			Promise.resolve(
				responseFor(backendAuthenticated ? "Private board" : "Anonymous board"),
			),
		);
		vi.spyOn(console, "error").mockImplementation(() => {});
		let rejectIdentity: ((error: Error) => void) | undefined;
		let finishLogout: ((identity: null) => void) | undefined;
		let identityCall = 0;
		const auth = createIdentityTestAuth(
			() =>
				new Promise<{ id: string } | null>((resolve, reject) => {
					identityCall += 1;
					if (identityCall === 1) rejectIdentity = reject;
					else finishLogout = resolve;
				}),
		);
		let boardName: string | undefined;
		let identityError: Error | undefined;
		let refetchIdentity: (() => Promise<void>) | undefined;

		function Probe() {
			const identityState = useIdentity();
			identityError = identityState.error;
			refetchIdentity = identityState.refetch;
			boardName = useBoard("board-1").data?.name;
			return null;
		}

		await act(async () => {
			root.render(
				<StackProvider
					stack={createKanbanStack(queryClient)}
					overrides={kanbanProviderOverrides}
					auth={auth}
				>
					<QueryClientProvider client={queryClient}>
						<Probe />
					</QueryClientProvider>
				</StackProvider>,
			);
		});
		await waitFor(() => boardName === "Private board");

		await act(async () => {
			rejectIdentity?.(new Error("identity unavailable"));
			await Promise.resolve();
		});
		await waitFor(
			() =>
				identityError?.message === "identity unavailable" &&
				fetchMock.mock.calls.length >= 2,
		);

		backendAuthenticated = false;
		let logoutResolution: Promise<void> | undefined;
		await act(async () => {
			logoutResolution = refetchIdentity?.();
			await Promise.resolve();
		});
		await waitFor(() => finishLogout !== undefined);
		finishLogout?.(null);
		await act(async () => logoutResolution);
		await waitFor(
			() => fetchMock.mock.calls.length >= 4 && boardName === "Anonymous board",
		);
	});

	it("isolates an invalid hydrated identity from a later anonymous session", async () => {
		let backendAuthenticated = true;
		fetchMock.mockImplementation(() =>
			Promise.resolve(
				responseFor(backendAuthenticated ? "Private board" : "Anonymous board"),
			),
		);
		const auth = {
			mode: "one-rule" as const,
			contract: {
				parseIdentity(identity: unknown) {
					if (identity === null) return null;
					if (
						typeof identity === "object" &&
						identity !== null &&
						typeof (identity as { id?: unknown }).id === "string"
					) {
						return identity as { id: string };
					}
					throw new Error("invalid identity");
				},
			},
			getIdentity: vi.fn(() => null),
			usePermission: () => ({ can: true, isPending: false }),
		};
		let boardName: string | undefined;
		let identityError: Error | undefined;

		function Probe() {
			identityError = useIdentity().error;
			boardName = useBoard("board-1").data?.name;
			return null;
		}

		async function render(initialIdentity: unknown) {
			await act(async () => {
				root.render(
					<StackProvider
						stack={createKanbanStack(queryClient)}
						overrides={kanbanProviderOverrides}
						auth={auth}
						initialIdentity={initialIdentity as never}
					>
						<QueryClientProvider client={queryClient}>
							<Probe />
						</QueryClientProvider>
					</StackProvider>,
				);
			});
		}

		await render({ id: 123 });
		await waitFor(
			() =>
				identityError?.message === "invalid identity" &&
				boardName === "Private board",
		);

		backendAuthenticated = false;
		await render(null);
		await waitFor(
			() => fetchMock.mock.calls.length >= 2 && boardName === "Anonymous board",
		);
		expect(auth.getIdentity).not.toHaveBeenCalled();
	});
});
