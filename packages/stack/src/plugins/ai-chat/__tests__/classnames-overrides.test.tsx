// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// Core primitives MUST be imported from the package entry (not relative src
// paths) so they share module identity — and React context — with the plugin
// components, which resolve `@btst/stack/*` via package self-reference.
import { StackProvider } from "@btst/stack/context";
import type { UIMessage } from "ai";
import { ChatInput } from "../client/components/chat-input";
import { ChatLayout } from "../client/components/chat-layout";
import { ChatMessage } from "../client/components/chat-message";
import { aiChatClientPlugin } from "../client/plugin";
import type { SerializedConversation } from "../types";
import { createTestClientStack } from "../../../__tests__/client-stack-test-utils";

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
}));

vi.mock("@ai-sdk/react", () => ({ useChat: mocks.useChat }));
vi.mock("../client/hooks/chat-hooks", () => ({
	useAiChatIdentityPartition: mocks.useAiChatIdentityPartition,
	useConversation: mocks.useConversation,
	useConversations: mocks.useConversations,
	useRenameConversationForm: mocks.useRenameConversationForm,
	useDeleteConversation: mocks.useDeleteConversation,
}));
vi.mock("../client/context/page-ai-context", async (importOriginal) => ({
	...(await importOriginal<
		typeof import("../client/context/page-ai-context")
	>()),
	usePageAIContext: () => undefined,
}));
// Markdown rendering is unrelated to class wiring and drags in highlight/katex.
vi.mock("@workspace/ui/components/markdown-content", () => ({
	MarkdownContent: ({ content }: { content: string }) => <div>{content}</div>,
}));

const CLASS_NAMES = {
	container: "bg-red-100",
	sidebar: "bg-blue-100",
	messageList: "bg-yellow-50",
	message: "text-purple-700",
	userMessage: "border-4 border-orange-500",
	assistantMessage: "border-4 border-green-500",
	input: "bg-pink-100",
} as const;

const conversation: SerializedConversation = {
	id: "conv-1",
	userId: "owner-1",
	title: "First conversation",
	createdAt: new Date("2024-01-01").toISOString(),
	updatedAt: new Date("2024-01-02").toISOString(),
};

const userMessage: UIMessage = {
	id: "user-1",
	role: "user",
	parts: [{ type: "text", text: "Hi there" }],
};
const assistantMessage: UIMessage = {
	id: "assistant-1",
	role: "assistant",
	parts: [{ type: "text", text: "Hello back" }],
};

let container: HTMLDivElement;
let root: Root;
let queryClient: QueryClient;

beforeEach(() => {
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
	queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});

	mocks.useAiChatIdentityPartition.mockReturnValue("anonymous");
	mocks.useChat.mockReturnValue({
		messages: [userMessage, assistantMessage],
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
		submit: vi.fn(),
		isSubmitting: false,
		error: null,
		fieldErrors: {},
		clearErrors: vi.fn(),
	});
	mocks.useDeleteConversation.mockReturnValue({
		mutateAsync: vi.fn(),
		isPending: false,
	});
});

afterEach(async () => {
	await act(async () => {
		root.unmount();
	});
	container.remove();
	vi.clearAllMocks();
});

async function render(ui: React.ReactElement) {
	await act(async () => {
		root.render(
			<QueryClientProvider client={queryClient}>
				<StackProvider
					stack={createTestClientStack(
						{ aiChat: aiChatClientPlugin() },
						queryClient,
					)}
					overrides={{ aiChat: { classNames: CLASS_NAMES } }}
				>
					{ui}
				</StackProvider>
			</QueryClientProvider>,
		);
	});
}

function query(selector: string): HTMLElement {
	const el = container.querySelector<HTMLElement>(selector);
	expect(el, `expected to find ${selector}`).toBeTruthy();
	return el!;
}

describe("ai-chat classNames overrides (issue #36)", () => {
	it("applies message, userMessage and assistantMessage to a user message", async () => {
		await render(<ChatMessage message={userMessage} />);

		const row = query('[data-testid="chat-message"][data-role="user"]');
		expect(row.className).toContain(CLASS_NAMES.message);
		expect(row.className).toContain("justify-end");

		const bubble = query('[data-testid="chat-message-bubble"]');
		expect(bubble.className).toContain("border-orange-500");
		expect(bubble.className).not.toContain("border-green-500");
		// The role-specific base styling is preserved.
		expect(bubble.className).toContain("bg-primary");
	});

	it("applies assistantMessage (not userMessage) to an assistant message", async () => {
		await render(<ChatMessage message={assistantMessage} />);

		const row = query('[data-testid="chat-message"][data-role="assistant"]');
		expect(row.className).toContain(CLASS_NAMES.message);
		expect(row.className).toContain("justify-start");

		const bubble = query('[data-testid="chat-message-bubble"]');
		expect(bubble.className).toContain("border-green-500");
		expect(bubble.className).not.toContain("border-orange-500");
		expect(bubble.className).toContain("bg-muted");
	});

	it("applies classNames.input to the composer form", async () => {
		await render(
			<ChatInput
				handleInputChange={() => {}}
				handleSubmit={() => {}}
				isLoading={false}
			/>,
		);

		const form = query('[data-testid="chat-input-form"]');
		expect(form.tagName).toBe("FORM");
		expect(form.className).toContain(CLASS_NAMES.input);
		expect(form.className).toContain("space-y-2");
	});

	it("applies container, sidebar and messageList in the full layout", async () => {
		await render(<ChatLayout conversationId={conversation.id} />);

		const layout = query('[data-testid="chat-layout"]');
		expect(layout.className).toContain(CLASS_NAMES.container);
		expect(layout.className).toContain("overflow-hidden");

		const sidebar = query('[data-testid="chat-sidebar"]');
		expect(sidebar.className).toContain(CLASS_NAMES.sidebar);
		expect(sidebar.className).toContain("border-r");

		const list = query('[data-testid="chat-message-list"]');
		expect(list.className).toContain(CLASS_NAMES.messageList);
		expect(list.className).toContain("flex-col");
	});

	it("applies classNames.container to the widget root", async () => {
		await render(<ChatLayout layout="widget" />);

		const trigger = query('[data-testid="widget-trigger"]');
		const widgetRoot = trigger.parentElement!;
		expect(widgetRoot.className).toContain(CLASS_NAMES.container);
		expect(widgetRoot.className).toContain("items-end");
	});

	it("leaves base classes untouched when no classNames override is supplied", async () => {
		await act(async () => {
			root.render(
				<QueryClientProvider client={queryClient}>
					<StackProvider
						stack={createTestClientStack(
							{ aiChat: aiChatClientPlugin() },
							queryClient,
						)}
					>
						<ChatMessage message={userMessage} />
					</StackProvider>
				</QueryClientProvider>,
			);
		});

		const bubble = query('[data-testid="chat-message-bubble"]');
		expect(bubble.className).toContain("bg-primary");
		expect(bubble.className).not.toContain("border-orange-500");
	});
});
