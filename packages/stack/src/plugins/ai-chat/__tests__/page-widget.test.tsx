// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, Fragment, StrictMode, useMemo, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StackProvider } from "@btst/stack/context";
import type { UIMessage } from "ai";
import {
	ChatLayout,
	type ChatLayoutProps,
} from "../client/components/chat-layout";
import { ToolCallDisplay } from "../client/components/tool-call-display";
import {
	PageAIContextProvider,
	useRegisterPageAIContext,
	usePageAIContext,
} from "../client/context/page-ai-context";
import { aiChatClientPlugin } from "../client/plugin";
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
	stop: vi.fn(),
	addToolOutput: vi.fn(),
	onAnalyticsEvent: vi.fn(),
}));
vi.mock("@ai-sdk/react", () => ({ useChat: mocks.useChat }));
vi.mock("../client/hooks/chat-hooks", () => ({
	useAiChatIdentityPartition: () => "anonymous",
	useConversation: () => ({ conversation: null, isLoading: false }),
	useConversations: () => ({ conversations: [], isLoading: false }),
}));
vi.mock("@workspace/ui/components/markdown-content", () => ({
	MarkdownContent: ({ markdown }: { markdown: string }) => (
		<div>{markdown}</div>
	),
}));

let container: HTMLDivElement;
let root: Root;
let queryClient: QueryClient;
let stack: ReturnType<typeof createStack>;
const createStack = () =>
	createTestClientStack(
		{ aiChat: aiChatClientPlugin({ mode: "public" }) },
		queryClient,
	);
const inherited = {
	routeName: "Global blog",
	pageDescription: "truncated global context",
};
function GlobalPage() {
	useRegisterPageAIContext(inherited);
	return (
		<span data-testid="global-context">
			{usePageAIContext()?.pageDescription}
		</span>
	);
}
beforeEach(() => {
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
	queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	stack = createStack();
	mocks.useChat.mockImplementation(function useTestChat() {
		const [messages, setMessages] = useState<UIMessage[]>([]);
		const controls = useMemo(
			() => ({
				sendMessage: vi.fn(),
				regenerate: vi.fn(),
				stop: mocks.stop,
				addToolOutput: mocks.addToolOutput,
			}),
			[],
		);
		return { messages, setMessages, status: "ready", error: null, ...controls };
	});
});
afterEach(async () => {
	await act(async () => root.unmount());
	container.remove();
	queryClient.clear();
	vi.clearAllMocks();
	mocks.onAnalyticsEvent.mockReset();
	vi.useRealTimers();
});
async function render(props: ChatLayoutProps, strict = false) {
	const Wrapper = strict ? StrictMode : Fragment;
	await act(async () =>
		root.render(
			<Wrapper>
				<QueryClientProvider client={queryClient}>
					<StackProvider
						stack={stack}
						overrides={{
							aiChat: {
								showAttribution: false,
								onAnalyticsEvent: mocks.onAnalyticsEvent,
							},
						}}
					>
						<PageAIContextProvider>
							<GlobalPage />
							<ChatLayout {...props} />
						</PageAIContextProvider>
					</StackProvider>
				</QueryClientProvider>
			</Wrapper>,
		),
	);
}
async function click(label: string) {
	const button = container.querySelector<HTMLButtonElement>(
		`button[aria-label="${label}"]`,
	);
	expect(button).not.toBeNull();
	await act(async () => button!.click());
}
const tip = () => container.querySelector('[role="status"]');
const options = () => mocks.useChat.mock.calls.at(-1)![0];
const page = {
	routeName: "Article",
	pageDescription: "/articles/one",
	suggestions: ["Summarize article"],
};

