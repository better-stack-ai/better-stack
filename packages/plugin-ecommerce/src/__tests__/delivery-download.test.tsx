import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDownloadOrderDelivery } from "../client/hooks/use-orders";

const state = vi.hoisted(() => ({
	generation: 1,
	activeGeneration: 1,
	isPending: false,
	error: undefined as Error | undefined,
	queryClient: undefined as QueryClient | undefined,
}));
vi.mock("@btst/stack/context", () => ({
	useIdentity: () => ({
		identity: { id: "purchaser" },
		isPending: state.isPending,
		error: state.error,
	}),
	useStack: () => ({
		queryClient: state.queryClient,
		plugins: {
			ecommerce: {
				api: {
					browserHeaders: { "x-browser": "public" },
					credentials: "include",
				},
			},
		},
	}),
	useIdentitySourceGeneration: () => state.generation,
	useIdentityGenerationGuard: () => (generation: number) =>
		generation === state.activeGeneration,
}));
vi.mock("../client/hooks/use-products", () => ({
	ecommerce: {},
	useEcommerceEndpoint: () => ({
		baseURL: "https://shop.example",
		basePath: "/api/data",
	}),
}));

function captureDownload() {
	let download!: ReturnType<typeof useDownloadOrderDelivery>;
	function Probe() {
		download = useDownloadOrderDelivery();
		return null;
	}
	renderToString(
		<QueryClientProvider client={state.queryClient!}>
			<Probe />
		</QueryClientProvider>,
	);
	return download.mutateAsync;
}

beforeEach(() => {
	state.generation = state.activeGeneration = 1;
	state.isPending = false;
	state.error = undefined;
	state.queryClient = new QueryClient({
		defaultOptions: { mutations: { retry: false } },
	});
});
afterEach(() => {
	state.queryClient?.clear();
	vi.unstubAllGlobals();
});

describe("protected delivery download", () => {
	it.each(["pending", "error"])(
		"does not request private bytes while identity resolution is %s",
		async (resolution) => {
			state.isPending = resolution === "pending";
			state.error =
				resolution === "error" ? new Error("Identity unavailable") : undefined;
			const fetch = vi.fn();
			vi.stubGlobal("fetch", fetch);
			await expect(
				captureDownload()({
					id: "order-1",
					grantId: "grant-1",
					token: "explicit-capability",
				}),
			).rejects.toThrow("Authorization changed");
			expect(fetch).not.toHaveBeenCalled();
		},
	);
	it("posts the explicit capability with configured credentials and preserves the attachment filename", async () => {
		const fetch = vi.fn().mockResolvedValue(
			new Response("Purchased content", {
				headers: {
					"content-disposition":
						"attachment; filename*=UTF-8''field%20guide.txt",
				},
			}),
		);
		vi.stubGlobal("fetch", fetch);
		const result = await captureDownload()({
			id: "order/1",
			grantId: "grant/1",
			token: "explicit-capability",
		});
		expect(fetch).toHaveBeenCalledWith(
			"https://shop.example/api/data/shop/orders/order%2F1/deliveries/grant%2F1/download",
			expect.objectContaining({
				method: "POST",
				credentials: "include",
				cache: "no-store",
				body: JSON.stringify({ token: "explicit-capability" }),
			}),
		);
		expect(
			new Headers(fetch.mock.calls[0]?.[1]?.headers).get("x-browser"),
		).toBe("public");
		expect(result.filename).toBe("field guide.txt");
		expect(await result.blob.text()).toBe("Purchased content");
	});
	it("rejects a pending private response when authorization changes before the bytes finish loading", async () => {
		let stream!: ReadableStreamDefaultController<Uint8Array>;
		const body = new ReadableStream<Uint8Array>({
			start(controller) {
				stream = controller;
			},
		});
		const fetch = vi.fn().mockResolvedValue(new Response(body));
		vi.stubGlobal("fetch", fetch);
		const pending = captureDownload()({ id: "order-1", grantId: "grant-1" });
		await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
		state.activeGeneration = 2;
		stream.enqueue(new TextEncoder().encode("Previous purchaser's content"));
		stream.close();
		await expect(pending).rejects.toThrow("Authorization changed");
	});
});
