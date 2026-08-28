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
import { ChatPageComponent } from "../client/components/pages/chat-page";
import type { SerializedConversation } from "../types";
import { aiChatPermissions } from "../permissions";
import { aiChatIdentityKey } from "../query-keys";

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
	pageAIContext: undefined as
		| {
				pageDescription?: string;
				routeName?: string;
				clientTools?: Record<string, (input: unknown) => Promise<unknown>>;
		  }
		| undefined,
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
		input,
		handleInputChange,
		attachedFiles,
		onFilesAttached,
	}: {
		placeholder?: string;
		input: string;
		handleInputChange: (event: { target: { value: string } }) => void;
		attachedFiles: Array<{ url: string; mediaType: string; filename: string }>;
		onFilesAttached: (
			files: Array<{ url: string; mediaType: string; filename: string }>,
		) => void;
		handleSubmit: (
			event: { preventDefault: () => void },
			files: Array<{ url: string; mediaType: string; filename: string }>,
		) => void;
	}) => (
		<div data-testid="chat-input">
			{placeholder}
			<span data-testid="chat-draft">{input}</span>
			<span data-testid="chat-files">
				{attachedFiles.map((file) => file.filename).join(",")}
			</span>
			<button
				type="button"
				data-testid="chat-set-draft"
				onClick={() =>
					handleInputChange({ target: { value: "private draft" } })
				}
			>
				Draft
			</button>
			<button
				type="button"
				data-testid="chat-attach"
				onClick={() =>
					onFilesAttached([
						{
							url: "https://example.com/private.txt",
							mediaType: "text/plain",
							filename: "private.txt",
						},
					])
				}
			>
				Attach
			</button>
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
vi.mock("../client/context/page-ai-context", () => ({
	usePageAIContext: () => mocks.pageAIContext,
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
	window.history.replaceState({}, "", "/");
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
	queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	deleteConversation = vi.fn().mockResolvedValue({ success: true });
	mocks.useAiChatIdentityPartition.mockReturnValue("anonymous");
	mocks.pageAIContext = undefined;

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

	it("keeps one stable public chat instance across a send and rerender", async () => {
		let retainedId: string | undefined;
		let retainedSend: ReturnType<typeof vi.fn> | undefined;
		let chatInstances = 0;
		mocks.useChat.mockImplementation((options) => {
			if (retainedId !== options.id) {
				retainedId = options.id;
				retainedSend = vi.fn();
				chatInstances += 1;
			}
			return {
				messages: [],
				sendMessage: retainedSend,
				status: "ready",
				error: null,
				setMessages: vi.fn(),
				regenerate: vi.fn(),
				addToolOutput: vi.fn(),
				stop: vi.fn(),
			};
		});

		await render(<ChatInterface />, { mode: "public" });
		await act(async () => {
			container
				.querySelector<HTMLButtonElement>('[data-testid="chat-send"]')
				?.click();
		});
		await render(<ChatInterface />, { mode: "public" });

		expect(retainedId).toMatch(/:public$/);
		expect(chatInstances).toBe(1);
		expect(retainedSend).toHaveBeenCalledOnce();
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

	it("reconciles streamed client message ids with authoritative persistence ids", async () => {
		const clientMessages = [
			{
				id: "client-user",
				role: "user" as const,
				parts: [{ type: "text" as const, text: "Hi" }],
			},
			{
				id: "client-assistant",
				role: "assistant" as const,
				parts: [{ type: "text" as const, text: "Hello" }],
			},
		];
		const setMessages = vi.fn();
		let onFinish: (() => Promise<void>) | undefined;
		let onError: ((error: Error) => void) | undefined;
		mocks.useChat.mockImplementation((options) => {
			onFinish = options.onFinish;
			onError = options.onError;
			return {
				messages: clientMessages,
				sendMessage: vi.fn(),
				status: "ready",
				error: null,
				setMessages,
				regenerate: vi.fn(),
				addToolOutput: vi.fn(),
				stop: vi.fn(),
			};
		});
		mocks.useAiChatIdentityPartition.mockReturnValue({
			id: "owner-1",
			role: "user",
		});
		vi.spyOn(queryClient, "fetchQuery").mockResolvedValue({
			...conversation,
			messages: [
				{
					id: "persisted-user",
					conversationId: conversation.id,
					role: "user",
					content: '[{"type":"text","text":"Hi"}]',
					createdAt: new Date().toISOString(),
				},
				{
					id: "persisted-assistant-tool-call",
					conversationId: conversation.id,
					role: "assistant",
					content: "[]",
					createdAt: new Date().toISOString(),
				},
				{
					id: "persisted-assistant-final",
					conversationId: conversation.id,
					role: "assistant",
					content: '[{"type":"text","text":"Hello"}]',
					createdAt: new Date().toISOString(),
				},
			],
		});

		await render(<ChatInterface id={conversation.id} />);
		await act(async () => {
			container
				.querySelector<HTMLButtonElement>('[data-testid="chat-send"]')
				?.click();
		});
		vi.spyOn(console, "error").mockImplementation(() => {});
		onError?.(new Error("provider stream failed"));
		await act(async () => onFinish?.());

		expect(setMessages).toHaveBeenCalledWith([
			{ ...clientMessages[0], id: "persisted-user" },
			clientMessages[1],
		]);
	});

	it("contains history sync failures and retries from authoritative history", async () => {
		const clientMessages = [
			{
				id: "client-user",
				role: "user" as const,
				parts: [{ type: "text" as const, text: "Hi" }],
			},
		];
		const setMessages = vi.fn();
		let onFinish: (() => Promise<void>) | undefined;
		mocks.useChat.mockImplementation((options) => {
			onFinish = options.onFinish;
			return {
				messages: clientMessages,
				sendMessage: vi.fn(),
				status: "ready",
				error: null,
				setMessages,
				regenerate: vi.fn(),
				addToolOutput: vi.fn(),
				stop: vi.fn(),
			};
		});
		mocks.useAiChatIdentityPartition.mockReturnValue({
			id: "owner-1",
			role: "user",
		});
		const persistedMessages = [
			{
				id: "persisted-user",
				conversationId: conversation.id,
				role: "user" as const,
				content: '[{"type":"text","text":"Hi"}]',
				createdAt: new Date().toISOString(),
			},
		];
		vi.spyOn(queryClient, "fetchQuery")
			.mockRejectedValueOnce(new Error("history unavailable"))
			.mockResolvedValue({ ...conversation, messages: persistedMessages });
		vi.spyOn(console, "error").mockImplementation(() => {});

		await render(<ChatInterface id={conversation.id} />);
		await act(async () => {
			container
				.querySelector<HTMLButtonElement>('[data-testid="chat-send"]')
				?.click();
		});
		await act(async () => {
			await expect(onFinish?.()).resolves.toBeUndefined();
		});

		expect(setMessages).toHaveBeenCalledWith([]);
		expect(container.textContent).toContain("Something went wrong");
		expect(container.querySelector('[data-testid="chat-input"]')).toBeNull();

		await act(async () => {
			container
				.querySelector<HTMLButtonElement>('[data-testid="chat-history-retry"]')
				?.click();
			await Promise.resolve();
		});

		expect(setMessages).toHaveBeenLastCalledWith([
			{
				id: "persisted-user",
				role: "user",
				parts: [{ type: "text", text: "Hi" }],
			},
		]);
		expect(container.textContent).not.toContain("Something went wrong");
		expect(container.querySelector('[data-testid="chat-input"]')).toBeTruthy();
	});

	it("discovers a new authoritative conversation from the stream response header", async () => {
		const clientMessages = [
			{
				id: "client-user",
				role: "user" as const,
				parts: [{ type: "text" as const, text: "Hi" }],
			},
		];
		const setMessages = vi.fn();
		let sent = false;
		let chatOptions: any;
		mocks.useChat.mockImplementation((options) => {
			chatOptions = options;
			return {
				messages: sent ? clientMessages : [],
				sendMessage: vi.fn(() => {
					sent = true;
				}),
				status: "ready",
				error: null,
				setMessages,
				regenerate: vi.fn(),
				addToolOutput: vi.fn(),
				stop: vi.fn(),
			};
		});
		mocks.useAiChatIdentityPartition.mockReturnValue({
			id: "owner-1",
			role: "user",
		});
		const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response("stream", {
				headers: { "x-conversation-id": "persisted-conversation" },
			}),
		);
		vi.spyOn(queryClient, "fetchQuery").mockResolvedValue({
			...conversation,
			id: "persisted-conversation",
			messages: [
				{
					id: "persisted-user",
					conversationId: "persisted-conversation",
					role: "user",
					content: '[{"type":"text","text":"Hi"}]',
					createdAt: new Date().toISOString(),
				},
			],
		});

		await render(<ChatInterface />);
		await act(async () => {
			container
				.querySelector<HTMLButtonElement>('[data-testid="chat-send"]')
				?.click();
		});
		await render(<ChatInterface />);
		await act(async () => {
			await chatOptions.transport.fetch("http://test.local/chat", {});
			await chatOptions.onFinish();
		});

		expect(setMessages).toHaveBeenCalledWith([
			{ ...clientMessages[0], id: "persisted-user" },
		]);
		expect(window.location.pathname).toBe("/pages/chat/persisted-conversation");
		fetchMock.mockRestore();
	});

	it("does not bind a headerless new stream to unrelated cached history", async () => {
		const clientMessages = [
			{
				id: "client-user",
				role: "user" as const,
				parts: [{ type: "text" as const, text: "Hi" }],
			},
		];
		let sent = false;
		let chatOptions: any;
		const setMessages = vi.fn();
		mocks.useChat.mockImplementation((options) => {
			chatOptions = options;
			return {
				messages: sent ? clientMessages : [],
				sendMessage: vi.fn(() => {
					sent = true;
				}),
				status: "ready",
				error: null,
				setMessages,
				regenerate: vi.fn(),
				addToolOutput: vi.fn(),
				stop: vi.fn(),
			};
		});
		mocks.useAiChatIdentityPartition.mockReturnValue({
			id: "owner-1",
			role: "user",
		});
		const fetchDetail = vi.spyOn(queryClient, "fetchQuery");
		vi.spyOn(console, "error").mockImplementation(() => {});

		await render(<ChatInterface />);
		await act(async () => {
			container
				.querySelector<HTMLButtonElement>('[data-testid="chat-send"]')
				?.click();
		});
		await render(<ChatInterface />);
		await act(async () => chatOptions.onFinish());

		expect(window.location.pathname).toBe("/");
		expect(fetchDetail).not.toHaveBeenCalled();
		expect(setMessages).toHaveBeenCalledWith([]);
		expect(container.querySelector('[data-testid="chat-input"]')).toBeNull();
	});

	it("ignores a delayed conversation header across an A-to-B-to-A identity switch", async () => {
		let chatOptions: any;
		mocks.useChat.mockImplementation((options) => {
			chatOptions = options;
			return {
				messages: [],
				sendMessage: vi.fn(),
				status: "ready",
				error: null,
				setMessages: vi.fn(),
				regenerate: vi.fn(),
				addToolOutput: vi.fn(),
				stop: vi.fn(),
			};
		});
		const identityA = { id: "owner-1", role: "user" };
		const identityB = { id: "viewer-1", role: "user" };
		mocks.useAiChatIdentityPartition.mockReturnValue(identityA);
		let releaseFetch: (() => void) | undefined;
		const fetchMock = vi
			.spyOn(globalThis, "fetch")
			.mockImplementation(async () => {
				await new Promise<void>((resolve) => {
					releaseFetch = resolve;
				});
				return new Response("stream", {
					headers: { "x-conversation-id": "abandoned-conversation" },
				});
			});

		await render(<ChatInterface />);
		chatOptions.transport.prepareSendMessagesRequest({ messages: [] });
		const abandonedResponse = chatOptions.transport.fetch(
			"http://test.local/chat",
			{},
		);
		mocks.useAiChatIdentityPartition.mockReturnValue(identityB);
		await render(<ChatInterface />);
		mocks.useAiChatIdentityPartition.mockReturnValue(identityA);
		await render(<ChatInterface />);
		releaseFetch?.();
		await abandonedResponse;

		const freshRequest = chatOptions.transport.prepareSendMessagesRequest({
			messages: [],
		});
		expect(freshRequest.body.conversationId).toBeUndefined();
		fetchMock.mockRestore();
	});

	it("reconciles a post-switch stream in the current identity partition", async () => {
		const clientMessages = [
			{
				id: "client-user",
				role: "user" as const,
				parts: [{ type: "text" as const, text: "Hi" }],
			},
		];
		let chatOptions: any;
		mocks.useChat.mockImplementation((options) => {
			chatOptions = options;
			return {
				messages: clientMessages,
				sendMessage: vi.fn(),
				status: "ready",
				error: null,
				setMessages: vi.fn(),
				regenerate: vi.fn(),
				addToolOutput: vi.fn(),
				stop: vi.fn(),
			};
		});
		const identityA = { id: "owner-1", role: "user" };
		const identityB = { id: "viewer-1", role: "user" };
		mocks.useAiChatIdentityPartition.mockReturnValue(identityA);
		const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response("stream", {
				headers: { "x-conversation-id": "viewer-conversation" },
			}),
		);
		const fetchDetail = vi.spyOn(queryClient, "fetchQuery").mockResolvedValue({
			...conversation,
			id: "viewer-conversation",
			userId: identityB.id,
			messages: [
				{
					id: "persisted-user",
					conversationId: "viewer-conversation",
					role: "user",
					content: '[{"type":"text","text":"Hi"}]',
					createdAt: new Date().toISOString(),
				},
			],
		});

		await render(<ChatInterface />);
		mocks.useAiChatIdentityPartition.mockReturnValue(identityB);
		await render(<ChatInterface />);
		chatOptions.transport.prepareSendMessagesRequest({
			messages: clientMessages,
		});
		await chatOptions.transport.fetch("http://test.local/chat", {});
		await chatOptions.onFinish();

		const detailQueryKey = fetchDetail.mock.calls[0]?.[0].queryKey;
		expect(detailQueryKey).toEqual(
			expect.arrayContaining([{ identity: aiChatIdentityKey(identityB) }]),
		);
		expect(detailQueryKey).not.toEqual(
			expect.arrayContaining([{ identity: aiChatIdentityKey(identityA) }]),
		);
		fetchMock.mockRestore();
	});

	it("keeps the routed conversation id after an authorized identity switch", async () => {
		let chatOptions: any;
		mocks.useChat.mockImplementation((options) => {
			chatOptions = options;
			return {
				messages: [],
				sendMessage: vi.fn(),
				status: "ready",
				error: null,
				setMessages: vi.fn(),
				regenerate: vi.fn(),
				addToolOutput: vi.fn(),
				stop: vi.fn(),
			};
		});
		mocks.useAiChatIdentityPartition.mockReturnValue({
			id: "owner-1",
			role: "user",
		});
		await render(<ChatInterface id={conversation.id} />);

		mocks.useAiChatIdentityPartition.mockReturnValue({
			id: "admin-1",
			role: "admin",
		});
		await render(<ChatInterface id={conversation.id} />);
		const request = chatOptions.transport.prepareSendMessagesRequest({
			messages: [],
		});

		expect(request.body.conversationId).toBe(conversation.id);
	});

	it("does not let a stale finish consume the current identity request", async () => {
		const clientMessages = [
			{
				id: "client-user",
				role: "user" as const,
				parts: [{ type: "text" as const, text: "Hi" }],
			},
		];
		let retainedOptions: any;
		let retainedId: string | undefined;
		mocks.useChat.mockImplementation((options) => {
			if (!retainedOptions || retainedId !== options.id) {
				retainedOptions = options;
				retainedId = options.id;
			}
			return {
				messages: clientMessages,
				sendMessage: vi.fn(),
				status: "streaming",
				error: null,
				setMessages: vi.fn(),
				regenerate: vi.fn(),
				addToolOutput: vi.fn(),
				stop: vi.fn(),
			};
		});
		mocks.useAiChatIdentityPartition.mockReturnValue({
			id: "owner-1",
			role: "user",
		});
		await render(<ChatInterface id={conversation.id} />);
		const staleFinish = retainedOptions.onFinish;

		mocks.useAiChatIdentityPartition.mockReturnValue({
			id: "viewer-1",
			role: "user",
		});
		await render(<ChatInterface id={conversation.id} />);
		retainedOptions.transport.prepareSendMessagesRequest({
			messages: clientMessages,
		});
		const fetchDetail = vi.spyOn(queryClient, "fetchQuery").mockResolvedValue({
			...conversation,
			userId: "viewer-1",
			messages: [
				{
					id: "persisted-user",
					conversationId: conversation.id,
					role: "user",
					content: '[{"type":"text","text":"Hi"}]',
					createdAt: new Date().toISOString(),
				},
			],
		});

		await staleFinish();
		expect(fetchDetail).not.toHaveBeenCalled();
		await retainedOptions.onFinish();
		expect(fetchDetail).toHaveBeenCalledOnce();
	});

	it("lets the final automatic tool request own async stream reconciliation", async () => {
		const clientMessages = [
			{
				id: "client-user",
				role: "user" as const,
				parts: [{ type: "text" as const, text: "Hi" }],
			},
		];
		const setMessages = vi.fn();
		let chatOptions: any;
		mocks.useChat.mockImplementation((options) => {
			chatOptions = options;
			return {
				messages: clientMessages,
				sendMessage: vi.fn(),
				status: "ready",
				error: null,
				setMessages,
				regenerate: vi.fn(),
				addToolOutput: vi.fn(),
				stop: vi.fn(),
			};
		});
		mocks.useAiChatIdentityPartition.mockReturnValue({
			id: "owner-1",
			role: "user",
		});
		let releaseFirstInvalidation: (() => void) | undefined;
		vi.spyOn(queryClient, "invalidateQueries")
			.mockImplementationOnce(
				() =>
					new Promise<void>((resolve) => {
						releaseFirstInvalidation = resolve;
					}),
			)
			.mockResolvedValue(undefined);
		const fetchDetail = vi.spyOn(queryClient, "fetchQuery").mockResolvedValue({
			...conversation,
			messages: [
				{
					id: "persisted-user",
					conversationId: conversation.id,
					role: "user",
					content: '[{"type":"text","text":"Hi"}]',
					createdAt: new Date().toISOString(),
				},
			],
		});

		await render(<ChatInterface id={conversation.id} />);
		chatOptions.transport.prepareSendMessagesRequest({
			messages: clientMessages,
		});
		const firstFinish = chatOptions.onFinish();
		await Promise.resolve();
		chatOptions.transport.prepareSendMessagesRequest({
			messages: clientMessages,
		});
		releaseFirstInvalidation?.();
		await firstFinish;
		expect(fetchDetail).not.toHaveBeenCalled();

		await chatOptions.onFinish();
		expect(fetchDetail).toHaveBeenCalledOnce();
	});

	it("drops a stale tool result across an A-to-B-to-A identity switch", async () => {
		let finishTool: ((result: unknown) => void) | undefined;
		const toolHandler = vi.fn(
			() =>
				new Promise<unknown>((resolve) => {
					finishTool = resolve;
				}),
		);
		mocks.pageAIContext = {
			pageDescription: "Tool page",
			routeName: "tool-page",
			clientTools: { inspect: toolHandler },
		};
		const addToolOutput = vi.fn();
		let chatOptions: any;
		mocks.useChat.mockImplementation((options) => {
			chatOptions = options;
			return {
				messages: [],
				sendMessage: vi.fn(),
				status: "streaming",
				error: null,
				setMessages: vi.fn(),
				regenerate: vi.fn(),
				addToolOutput,
				stop: vi.fn(),
			};
		});
		mocks.useAiChatIdentityPartition.mockReturnValue({
			id: "owner-1",
			role: "user",
		});
		await render(<ChatInterface />);
		chatOptions.transport.prepareSendMessagesRequest({ messages: [] });
		const toolCall = chatOptions.onToolCall({
			toolCall: {
				toolName: "inspect",
				toolCallId: "tool-1",
				input: { secret: true },
			},
		});

		mocks.useAiChatIdentityPartition.mockReturnValue({
			id: "viewer-1",
			role: "user",
		});
		await render(<ChatInterface />);
		mocks.useAiChatIdentityPartition.mockReturnValue({
			id: "owner-1",
			role: "user",
		});
		await render(<ChatInterface />);
		await act(async () => {
			finishTool?.({ sensitive: true });
			await toolCall;
		});

		expect(addToolOutput).not.toHaveBeenCalled();
	});

	it("does not start a buffered old tool callback after an identity switch", async () => {
		const toolHandler = vi.fn(async () => ({ sensitive: true }));
		mocks.pageAIContext = {
			pageDescription: "Tool page",
			routeName: "tool-page",
			clientTools: { inspect: toolHandler },
		};
		const addToolOutput = vi.fn();
		let chatOptions: any;
		mocks.useChat.mockImplementation((options) => {
			chatOptions = options;
			return {
				messages: [],
				sendMessage: vi.fn(),
				status: "streaming",
				error: null,
				setMessages: vi.fn(),
				regenerate: vi.fn(),
				addToolOutput,
				stop: vi.fn(),
			};
		});
		const identityA = { id: "owner-1", role: "user" };
		const identityB = { id: "viewer-1", role: "user" };
		mocks.useAiChatIdentityPartition.mockReturnValue(identityA);
		await render(<ChatInterface />);
		chatOptions.transport.prepareSendMessagesRequest({ messages: [] });
		const bufferedOldToolCall = chatOptions.onToolCall;

		mocks.useAiChatIdentityPartition.mockReturnValue(identityB);
		await render(<ChatInterface />);
		mocks.useAiChatIdentityPartition.mockReturnValue(identityA);
		await render(<ChatInterface />);
		chatOptions.transport.prepareSendMessagesRequest({ messages: [] });
		await bufferedOldToolCall({
			toolCall: {
				toolName: "inspect",
				toolCallId: "old-tool",
				input: { secret: true },
			},
		});

		expect(toolHandler).not.toHaveBeenCalled();
		expect(addToolOutput).not.toHaveBeenCalled();
	});

	it("runs a legitimate tool callback on the retained post-switch chat", async () => {
		const toolHandler = vi.fn(async () => ({ current: true }));
		mocks.pageAIContext = {
			pageDescription: "Tool page",
			routeName: "tool-page",
			clientTools: { inspect: toolHandler },
		};
		const addToolOutput = vi.fn();
		let retainedOptions: any;
		let retainedId: string | undefined;
		mocks.useChat.mockImplementation((options) => {
			if (!retainedOptions || retainedId !== options.id) {
				retainedOptions = options;
				retainedId = options.id;
			}
			return {
				messages: [],
				sendMessage: vi.fn(),
				status: "streaming",
				error: null,
				setMessages: vi.fn(),
				regenerate: vi.fn(),
				addToolOutput,
				stop: vi.fn(),
			};
		});
		mocks.useAiChatIdentityPartition.mockReturnValue({
			id: "owner-1",
			role: "user",
		});
		await render(<ChatInterface />);

		mocks.useAiChatIdentityPartition.mockReturnValue({
			id: "viewer-1",
			role: "user",
		});
		await render(<ChatInterface />);
		retainedOptions.transport.prepareSendMessagesRequest({ messages: [] });
		await retainedOptions.onToolCall({
			toolCall: {
				toolName: "inspect",
				toolCallId: "current-tool",
				input: { current: true },
			},
		});

		expect(toolHandler).toHaveBeenCalledOnce();
		expect(addToolOutput).toHaveBeenCalledWith(
			expect.objectContaining({
				toolCallId: "current-tool",
				output: { current: true },
			}),
		);
	});

	it("stops and clears an active chat when the identity partition changes", async () => {
		const stop = vi.fn();
		const setMessages = vi.fn();
		let rejectSend: ((error: Error) => void) | undefined;
		let firstOnFinish: (() => Promise<void>) | undefined;
		mocks.useChat.mockImplementation((options) => {
			firstOnFinish ??= options.onFinish;
			return {
				messages: [],
				sendMessage: vi.fn(
					() =>
						new Promise<void>((_resolve, reject) => {
							rejectSend = reject;
						}),
				),
				status: "streaming",
				error: null,
				setMessages,
				regenerate: vi.fn(),
				addToolOutput: vi.fn(),
				stop,
			};
		});
		mocks.useAiChatIdentityPartition.mockReturnValue({
			id: "owner-1",
			role: "user",
		});
		await render(<ChatInterface />);
		await act(async () => {
			container
				.querySelector<HTMLButtonElement>('[data-testid="chat-set-draft"]')
				?.click();
			container
				.querySelector<HTMLButtonElement>('[data-testid="chat-attach"]')
				?.click();
		});
		expect(
			container.querySelector('[data-testid="chat-draft"]')?.textContent,
		).toBe("private draft");
		expect(
			container.querySelector('[data-testid="chat-files"]')?.textContent,
		).toBe("private.txt");
		await act(async () => {
			container
				.querySelector<HTMLButtonElement>('[data-testid="chat-send"]')
				?.click();
		});

		mocks.useAiChatIdentityPartition.mockReturnValue({
			id: "viewer-1",
			role: "user",
		});
		await render(<ChatInterface />);
		await act(async () => {
			rejectSend?.(new Error("old identity stream stopped"));
			await Promise.resolve();
		});
		const invalidate = vi.spyOn(queryClient, "invalidateQueries");
		await act(async () => firstOnFinish?.());

		expect(stop).toHaveBeenCalledOnce();
		expect(setMessages).toHaveBeenCalledWith([]);
		expect(
			container.querySelector('[data-testid="chat-draft"]')?.textContent,
		).toBe("");
		expect(
			container.querySelector('[data-testid="chat-files"]')?.textContent,
		).toBe("");
		expect(invalidate).not.toHaveBeenCalled();
	});

	it("stops the original chat instance before replacing it on identity switch", async () => {
		let retainedId: string | undefined;
		let retainedStop: ReturnType<typeof vi.fn> | undefined;
		const stops: Array<ReturnType<typeof vi.fn>> = [];
		mocks.useChat.mockImplementation((options) => {
			if (retainedId !== options.id) {
				retainedId = options.id;
				retainedStop = vi.fn();
				stops.push(retainedStop);
			}
			return {
				messages: [],
				sendMessage: vi.fn(),
				status: "streaming",
				error: null,
				setMessages: vi.fn(),
				regenerate: vi.fn(),
				addToolOutput: vi.fn(),
				stop: retainedStop,
			};
		});
		mocks.useAiChatIdentityPartition.mockReturnValue({
			id: "owner-1",
			role: "user",
		});
		await render(<ChatInterface />);
		const originalStop = stops[0];

		mocks.useAiChatIdentityPartition.mockReturnValue({
			id: "viewer-1",
			role: "user",
		});
		await render(<ChatInterface />);

		expect(stops).toHaveLength(2);
		expect(originalStop).toHaveBeenCalledOnce();
		expect(stops[1]).not.toHaveBeenCalled();
	});

	it("does not automatically resubmit an aborted tool transcript from an old identity", async () => {
		const chats: any[] = [];
		let retainedId: string | undefined;
		let retainedOptions: any;
		mocks.useChat.mockImplementation((options) => {
			if (retainedId !== options.id) {
				retainedId = options.id;
				retainedOptions = options;
				chats.push(options);
			}
			return {
				messages: [],
				sendMessage: vi.fn(),
				status: "streaming",
				error: null,
				setMessages: vi.fn(),
				regenerate: vi.fn(),
				addToolOutput: vi.fn(),
				stop: vi.fn(),
			};
		});
		mocks.useAiChatIdentityPartition.mockReturnValue({
			id: "owner-1",
			role: "user",
		});
		await render(<ChatInterface />);
		const oldChat = chats[0];
		const prepare = vi.spyOn(oldChat.transport, "prepareSendMessagesRequest");
		const transportFetch = vi.spyOn(oldChat.transport, "fetch");

		mocks.useAiChatIdentityPartition.mockReturnValue({
			id: "viewer-1",
			role: "user",
		});
		await render(<ChatInterface />);
		const completedToolMessages = [
			{
				id: "assistant-tool",
				role: "assistant" as const,
				parts: [
					{
						type: "tool-inspect" as const,
						toolCallId: "tool-1",
						state: "output-available" as const,
						input: {},
						output: { secret: true },
					},
				],
			},
		];

		const shouldResubmit = oldChat.sendAutomaticallyWhen({
			messages: completedToolMessages,
		});
		if (shouldResubmit) {
			oldChat.transport.prepareSendMessagesRequest({
				messages: completedToolMessages,
			});
			await oldChat.transport.fetch("http://test.local/chat", {});
		}

		expect(shouldResubmit).toBe(false);
		expect(prepare).not.toHaveBeenCalled();
		expect(transportFetch).not.toHaveBeenCalled();
		expect(retainedOptions).toBe(chats[1]);
	});

	it("restores an ordinary rejected send after transport preparation", async () => {
		const setMessages = vi.fn();
		let rejectSend: ((error: Error) => void) | undefined;
		mocks.useChat.mockImplementation((options) => ({
			messages: [],
			sendMessage: vi.fn(() => {
				options.transport.prepareSendMessagesRequest({ messages: [] });
				return new Promise<void>((_resolve, reject) => {
					rejectSend = reject;
				});
			}),
			status: "ready",
			error: null,
			setMessages,
			regenerate: vi.fn(),
			addToolOutput: vi.fn(),
			stop: vi.fn(),
		}));
		mocks.useAiChatIdentityPartition.mockReturnValue({
			id: "owner-1",
			role: "user",
		});
		vi.spyOn(console, "error").mockImplementation(() => {});

		await render(<ChatInterface />);
		await act(async () => {
			container
				.querySelector<HTMLButtonElement>('[data-testid="chat-set-draft"]')
				?.click();
		});
		await act(async () => {
			container
				.querySelector<HTMLButtonElement>('[data-testid="chat-send"]')
				?.click();
		});
		await act(async () => {
			rejectSend?.(new Error("provider unavailable"));
			await Promise.resolve();
		});

		expect(
			container.querySelector('[data-testid="chat-draft"]')?.textContent,
		).toBe("private draft");
		expect(
			container.querySelector('[data-testid="chat-files"]')?.textContent,
		).toBe("test.txt");
		expect(setMessages).toHaveBeenCalledWith(expect.any(Function));
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
	it("lets conversation query failures reach the composed route boundary", async () => {
		const consoleError = vi
			.spyOn(console, "error")
			.mockImplementation(() => {});
		mocks.useConversation.mockReturnValue({
			conversation: null,
			isLoading: false,
			error: new Error("conversation load failed"),
			refetch: vi.fn(),
		});

		await render(<ChatPageComponent conversationId="conv-1" />);

		expect(document.body.textContent).toContain("conversation load failed");
		expect(document.body.textContent).not.toContain("404");
		consoleError.mockRestore();
	});

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