describe("page widget", () => {
	it("expires the accessible tip, allows dismissal, and does not reshow after opening", async () => {
		vi.useFakeTimers();
		await render({ layout: "widget", introTip: "Ask about this page" });
		expect(tip()?.textContent).toContain("Ask about this page");
		await act(async () => vi.advanceTimersByTime(5999));
		expect(tip()).not.toBeNull();
		await act(async () => vi.advanceTimersByTime(1));
		expect(tip()).toBeNull();
		await render({
			layout: "widget",
			pageKey: "two",
			introTip: "Ask about this page",
		});
		await click("Dismiss chat tip");
		expect(tip()).toBeNull();
		await render({
			layout: "widget",
			pageKey: "three",
			introTip: "Ask about this page",
		});
		await click("Open chat");
		expect(tip()).toBeNull();
		await click("Close chat");
		expect(tip()).toBeNull();
	});
	it("supports custom tip duration and suppresses tips for initially open or triggerless widgets", async () => {
		vi.useFakeTimers();
		await render({ layout: "widget", introTip: "Tip", introTipDuration: 50 });
		await act(async () => vi.advanceTimersByTime(50));
		expect(tip()).toBeNull();
		await render({
			layout: "widget",
			pageKey: "open",
			introTip: "Tip",
			defaultOpen: true,
		});
		expect(tip()).toBeNull();
		await render({
			layout: "widget",
			pageKey: "hidden",
			introTip: "Tip",
			showTrigger: false,
		});
		expect(tip()).toBeNull();
	});
	it("keeps context instance-scoped and resets history on page identity changes", async () => {
		const initialMessages: UIMessage[] = [
			{
				id: "old",
				role: "user",
				parts: [{ type: "text", text: "Old page question" }],
			},
		];
		await render({
			layout: "widget",
			defaultOpen: true,
			pageKey: "one",
			pageContext: page,
			initialMessages,
		});
		expect(container.textContent).toContain("Old page question");
		expect(
			container.querySelector('[data-testid="page-context-badge"]')
				?.textContent,
		).toBe("Article");
		expect(
			container.querySelector('[data-testid="global-context"]')?.textContent,
		).toBe(inherited.pageDescription);
		const oldOptions = options();
		expect(
			oldOptions.transport.prepareSendMessagesRequest({ messages: [] }).body
				.pageContext,
		).toBe("/articles/one");
		await render({
			layout: "widget",
			defaultOpen: true,
			pageKey: "two",
			pageContext: { ...page, pageDescription: "/articles/two" },
		});
		expect(container.textContent).not.toContain("Old page question");
		expect(options().id).not.toBe(oldOptions.id);
		expect(mocks.stop).toHaveBeenCalledTimes(1);
		expect(
			options().transport.prepareSendMessagesRequest({ messages: [] }).body
				.pageContext,
		).toBe("/articles/two");
		await render({
			layout: "widget",
			defaultOpen: true,
			pageKey: "two",
			pageContext: null,
		});
		expect(
			container.querySelector('[data-testid="page-context-badge"]'),
		).toBeNull();
		await render({ layout: "widget", defaultOpen: true, pageKey: "two" });
		expect(
			container.querySelector('[data-testid="page-context-badge"]')
				?.textContent,
		).toBe(inherited.routeName);
	});
	it("cancels the old stream and ignores late tool output after changing pages", async () => {
		let finish!: (value: { success: boolean }) => void;
		const handler = vi.fn(
			() =>
				new Promise<{ success: boolean }>((resolve) => {
					finish = resolve;
				}),
		);
		await render({
			layout: "widget",
			defaultOpen: true,
			pageKey: "one",
			pageContext: { ...page, clientTools: { editPage: handler } },
		});
		const oldOptions = options();
		const pending = oldOptions.onToolCall({
			toolCall: { toolName: "editPage", toolCallId: "old-tool", input: {} },
		});
		await render({
			layout: "widget",
			defaultOpen: true,
			pageKey: "two",
			pageContext: page,
		});
		expect(mocks.stop).toHaveBeenCalledTimes(1);
		finish({ success: true });
		await pending;
		expect(mocks.addToolOutput).not.toHaveBeenCalled();
		expect(oldOptions.sendAutomaticallyWhen({ messages: [] })).toBe(false);
		await oldOptions.onToolCall({
			toolCall: { toolName: "editPage", toolCallId: "late-tool", input: {} },
		});
		expect(handler).toHaveBeenCalledTimes(1);
	});
	it("accepts floating offsets and explicit dimensions", async () => {
		await render({
			layout: "widget",
			floating: true,
			defaultOpen: true,
			className: "bottom-20",
			style: { right: 24 },
		});
		const trigger = container.querySelector('[data-testid="widget-trigger"]')!;
		expect(trigger.parentElement?.className).toContain("fixed");
		expect(trigger.parentElement?.className).toContain("bottom-20");
		expect(trigger.parentElement?.style.right).toBe("24px");
		const panel = trigger.previousElementSibling as HTMLElement;
		await render({ layout: "widget", widgetWidth: 320, widgetHeight: 400 });
		expect(panel.style.width).toBe("320px");
		expect(panel.style.height).toBe("400px");
		expect(trigger.parentElement?.className).not.toContain("fixed");
	});
	it("emits content-free lifecycle analytics once under StrictMode", async () => {
		vi.useFakeTimers();
		await render(
			{
				layout: "widget",
				pageKey: "one",
				pageContext: page,
				introTip: "PRIVATE TIP",
			},
			true,
		);
		const events = () =>
			mocks.onAnalyticsEvent.mock.calls.map(([event]) => event);
		expect(
			events().filter((event) => event.type === "intro_tip_shown"),
		).toHaveLength(1);
		await click("Open chat");
		expect(
			events().filter((event) => event.type === "intro_tip_dismissed"),
		).toEqual([
			{
				type: "intro_tip_dismissed",
				reason: "open",
				pageKey: "one",
				routeName: "Article",
				mode: "public",
			},
		]);
		const suggestion = Array.from(container.querySelectorAll("button")).find(
			(button) => button.textContent === "Summarize article",
		)!;
		await act(async () => suggestion.click());
		await act(async () =>
			container
				.querySelector("form")!
				.dispatchEvent(
					new Event("submit", { bubbles: true, cancelable: true }),
				),
		);
		expect(
			events().filter((event) => event.type === "message_submitted"),
		).toEqual([
			{
				type: "message_submitted",
				inputKind: "suggestion",
				inputLength: 17,
				messageCount: 1,
				attachmentCount: 0,
				pageKey: "one",
				routeName: "Article",
				mode: "public",
			},
		]);
		const completion = {
			message: {
				id: "answer",
				role: "assistant",
				parts: [
					{
						type: "tool-readPage",
						state: "output-available",
						toolCallId: "tool",
						output: "PRIVATE TOOL",
					},
					{ type: "text", text: "PRIVATE ANSWER" },
				],
			},
			messages: [],
			isAbort: false,
			isError: false,
			isDisconnect: false,
		};
		await act(async () => {
			vi.advanceTimersByTime(250);
			await options().onFinish(completion);
			await options().onFinish(completion);
		});
		expect(
			events().filter((event) => event.type === "response_completed"),
		).toEqual([
			{
				type: "response_completed",
				durationMs: 250,
				outputLength: 14,
				toolCallCount: 1,
				pageKey: "one",
				routeName: "Article",
				mode: "public",
			},
		]);
		await click("Clear chat");
		expect(
			events().filter((event) => event.type === "conversation_cleared"),
		).toHaveLength(1);
		expect(JSON.stringify(events())).not.toMatch(
			/PRIVATE|Summarize article|articles\/one/,
		);
	});
	it("deduplicates failure callbacks and isolates instrumentation errors", async () => {
		await render({ layout: "widget", defaultOpen: true, pageContext: page });
		const suggestion = Array.from(container.querySelectorAll("button")).find(
			(button) => button.textContent === "Summarize article",
		)!;
		await act(async () => suggestion.click());
		await act(async () =>
			container
				.querySelector("form")!
				.dispatchEvent(
					new Event("submit", { bubbles: true, cancelable: true }),
				),
		);
		const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
		await act(async () => {
			options().onError(new Error("PRIVATE ERROR"));
			await options().onFinish({ isError: true });
		});
		errorLog.mockRestore();
		expect(
			mocks.onAnalyticsEvent.mock.calls.filter(
				([event]) => event.type === "response_failed",
			),
		).toHaveLength(1);
		expect(JSON.stringify(mocks.onAnalyticsEvent.mock.calls)).not.toContain(
			"PRIVATE ERROR",
		);
		mocks.onAnalyticsEvent.mockImplementation(() => {
			throw new Error("analytics unavailable");
		});
		await render({ layout: "widget", pageKey: "error", introTip: "Tip" });
		await click("Open chat");
		expect(
			container.querySelector('[data-testid="chat-interface"]'),
		).not.toBeNull();
		mocks.onAnalyticsEvent.mockImplementation(() =>
			Promise.reject(new Error("analytics unavailable")),
		);
		await click("Close chat");
	});
	it.each([
		["input-available", undefined, "Reading page content…"],
		["output-available", { content: "large document" }, "Read page content"],
		[
			"output-available",
			{ error: "Page not found" },
			"Unable to read this page.",
		],
		["output-error", undefined, "Unable to read this page."],
	] as const)(
		"renders the readPage status for %s",
		async (state, output, expected) => {
			await act(async () =>
				root.render(
					<StackProvider stack={stack}>
						<ToolCallDisplay
							toolCallId="read-1"
							toolName="readPage"
							input={undefined}
							isLoading={false}
							state={state}
							output={output}
						/>
					</StackProvider>,
				),
			);
			expect(tip()?.textContent).toBe(expected);
			expect(container.textContent).not.toContain("large document");
		},
	);
});
