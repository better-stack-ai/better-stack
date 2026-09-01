// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, startTransition, Suspense, useLayoutEffect } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StackProvider, useIdentity } from "@btst/stack/context";
import { createIdentityTestAuth } from "../../../__tests__/auth-test-utils";
import { createTestClientStack } from "../../../__tests__/client-stack-test-utils";
import { MEDIA_QUERY_KEYS } from "../api/query-key-defs";
import {
	useAssets,
	useDeleteAsset,
	useUploadAsset,
} from "../client/hooks/use-media";
import { mediaResources } from "../query-keys";
import { mediaClientPlugin } from "../client/plugin";

const MEDIA_ENDPOINT = {
	baseURL: "http://test.local",
	basePath: "/api",
};

function createMediaStack(
	queryClient: QueryClient,
	api: typeof MEDIA_ENDPOINT = MEDIA_ENDPOINT,
) {
	return createTestClientStack({ media: mediaClientPlugin() }, queryClient, {
		api,
	});
}

(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("Media protected query identity partition", () => {
	let container: HTMLDivElement;
	let root: Root;
	let queryClient: QueryClient;
	let fetchMock: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		queryClient = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});
		fetchMock = vi.spyOn(globalThis, "fetch" as never);
	});

	afterEach(async () => {
		await act(async () => root.unmount());
		queryClient.clear();
		container.remove();
		vi.restoreAllMocks();
	});

	function responseFor(name: string) {
		return new Response(
			JSON.stringify({
				items: [
					{
						id: `asset-${name}`,
						filename: `${name}.jpg`,
						originalName: `${name}.jpg`,
						mimeType: "image/jpeg",
						size: 1,
						url: `https://files.example/${name}.jpg`,
						createdAt: "2026-01-01T00:00:00.000Z",
					},
				],
				total: 1,
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

	it("does not reuse another hydrated identity's response", async () => {
		fetchMock
			.mockResolvedValueOnce(responseFor("user-a"))
			.mockResolvedValueOnce(responseFor("user-b"));
		const auth = createIdentityTestAuth(vi.fn(() => null));
		let filename: string | undefined;

		function Probe() {
			filename = useAssets({ limit: 40 }).data?.pages[0]?.items[0]?.filename;
			return null;
		}

		async function render(initialIdentity: { id: string }) {
			await act(async () => {
				root.render(
					<StackProvider
						stack={createMediaStack(queryClient)}
						auth={auth}
						initialIdentity={initialIdentity}
						overrides={{ media: {} }}
					>
						<QueryClientProvider client={queryClient}>
							<Probe />
						</QueryClientProvider>
					</StackProvider>,
				);
			});
		}

		await render({ id: "user-a" });
		await waitFor(() => filename === "user-a.jpg");
		await render({ id: "user-b" });
		expect(filename).not.toBe("user-a.jpg");
		await waitFor(() => filename === "user-b.jpg");
		expect(
			queryClient.getQueryData(
				MEDIA_QUERY_KEYS.assetsList(
					{ limit: 40 },
					{ id: "user-a" },
					MEDIA_ENDPOINT,
				),
			),
		).toBeDefined();
		expect(
			queryClient.getQueryData(
				MEDIA_QUERY_KEYS.assetsList(
					{ limit: 40 },
					{ id: "user-b" },
					MEDIA_ENDPOINT,
				),
			),
		).toBeDefined();
	});

	it("stops fetching and exposing data while identity refetch is unresolved", async () => {
		fetchMock
			.mockResolvedValueOnce(responseFor("user-a"))
			.mockResolvedValueOnce(responseFor("user-b"));
		let resolveIdentity: ((identity: { id: string }) => void) | undefined;
		const auth = createIdentityTestAuth(
			() =>
				new Promise<{ id: string }>((resolve) => {
					resolveIdentity = resolve;
				}),
		);
		let filename: string | undefined;
		let refetch: (() => Promise<void>) | undefined;

		function Probe() {
			refetch = useIdentity().refetch;
			filename = useAssets({ limit: 40 }).data?.pages[0]?.items[0]?.filename;
			return null;
		}

		await act(async () => {
			root.render(
				<StackProvider
					stack={createMediaStack(queryClient)}
					auth={auth}
					initialIdentity={{ id: "user-a" }}
					overrides={{ media: {} }}
				>
					<QueryClientProvider client={queryClient}>
						<Probe />
					</QueryClientProvider>
				</StackProvider>,
			);
		});
		await waitFor(() => filename === "user-a.jpg");
		let resolution: Promise<void> | undefined;
		await act(async () => {
			resolution = refetch?.();
			await Promise.resolve();
		});
		expect(filename).toBeUndefined();
		expect(fetchMock).toHaveBeenCalledOnce();
		resolveIdentity?.({ id: "user-b" });
		await act(async () => resolution);
		await waitFor(() => filename === "user-b.jpg");
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it("refetches only the active identity partition after an upload", async () => {
		const uploadedAsset = {
			id: "asset-uploaded",
			filename: "uploaded.txt",
			originalName: "uploaded.txt",
			mimeType: "text/plain",
			size: 3,
			url: "https://files.example/uploaded.txt",
			createdAt: "2026-01-01T00:00:00.000Z",
		};
		fetchMock
			.mockResolvedValueOnce(responseFor("user-a"))
			.mockResolvedValueOnce(responseFor("user-b"))
			.mockResolvedValueOnce(
				new Response(JSON.stringify(uploadedAsset), {
					status: 200,
					headers: { "content-type": "application/json" },
				}),
			)
			.mockResolvedValueOnce(responseFor("user-b-updated"));
		const auth = createIdentityTestAuth(vi.fn(() => null));
		let filename: string | undefined;
		let upload: ReturnType<typeof useUploadAsset>["mutateAsync"] | undefined;

		function Probe() {
			filename = useAssets({ limit: 40 }).data?.pages[0]?.items[0]?.filename;
			upload = useUploadAsset().mutateAsync;
			return null;
		}

		async function render(initialIdentity: { id: string }) {
			await act(async () => {
				root.render(
					<StackProvider
						stack={createMediaStack(queryClient)}
						auth={auth}
						initialIdentity={initialIdentity}
						overrides={{ media: { imageCompression: false } }}
					>
						<QueryClientProvider client={queryClient}>
							<Probe />
						</QueryClientProvider>
					</StackProvider>,
				);
			});
		}

		await render({ id: "user-a" });
		await waitFor(() => filename === "user-a.jpg");
		await render({ id: "user-b" });
		await waitFor(() => filename === "user-b.jpg");
		await act(async () => {
			await upload?.({
				file: new File(["new"], "uploaded.txt", { type: "text/plain" }),
			});
		});
		await waitFor(() => filename === "user-b-updated.jpg");

		expect(fetchMock).toHaveBeenCalledTimes(4);
		const userA = queryClient.getQueryData<{
			pages: Array<{ items: Array<{ filename: string }> }>;
		}>(
			MEDIA_QUERY_KEYS.assetsList(
				{ limit: 40 },
				{ id: "user-a" },
				MEDIA_ENDPOINT,
			),
		);
		expect(userA?.pages[0]?.items[0]?.filename).toBe("user-a.jpg");
	});

	it("refetches an unmounted list only for the deleting identity", async () => {
		fetchMock
			.mockResolvedValueOnce(responseFor("user-a"))
			.mockResolvedValueOnce(responseFor("user-b"))
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ success: true }), {
					status: 200,
					headers: { "content-type": "application/json" },
				}),
			)
			.mockResolvedValueOnce(responseFor("user-b-updated"));
		const auth = createIdentityTestAuth(vi.fn(() => null));
		let filename: string | undefined;
		let deleteAsset:
			| ReturnType<typeof useDeleteAsset>["mutateAsync"]
			| undefined;

		function ListProbe() {
			filename = useAssets({ limit: 40 }).data?.pages[0]?.items[0]?.filename;
			return null;
		}

		function Probe({ showList }: { showList: boolean }) {
			deleteAsset = useDeleteAsset().mutateAsync;
			return showList ? <ListProbe /> : null;
		}

		async function render(initialIdentity: { id: string }, showList: boolean) {
			await act(async () => {
				root.render(
					<StackProvider
						stack={createMediaStack(queryClient)}
						auth={auth}
						initialIdentity={initialIdentity}
						overrides={{ media: {} }}
					>
						<QueryClientProvider client={queryClient}>
							<Probe showList={showList} />
						</QueryClientProvider>
					</StackProvider>,
				);
			});
		}

		await render({ id: "user-a" }, true);
		await waitFor(() => filename === "user-a.jpg");
		await render({ id: "user-b" }, true);
		await waitFor(() => filename === "user-b.jpg");
		await render({ id: "user-b" }, false);
		await act(async () => {
			await deleteAsset?.("asset-user-b");
		});

		expect(fetchMock).toHaveBeenCalledTimes(4);
		const userA = queryClient.getQueryData<{
			pages: Array<{ items: Array<{ filename: string }> }>;
		}>(
			MEDIA_QUERY_KEYS.assetsList(
				{ limit: 40 },
				{ id: "user-a" },
				MEDIA_ENDPOINT,
			),
		);
		const userB = queryClient.getQueryData<{
			pages: Array<{ items: Array<{ filename: string }> }>;
		}>(
			MEDIA_QUERY_KEYS.assetsList(
				{ limit: 40 },
				{ id: "user-b" },
				MEDIA_ENDPOINT,
			),
		);
		expect(userA?.pages[0]?.items[0]?.filename).toBe("user-a.jpg");
		expect(userB?.pages[0]?.items[0]?.filename).toBe("user-b-updated.jpg");
	});

	it("never refetches a mutation-start identity after an in-flight account switch", async () => {
		let resolveDelete: ((response: Response) => void) | undefined;
		const deleteResponse = new Promise<Response>((resolve) => {
			resolveDelete = resolve;
		});
		fetchMock
			.mockResolvedValueOnce(responseFor("user-a"))
			.mockReturnValueOnce(deleteResponse)
			.mockResolvedValueOnce(responseFor("user-b"));
		const auth = createIdentityTestAuth(vi.fn(() => null));
		let filename: string | undefined;
		let deleteAsset:
			| ReturnType<typeof useDeleteAsset>["mutateAsync"]
			| undefined;

		function Probe() {
			filename = useAssets({ limit: 40 }).data?.pages[0]?.items[0]?.filename;
			deleteAsset = useDeleteAsset().mutateAsync;
			return null;
		}

		async function render(initialIdentity: { id: string }) {
			await act(async () => {
				root.render(
					<StackProvider
						stack={createMediaStack(queryClient)}
						auth={auth}
						initialIdentity={initialIdentity}
						overrides={{ media: {} }}
					>
						<QueryClientProvider client={queryClient}>
							<Probe />
						</QueryClientProvider>
					</StackProvider>,
				);
			});
		}

		await render({ id: "user-a" });
		await waitFor(() => filename === "user-a.jpg");
		let deletion: Promise<{ success: boolean }> | undefined;
		await act(async () => {
			deletion = deleteAsset?.("asset-user-a");
			await Promise.resolve();
		});
		await waitFor(() => fetchMock.mock.calls.length === 2);
		await render({ id: "user-b" });
		await waitFor(() => filename === "user-b.jpg");
		resolveDelete?.(
			new Response(JSON.stringify({ success: true }), {
				status: 200,
				headers: { "content-type": "application/json" },
			}),
		);
		await act(async () => deletion);

		expect(fetchMock).toHaveBeenCalledTimes(3);
		expect(
			queryClient.getQueryData(
				MEDIA_QUERY_KEYS.assetsList(
					{ limit: 40 },
					{ id: "user-a" },
					MEDIA_ENDPOINT,
				),
			),
		).toBeUndefined();
		const userB = queryClient.getQueryData<{
			pages: Array<{ items: Array<{ filename: string }> }>;
		}>(
			MEDIA_QUERY_KEYS.assetsList(
				{ limit: 40 },
				{ id: "user-b" },
				MEDIA_ENDPOINT,
			),
		);
		expect(userB?.pages[0]?.items[0]?.filename).toBe("user-b.jpg");
	});

	it("never refetches a mutation-start endpoint after an in-flight endpoint switch", async () => {
		let resolveDelete: ((response: Response) => void) | undefined;
		const deleteResponse = new Promise<Response>((resolve) => {
			resolveDelete = resolve;
		});
		fetchMock
			.mockResolvedValueOnce(responseFor("endpoint-a"))
			.mockReturnValueOnce(deleteResponse)
			.mockResolvedValueOnce(responseFor("endpoint-b"));
		const auth = createIdentityTestAuth(vi.fn(() => null));
		const identity = { id: "user-a" };
		const endpointA = {
			baseURL: "http://media-a.local",
			basePath: "/api-a",
		};
		const endpointB = {
			baseURL: "http://media-b.local",
			basePath: "/api-b",
		};
		let filename: string | undefined;
		let deleteAsset:
			| ReturnType<typeof useDeleteAsset>["mutateAsync"]
			| undefined;

		function Probe() {
			filename = useAssets({ limit: 40 }).data?.pages[0]?.items[0]?.filename;
			deleteAsset = useDeleteAsset().mutateAsync;
			return null;
		}

		async function render(endpoint: typeof endpointA) {
			await act(async () => {
				root.render(
					<StackProvider
						stack={createMediaStack(queryClient, endpoint)}
						auth={auth}
						initialIdentity={identity}
						overrides={{ media: {} }}
					>
						<QueryClientProvider client={queryClient}>
							<Probe />
						</QueryClientProvider>
					</StackProvider>,
				);
			});
		}

		await render(endpointA);
		await waitFor(() => filename === "endpoint-a.jpg");
		let deletion: Promise<{ success: boolean }> | undefined;
		await act(async () => {
			deletion = deleteAsset?.("asset-endpoint-a");
			await Promise.resolve();
		});
		await waitFor(() => fetchMock.mock.calls.length === 2);
		await render(endpointB);
		await waitFor(() => filename === "endpoint-b.jpg");
		resolveDelete?.(
			new Response(JSON.stringify({ success: true }), {
				status: 200,
				headers: { "content-type": "application/json" },
			}),
		);
		await act(async () => deletion);

		expect(fetchMock).toHaveBeenCalledTimes(3);
		expect(
			queryClient.getQueryData(
				MEDIA_QUERY_KEYS.assetsList({ limit: 40 }, identity, endpointA),
			),
		).toBeUndefined();
		const endpointBData = queryClient.getQueryData<{
			pages: Array<{ items: Array<{ filename: string }> }>;
		}>(MEDIA_QUERY_KEYS.assetsList({ limit: 40 }, identity, endpointB));
		expect(endpointBData?.pages[0]?.items[0]?.filename).toBe("endpoint-b.jpg");
	});

	it("ignores an identity from an abandoned concurrent render", async () => {
		fetchMock
			.mockResolvedValueOnce(responseFor("user-a"))
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ success: true }), {
					status: 200,
					headers: { "content-type": "application/json" },
				}),
			);
		const auth = createIdentityTestAuth(vi.fn(() => null));
		let attemptedIdentity: string | undefined;
		let deleteAsset:
			| ReturnType<typeof useDeleteAsset>["mutateAsync"]
			| undefined;
		let suspend = false;
		const never = new Promise<never>(() => {});

		function Probe() {
			attemptedIdentity = useIdentity().identity?.id;
			useAssets({ limit: 40 });
			deleteAsset = useDeleteAsset().mutateAsync;
			if (suspend) throw never;
			return null;
		}

		const tree = (initialIdentity: { id: string }) => (
			<StackProvider
				stack={createMediaStack(queryClient)}
				auth={auth}
				initialIdentity={initialIdentity}
				overrides={{ media: {} }}
			>
				<QueryClientProvider client={queryClient}>
					<Suspense fallback={null}>
						<Probe />
					</Suspense>
				</QueryClientProvider>
			</StackProvider>
		);

		await act(async () => root.render(tree({ id: "user-a" })));
		await waitFor(() => fetchMock.mock.calls.length === 1);
		const committedDelete = deleteAsset;
		suspend = true;
		await act(() => {
			startTransition(() => root.render(tree({ id: "user-b" })));
		});
		await waitFor(() => attemptedIdentity === "user-b");
		await act(async () => committedDelete?.("asset-user-a"));

		expect(
			queryClient.getQueryData(
				MEDIA_QUERY_KEYS.assetsList(
					{ limit: 40 },
					{ id: "user-a" },
					MEDIA_ENDPOINT,
				),
			),
		).toBeUndefined();
		expect(
			queryClient.getQueryData(
				MEDIA_QUERY_KEYS.assetsList(
					{ limit: 40 },
					{ id: "user-b" },
					MEDIA_ENDPOINT,
				),
			),
		).toBeUndefined();
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it("does not refetch an unmounted identity during a replacement commit", async () => {
		let resolveDelete: ((response: Response) => void) | undefined;
		const deleteResponse = new Promise<Response>((resolve) => {
			resolveDelete = resolve;
		});
		fetchMock
			.mockResolvedValueOnce(responseFor("user-a"))
			.mockReturnValueOnce(deleteResponse)
			.mockResolvedValueOnce(responseFor("user-b"));
		const auth = createIdentityTestAuth(vi.fn(() => null));
		let filename: string | undefined;
		let deleteAsset:
			| ReturnType<typeof useDeleteAsset>["mutateAsync"]
			| undefined;

		function Probe({ completeDeletion }: { completeDeletion: boolean }) {
			filename = useAssets({ limit: 40 }).data?.pages[0]?.items[0]?.filename;
			deleteAsset = useDeleteAsset().mutateAsync;
			useLayoutEffect(() => {
				if (!completeDeletion) return;
				resolveDelete?.(
					new Response(JSON.stringify({ success: true }), {
						status: 200,
						headers: { "content-type": "application/json" },
					}),
				);
			}, [completeDeletion]);
			return null;
		}

		const tree = (identity: { id: string }, completeDeletion: boolean) => (
			<StackProvider
				stack={createMediaStack(queryClient)}
				auth={auth}
				initialIdentity={identity}
				overrides={{ media: {} }}
			>
				<QueryClientProvider client={queryClient}>
					<Probe key={identity.id} completeDeletion={completeDeletion} />
				</QueryClientProvider>
			</StackProvider>
		);

		await act(async () => root.render(tree({ id: "user-a" }, false)));
		await waitFor(() => filename === "user-a.jpg");
		let deletion: Promise<{ success: boolean }> | undefined;
		await act(async () => {
			deletion = deleteAsset?.("asset-user-a");
			await Promise.resolve();
		});
		await waitFor(() => fetchMock.mock.calls.length === 2);
		await act(async () => {
			flushSync(() => root.render(tree({ id: "user-b" }, true)));
			await deletion;
		});
		await waitFor(() => filename === "user-b.jpg");

		expect(fetchMock).toHaveBeenCalledTimes(3);
		expect(
			queryClient.getQueryData(
				MEDIA_QUERY_KEYS.assetsList(
					{ limit: 40 },
					{ id: "user-a" },
					MEDIA_ENDPOINT,
				),
			),
		).toBeUndefined();
		const userB = queryClient.getQueryData<{
			pages: Array<{ items: Array<{ filename: string }> }>;
		}>(
			MEDIA_QUERY_KEYS.assetsList(
				{ limit: 40 },
				{ id: "user-b" },
				MEDIA_ENDPOINT,
			),
		);
		expect(userB?.pages[0]?.items[0]?.filename).toBe("user-b.jpg");
	});

	it("refreshes every successful concurrent mutate call", async () => {
		let resolveFirst: ((response: Response) => void) | undefined;
		let resolveSecond: ((response: Response) => void) | undefined;
		const firstResponse = new Promise<Response>((resolve) => {
			resolveFirst = resolve;
		});
		const secondResponse = new Promise<Response>((resolve) => {
			resolveSecond = resolve;
		});
		fetchMock
			.mockResolvedValueOnce(responseFor("user-a"))
			.mockReturnValueOnce(firstResponse)
			.mockReturnValueOnce(secondResponse)
			.mockResolvedValueOnce(responseFor("user-a-updated"));
		const auth = createIdentityTestAuth(vi.fn(() => null));
		let filename: string | undefined;
		let deleteAsset: ReturnType<typeof useDeleteAsset>["mutate"] | undefined;

		function ListProbe() {
			filename = useAssets({ limit: 40 }).data?.pages[0]?.items[0]?.filename;
			return null;
		}

		function Probe({ showList }: { showList: boolean }) {
			deleteAsset = useDeleteAsset().mutate;
			return showList ? <ListProbe /> : null;
		}

		async function render(showList: boolean) {
			await act(async () => {
				root.render(
					<StackProvider
						stack={createMediaStack(queryClient)}
						auth={auth}
						initialIdentity={{ id: "user-a" }}
						overrides={{ media: {} }}
					>
						<QueryClientProvider client={queryClient}>
							<Probe showList={showList} />
						</QueryClientProvider>
					</StackProvider>,
				);
			});
		}

		await render(true);
		await waitFor(() => filename === "user-a.jpg");
		await render(false);
		await act(() => {
			deleteAsset?.("asset-one");
			deleteAsset?.("asset-two");
		});
		await waitFor(() => fetchMock.mock.calls.length === 3);
		resolveFirst?.(
			new Response(JSON.stringify({ success: true }), {
				status: 200,
				headers: { "content-type": "application/json" },
			}),
		);
		await waitFor(() => fetchMock.mock.calls.length === 4);
		resolveSecond?.(
			new Response(JSON.stringify({ message: "Rejected" }), {
				status: 500,
				headers: { "content-type": "application/json" },
			}),
		);
		await act(async () => {
			await Promise.resolve();
		});

		const current = queryClient.getQueryData<{
			pages: Array<{ items: Array<{ filename: string }> }>;
		}>(
			MEDIA_QUERY_KEYS.assetsList(
				{ limit: 40 },
				{ id: "user-a" },
				MEDIA_ENDPOINT,
			),
		);
		expect(current?.pages[0]?.items[0]?.filename).toBe("user-a-updated.jpg");
		expect(fetchMock).toHaveBeenCalledTimes(4);
	});

	it("keeps broad generated invalidation out of protected mutations", () => {
		expect("invalidates" in mediaResources.mediaAssets.mutations.create).toBe(
			false,
		);
		expect("invalidates" in mediaResources.mediaAssets.mutations.delete).toBe(
			false,
		);
		expect("invalidates" in mediaResources.mediaFolders.mutations.create).toBe(
			false,
		);
		expect("invalidates" in mediaResources.mediaFolders.mutations.delete).toBe(
			false,
		);
	});
});
