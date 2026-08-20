// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	StackProvider,
	type StackAuthProvider,
	type StackI18nProvider,
} from "@btst/stack/context";
import { ChatInterface } from "../client/components/chat-interface";
import { ChatSidebar } from "../client/components/chat-sidebar";
import { ChatPage } from "../client/components/pages/chat-page.internal";
import type { SerializedConversation } from "../types";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as any).ResizeObserver ??= class {
	observe() {}
	unobserve() {}
	disconnect() {}
};
Element.prototype.scrollIntoView ??= () => {};

const mocks = vi.hoisted(() => ({
	useChat: vi.fn(),
	useConversation: vi.fn(),
	useConversations: vi.fn(),
	useRenameConversationForm: vi.fn(),
	useDeleteConversation: vi.fn(),
	chatLayout: vi.fn(),
}));

vi.mock("@ai-sdk/react", () => ({ useChat: mocks.useChat }));
vi.mock("../client/hooks/chat-hooks", () => ({
	useConversation: mocks.useConversation,
	useConversations: mocks.useConversations,
	useRenameConversationForm: mocks.useRenameConversationForm,
	useDeleteConversation: mocks.useDeleteConversation,
}));
vi.mock("../client/components/chat-input", () => ({
	ChatInput: ({ placeholder }: { placeholder?: string }) => (
		<div data-testid="chat-input">{placeholder}</div>
	),
}));
vi.mock("../client/components/chat-message", () => ({
	ChatMessage: () => <div data-testid="chat-message" />,
}));
vi.mock("../client/components/chat-layout", () => ({
	ChatLayout: (props: unknown) => {
		mocks.chatLayout(props);
		return <div data-testid="chat-layout" />;
	},
}));

const conversation: SerializedConversation = {
	id: "conv-1",
	title: "First conversation",
	createdAt: new Date("2024-01-01").toISOString(),
	updatedAt: new Date("2024-01-02").toISOString(),
};

let container: HTMLDivElement;
let root: Root;
let queryClient: QueryClient;
let deleteConversation: ReturnType<typeof vi.fn>;

beforeEach(() => {
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
	queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	deleteConversation = vi.fn().mockResolvedValue({ success: true });

	mocks.useChat.mockReturnValue({
		messages: [],
		sendMessage: vi.fn(),
		status: "ready",
		error: null,
		setMessages: vi.fn(),
		regenerate: vi.fn(),
		addToolOutput: vi.fn(),
	});
	mocks.useConversation.mockReturnValue({
		conversation: null,
		isLoading: false,
		error: null,
		refetch: vi.fn(),
	});
	mocks.useConversations.mockReturnValue({
		conversations: [conversation],
		isLoading: false,
		error: null,
		refetch: vi.fn(),
	});
	mocks.useRenameConversationForm.mockReturnValue({
		submit: vi.fn().mockResolvedValue(conversation),
		isSubmitting: false,
		error: null,
		fieldErrors: {},
		clearErrors: vi.fn(),
	});
	mocks.useDeleteConversation.mockReturnValue({
		mutateAsync: deleteConversation,
		isPending: false,
	});
});

afterEach(async () => {
	await act(async () => root.unmount());
	container.remove();
	document.body.innerHTML = "";
	queryClient.clear();
	vi.clearAllMocks();
});

const router = () => ({
	navigate: vi.fn(),
	getSearchParams: () => new URLSearchParams(),
	setSearchParams: vi.fn(),
});

function overrides(
	mode: "authenticated" | "public" = "authenticated",
	localization?: Record<string, string>,
) {
	return {
		mode,
		localization,
	};
}

async function render(
	ui: React.ReactElement,
	options: {
		auth?: StackAuthProvider;
		i18n?: StackI18nProvider;
		notify?: {
			success: ReturnType<typeof vi.fn>;
			error: ReturnType<typeof vi.fn>;
		};
		mode?: "authenticated" | "public";
		localization?: Record<string, string>;
	} = {},
) {
	await act(async () => {
		root.render(
			<QueryClientProvider client={queryClient}>
				<StackProvider
					basePath="/pages"
					api={{ baseURL: "http://test.local", basePath: "/api/data" }}
					router={router()}
					overrides={{
						"ai-chat": overrides(options.mode, options.localization),
					}}
					auth={options.auth}
					i18n={options.i18n}
					notify={options.notify}
				>
					{ui}
				</StackProvider>
			</QueryClientProvider>,
		);
		await Promise.resolve();
	});
}

