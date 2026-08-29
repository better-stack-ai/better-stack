// @vitest-environment jsdom
import { QueryClient } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StackProvider } from "@btst/stack/context";
import { createClientStack } from "@btst/stack/client";
import {
	useDeleteConversation,
	useRenameConversationForm,
} from "../client/hooks/chat-hooks";
import { aiChatClientPlugin } from "../client/plugin";
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

function createTestStack() {
	return createClientStack({
		api: { baseURL: "http://app.local", basePath: "/api/data" },
		site: { baseURL: "http://test.local", basePath: "/pages" },
		queryClient,
		plugins: { aiChat: aiChatClientPlugin() },
		endpoints: {
			aiChat: {
				api: {
					baseURL: "https://chat.example.com",
					basePath: "/btst",
					browserHeaders: { "x-chat-test": "forwarded" },
					credentials: "omit",
				},
			},
		},
	});
}

async function renderRenameProbe() {
	let captured: ReturnType<typeof useRenameConversationForm>;
	function Probe() {
		captured = useRenameConversationForm({ conversation });
		return null;
	}

	await act(async () => {
		root.render(
			<StackProvider
				stack={createTestStack()}
				router={{ refresh }}
				notify={notify}
			>
				<Probe />
			</StackProvider>,
		);
	});

	return () => captured!;
}

async function renderDeleteProbe() {
	let captured: ReturnType<typeof useDeleteConversation>;
	function Probe() {
		captured = useDeleteConversation();
		return null;
	}

	await act(async () => {
		root.render(
			<StackProvider
				stack={createTestStack()}
				router={{ refresh }}
				notify={notify}
			>
				<Probe />
			</StackProvider>,
		);
	});

	return () => captured!;
}

describe("useRenameConversationForm", () => {
	it("trims the title, forwards headers, refreshes current identity data, and notifies on success", async () => {
		fetchMock.mockResolvedValue(
			jsonResponse({ ...conversation, title: "Renamed" }),
		);
		const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");
		const getForm = await renderRenameProbe();

		await act(async () => {
			await getForm().submit({ title: "  Renamed  " });
		});

		const [url, init] = fetchMock.mock.calls[0] as [unknown, RequestInit];
		expect(String(url)).toContain(
			"https://chat.example.com/btst/chat/conversations/conv-1",
		);
		expect(init.method).toBe("PUT");
		expect(init.credentials).toBe("omit");
		expect(JSON.parse(String(init.body))).toEqual({ title: "Renamed" });
		expect(new Headers(init.headers).get("x-chat-test")).toBe("forwarded");
		expect(notify.success).toHaveBeenCalledWith("Conversation renamed");
		expect(invalidateQueries).toHaveBeenCalledTimes(1);
		expect(invalidateQueries).toHaveBeenCalledWith(
			expect.objectContaining({
				queryKey: ["conversations"],
				refetchType: "all",
			}),
		);
		expect(refresh).not.toHaveBeenCalled();
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
		const getForm = await renderRenameProbe();

		await act(async () => {
			await getForm().submit({ title: "   " });
		});

		expect(getForm().fieldErrors).toEqual({ title: "Title is required" });
		expect(notify.error).not.toHaveBeenCalled();
		expect(refresh).not.toHaveBeenCalled();
	});
});

describe("useDeleteConversation", () => {
	it("refreshes the conversation list without refetching the deleted active detail", async () => {
		fetchMock.mockResolvedValue(jsonResponse({ success: true }));
		const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");
		const getMutation = await renderDeleteProbe();

		await act(async () => {
			await getMutation().mutateAsync({ id: conversation.id });
		});

		expect(invalidateQueries).toHaveBeenCalledOnce();
		expect(invalidateQueries).toHaveBeenCalledWith(
			expect.objectContaining({
				queryKey: ["conversations", "list"],
				refetchType: "all",
			}),
		);
	});
});
