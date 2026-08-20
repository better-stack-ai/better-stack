// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StackProvider } from "@btst/stack/context";
import { useRenameConversationForm } from "../client/hooks/chat-hooks";
import type { SerializedConversation } from "../types";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const conversation: SerializedConversation = {
	id: "conv-1",
	title: "Original",
	createdAt: new Date("2024-01-01").toISOString(),
	updatedAt: new Date("2024-01-02").toISOString(),
};

let container: HTMLDivElement;
let root: Root;
let queryClient: QueryClient;
let fetchMock: ReturnType<typeof vi.spyOn>;
let refresh: ReturnType<typeof vi.fn>;
let notify: {
	success: ReturnType<typeof vi.fn>;
	error: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
	queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	fetchMock = vi.spyOn(globalThis, "fetch" as any);
	refresh = vi.fn();
	notify = { success: vi.fn(), error: vi.fn() };
});

afterEach(async () => {
	await act(async () => root.unmount());
	container.remove();
	queryClient.clear();
	vi.restoreAllMocks();
});

function jsonResponse(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json" },
	});
}

async function renderProbe() {
	let captured: ReturnType<typeof useRenameConversationForm>;
	function Probe() {
		captured = useRenameConversationForm({ conversation });
		return null;
	}

	await act(async () => {
		root.render(
			<QueryClientProvider client={queryClient}>
				<StackProvider
					basePath="/pages"
					api={{ baseURL: "http://test.local", basePath: "/api/data" }}
					router={{ refresh }}
					overrides={{
						"ai-chat": {
							headers: { "x-chat-test": "forwarded" },
						},
					}}
					notify={notify}
				>
					<Probe />
				</StackProvider>
			</QueryClientProvider>,
		);
	});

	return () => captured!;
}

describe("useRenameConversationForm", () => {
	it("trims the title, forwards headers, refreshes, and notifies on success", async () => {
		fetchMock.mockResolvedValue(
			jsonResponse({ ...conversation, title: "Renamed" }),
		);
		const getForm = await renderProbe();

		await act(async () => {
			await getForm().submit({ title: "  Renamed  " });
		});

		const [url, init] = fetchMock.mock.calls[0] as [unknown, RequestInit];
		expect(String(url)).toContain("/api/data/chat/conversations/conv-1");
		expect(init.method).toBe("PUT");
		expect(JSON.parse(String(init.body))).toEqual({ title: "Renamed" });
		expect(new Headers(init.headers).get("x-chat-test")).toBe("forwarded");
		expect(notify.success).toHaveBeenCalledWith("Conversation renamed");
		expect(refresh).toHaveBeenCalledTimes(1);
	});

	it("keeps server validation errors on the title field without an error toast", async () => {
		fetchMock.mockResolvedValue(
			jsonResponse(
				{
					message: "[body.title] Title is required",
					code: "VALIDATION_ERROR",
					issues: [{ path: ["title"], message: "Title is required" }],
				},
				400,
			),
		);
		const getForm = await renderProbe();

		await act(async () => {
			await getForm().submit({ title: "   " });
		});

		expect(getForm().fieldErrors).toEqual({ title: "Title is required" });
		expect(notify.error).not.toHaveBeenCalled();
		expect(refresh).not.toHaveBeenCalled();
	});
});
