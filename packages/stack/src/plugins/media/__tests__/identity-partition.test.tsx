// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	StackProvider,
	type StackAuthProvider,
	useIdentity,
} from "@btst/stack/context";
import { MEDIA_QUERY_KEYS } from "../api/query-key-defs";
import { useAssets, useUploadAsset } from "../client/hooks/use-media";
import { mediaResources } from "../query-keys";

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
		const auth = {
			getIdentity: vi.fn(() => null),
		} satisfies StackAuthProvider;
		let filename: string | undefined;

		function Probe() {
			filename = useAssets({ limit: 40 }).data?.pages[0]?.items[0]?.filename;
			return null;
		}

		async function render(initialIdentity: { id: string }) {
			await act(async () => {
				root.render(
					<StackProvider
						basePath="/pages"
						api={{ baseURL: "http://test.local", basePath: "/api" }}
						auth={auth}
						initialIdentity={initialIdentity}
						overrides={{ media: { queryClient } }}
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
				MEDIA_QUERY_KEYS.assetsList({ limit: 40 }, { id: "user-a" }),
			),
		).toBeDefined();
		expect(
			queryClient.getQueryData(
				MEDIA_QUERY_KEYS.assetsList({ limit: 40 }, { id: "user-b" }),
			),
		).toBeDefined();
	});

	it("stops fetching and exposing data while identity refetch is unresolved", async () => {
		fetchMock
			.mockResolvedValueOnce(responseFor("user-a"))
			.mockResolvedValueOnce(responseFor("user-b"));
		let resolveIdentity: ((identity: { id: string }) => void) | undefined;
		const auth = {
			getIdentity: () =>
				new Promise<{ id: string }>((resolve) => {
					resolveIdentity = resolve;
				}),
		} satisfies StackAuthProvider;
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
					basePath="/pages"
					api={{ baseURL: "http://test.local", basePath: "/api" }}
					auth={auth}
					initialIdentity={{ id: "user-a" }}
					overrides={{ media: { queryClient } }}
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
		const auth = {
			getIdentity: vi.fn(() => null),
		} satisfies StackAuthProvider;
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
						basePath="/pages"
						api={{ baseURL: "http://test.local", basePath: "/api" }}
						auth={auth}
						initialIdentity={initialIdentity}
						overrides={{ media: { queryClient, imageCompression: false } }}
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
		}>(MEDIA_QUERY_KEYS.assetsList({ limit: 40 }, { id: "user-a" }));
		expect(userA?.pages[0]?.items[0]?.filename).toBe("user-a.jpg");
	});

	it("limits generated asset mutation refetches to active queries", () => {
		expect(mediaResources.mediaAssets.mutations.create.refetchType).toBe(
			"active",
		);
		expect(mediaResources.mediaAssets.mutations.delete.refetchType).toBe(
			"active",
		);
	});
});