async function openConversationMenu() {
	const trigger = container.querySelector<HTMLButtonElement>(
		'button[aria-label="Conversation actions"]',
	)!;
	await act(async () => {
		trigger.dispatchEvent(
			new MouseEvent("pointerdown", { bubbles: true, button: 0 }),
		);
	});
}

function menuItem(text: string) {
	return Array.from(
		document.querySelectorAll<HTMLElement>("[role=menuitem]"),
	).find((item) => item.textContent?.includes(text));
}

describe("AI Chat permissions", () => {
	it("keeps public chat writable when an auth provider denies every action", async () => {
		const can = vi.fn(() => false);
		await render(<ChatInterface />, {
			mode: "public",
			auth: { getIdentity: () => null, can },
		});

		expect(container.querySelector('[data-testid="chat-input"]')).toBeTruthy();
	});

	it("gates authenticated create and per-conversation controls independently", async () => {
		const can = vi.fn(
			({ action }: { action: string }) =>
				action === "read" || action === "delete",
		);
		const auth: StackAuthProvider = {
			getIdentity: () => ({ id: "viewer" }),
			can,
		};

		await render(<ChatSidebar />, { auth });
		expect(document.body.textContent).not.toContain("New chat");

		await openConversationMenu();
		expect(menuItem("Rename")).toBeUndefined();
		expect(menuItem("Delete")).toBeTruthy();
		expect(can).toHaveBeenCalledWith(
			expect.objectContaining({
				resource: "ai-chat:conversation",
				action: "delete",
				params: { id: conversation.id },
			}),
		);
	});
});

describe("AI Chat forms, notifications, and i18n", () => {
	it("renders rename field errors inline through the i18n catalog", async () => {
		mocks.useRenameConversationForm.mockReturnValue({
			submit: vi.fn(),
			isSubmitting: false,
			error: new Error("Validation failed"),
			fieldErrors: { title: "Title is required" },
			clearErrors: vi.fn(),
		});
		await render(<ChatSidebar />, {
			i18n: {
				translate: (key, fallback) =>
					key === "aiChat.conversation.titleRequired"
						? "Titel erforderlich"
						: fallback,
			},
		});

		await openConversationMenu();
		await act(async () => menuItem("Rename")?.click());
		expect(document.body.textContent).toContain("Titel erforderlich");
	});

	it("lets legacy localization overrides win over the i18n catalog", async () => {
		await render(<ChatSidebar />, {
			i18n: { translate: () => "Catalog new chat" },
			localization: { SIDEBAR_NEW_CHAT: "Legacy new chat" },
		});

		expect(document.body.textContent).toContain("Legacy new chat");
		expect(document.body.textContent).not.toContain("Catalog new chat");
	});

	it("routes delete success through the notify provider", async () => {
		const notify = { success: vi.fn(), error: vi.fn() };
		await render(<ChatSidebar />, { notify });

		await openConversationMenu();
		await act(async () => menuItem("Delete")?.click());
		const confirm = Array.from(
			document.querySelectorAll<HTMLButtonElement>("button"),
		).find((button) => button.textContent === "Delete");
		await act(async () => confirm?.click());

		expect(deleteConversation).toHaveBeenCalledWith({ id: conversation.id });
		expect(notify.success).toHaveBeenCalledWith("Conversation deleted");
		expect(notify.error).not.toHaveBeenCalled();
	});

	it("does not expose raw delete errors through notifications", async () => {
		const notify = { success: vi.fn(), error: vi.fn() };
		deleteConversation.mockRejectedValueOnce(
			new Error("internal database detail"),
		);
		await render(<ChatSidebar />, { notify });

		await openConversationMenu();
		await act(async () => menuItem("Delete")?.click());
		const confirm = Array.from(
			document.querySelectorAll<HTMLButtonElement>("button"),
		).find((button) => button.textContent === "Delete");
		await act(async () => confirm?.click());

		expect(notify.error).toHaveBeenCalledWith("Failed to delete conversation");
		expect(notify.error).not.toHaveBeenCalledWith("internal database detail");
	});
});

describe("AI Chat route lifecycle", () => {
	it("runs the conversation render hook", async () => {
		const onRouteRender = vi.fn();
		await act(async () => {
			root.render(
				<StackProvider
					basePath="/pages"
					router={router()}
					overrides={{
						"ai-chat": {
							...overrides(),
							onRouteRender,
						},
					}}
				>
					<ChatPage conversationId="conv-1" />
				</StackProvider>,
			);
			await Promise.resolve();
		});

		expect(onRouteRender).toHaveBeenCalledWith(
			"chatConversation",
			expect.objectContaining({ path: "/chat/conv-1" }),
		);
	});
});
