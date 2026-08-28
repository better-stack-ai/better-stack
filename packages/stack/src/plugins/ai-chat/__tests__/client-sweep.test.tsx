// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	StackProvider,
	type StackAuthProvider,
	type StackI18nProvider,
	type StackIdentity,
} from "@btst/stack/context";
import { defineAuthorization } from "@btst/stack/authorization";
import { createClientAuth } from "@btst/stack/authorization/client";
import { z } from "zod";
import { ChatInterface } from "../client/components/chat-interface";
import { ChatSidebar } from "../client/components/chat-sidebar";
import { ChatPage } from "../client/components/pages/chat-page.internal";
import type { SerializedConversation } from "../types";
import { aiChatPermissions } from "../permissions";

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
	useAiChatIdentityPartition: vi.fn(),
	chatLayout: vi.fn(),
}));

vi.mock("@ai-sdk/react", () => ({ useChat: mocks.useChat }));
vi.mock("../client/hooks/chat-hooks", () => ({
	useAiChatIdentityPartition: mocks.useAiChatIdentityPartition,
	useConversation: mocks.useConversation,
	useConversations: mocks.useConversations,
	useRenameConversationForm: mocks.useRenameConversationForm,
	useDeleteConversation: mocks.useDeleteConversation,
}));
vi.mock("../client/components/chat-input", () => ({
	ChatInput: ({
		placeholder,
		handleSubmit,
	}: {
		placeholder?: string;
		handleSubmit: (
			event: { preventDefault: () => void },
			files: Array<{ url: string; mediaType: string; filename: string }>,
		) => void;
	}) => (
		<div data-testid="chat-input">
			{placeholder}
			<button
				type="button"
				data-testid="chat-send"
				onClick={() =>
					handleSubmit({ preventDefault: () => {} }, [
						{
							url: "data:text/plain;base64,dGVzdA==",
							mediaType: "text/plain",
							filename: "test.txt",
						},
					])
				}
			>
				Send
			</button>
		</div>
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
	userId: "owner-1",
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
	mocks.useAiChatIdentityPartition.mockReturnValue(undefined);

	mocks.useChat.mockReturnValue({
		messages: [],
		sendMessage: vi.fn(),
		status: "ready",
		error: null,
		setMessages: vi.fn(),
		regenerate: vi.fn(),
		addToolOutput: vi.fn(),
		stop: vi.fn(),
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
		initialIdentity?: StackIdentity | null;
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
					initialIdentity={options.initialIdentity}
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

	it("gates authenticated controls with exact rendered owner facts", async () => {
		const deleteRule = vi.fn(
			({
				identity,
				facts,
			}: {
				identity: { id: string } | null;
				facts: { ownerId?: string };
			}) => identity?.id === facts.ownerId,
		);
		const authorization = defineAuthorization({
			identity: z.object({ id: z.string() }),
			permissions: [aiChatPermissions] as const,
			rules: ({ aiChat }) => [
				aiChat.conversation.read.allow(),
				aiChat.conversation.create.when(() => false),
				aiChat.conversation.update.when(() => false),
				aiChat.conversation.delete.when(deleteRule),
			],
		});
		const identity = { id: "owner-1" };
		const auth = createClientAuth({
			authorization,
			getIdentity: () => identity,
		});

		await render(<ChatSidebar />, { auth, initialIdentity: identity });
		expect(document.body.textContent).not.toContain("New chat");

		await openConversationMenu();
		expect(menuItem("Rename")).toBeUndefined();
		expect(menuItem("Delete")).toBeTruthy();
		expect(deleteRule).toHaveBeenCalledWith(
			expect.objectContaining({
				identity,
				facts: {
					conversationId: conversation.id,
					exists: true,
					ownerId: conversation.userId,
				},
			}),
		);
	});

	it("requires the exact send rule in addition to stream start", async () => {
		const authorization = defineAuthorization({
			identity: z.object({ id: z.string() }),
			permissions: [aiChatPermissions] as const,
			rules: ({ aiChat }) => [
				aiChat.stream.start.allow(),
				aiChat.conversation.create.allow(),
				aiChat.message.send.when(() => false),
			],
		});
		const identity = { id: "owner-1" };
		const auth = createClientAuth({
			authorization,
			getIdentity: () => identity,
		});

		await render(<ChatInterface />, { auth, initialIdentity: identity });

		expect(container.querySelector('[data-testid="chat-input"]')).toBeNull();
	});

	it("uses the persisted user message hint for retry checks", async () => {
		const retryRule = vi.fn(() => true);
		const authorization = defineAuthorization({
			identity: z.object({ id: z.string() }),
			permissions: [aiChatPermissions] as const,
			rules: ({ aiChat }) => [
				aiChat.stream.start.allow(),
				aiChat.message.send.allow(),
				aiChat.message.edit.allow(),
				aiChat.message.retry.when(retryRule),
				aiChat.attachment.send.allow(),
			],
		});
		const identity = { id: "owner-1" };
		const auth = createClientAuth({
			authorization,
			getIdentity: () => identity,
		});
		mocks.useChat.mockReturnValue({
			messages: [
				{ id: "user-1", role: "user", parts: [{ type: "text", text: "Hi" }] },
				{
					id: "assistant-1",
					role: "assistant",
					parts: [{ type: "text", text: "Hello" }],
				},
			],
			sendMessage: vi.fn(),
			status: "ready",
			error: null,
			setMessages: vi.fn(),
			regenerate: vi.fn(),
			addToolOutput: vi.fn(),
			stop: vi.fn(),
		});
		mocks.useConversation.mockReturnValue({
			conversation: { ...conversation, messages: [] },
			isLoading: false,
			error: null,
			refetch: vi.fn(),
		});

		await render(<ChatInterface id={conversation.id} />, {
			auth,
			initialIdentity: identity,
		});

		expect(retryRule).toHaveBeenCalledWith(
			expect.objectContaining({
				facts: expect.objectContaining({ messageId: "user-1" }),
			}),
		);
	});

	it("stops and clears an active chat when the identity partition changes", async () => {
		const stop = vi.fn();
		const setMessages = vi.fn();
		let firstOnFinish: (() => Promise<void>) | undefined;
		mocks.useChat.mockImplementation((options) => {
			firstOnFinish ??= options.onFinish;
			return {
				messages: [],
				sendMessage: vi.fn().mockResolvedValue(undefined),
				status: "streaming",
				error: null,
				setMessages,
				regenerate: vi.fn(),
				addToolOutput: vi.fn(),
				stop,
			};
		});
		mocks.useAiChatIdentityPartition.mockReturnValue({ id: "owner-1" });
		await render(<ChatInterface />);
		await act(async () => {
			container
				.querySelector<HTMLButtonElement>('[data-testid="chat-send"]')
				?.click();
		});

		mocks.useAiChatIdentityPartition.mockReturnValue({ id: "viewer-1" });
		await render(<ChatInterface />);
		const invalidate = vi.spyOn(queryClient, "invalidateQueries");
		await act(async () => firstOnFinish?.());

		expect(stop).toHaveBeenCalledOnce();
		expect(setMessages).toHaveBeenCalledWith([]);
		expect(invalidate).not.toHaveBeenCalled();
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
