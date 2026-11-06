import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { StackProvider } from "@btst/stack/context";
import { createTestClientStack } from "../../../stack/src/__tests__/client-stack-test-utils";
import { aiChatClientPlugin } from "../client/plugin";
import type { AiChatPluginOverrides } from "../client/overrides";
import {
	ChatMessage,
	type ChatMessageProps,
} from "../client/components/chat-message";

const props: ChatMessageProps = {
	message: {
		id: "message-1",
		role: "user",
		parts: [{ type: "text", text: "Hello page" }],
	},
};
const pages = ["chat", "chatConversation"] as const;
function render(
	view: ReactElement,
	pageOverrides?: AiChatPluginOverrides["pageOverrides"],
) {
	return renderToStaticMarkup(
		<StackProvider
			stack={createTestClientStack({ aiChat: aiChatClientPlugin() })}
			overrides={{ aiChat: { ...{}, pageOverrides } }}
		>
			{view}
		</StackProvider>,
	);
}

describe("ai-chat page presentation overrides", () => {
	it("selects only the explicitly scoped component and supplies its native props", () => {
		const pageOverrides: AiChatPluginOverrides["pageOverrides"] = {
			chat: {
				ChatMessage: (props) => (
					<article data-slot-name="chat">
						{String(Boolean(props.message))}
					</article>
				),
			},
			chatConversation: {
				ChatMessage: (props) => (
					<article data-slot-name="chatConversation">
						{String(Boolean(props.message))}
					</article>
				),
			},
		};
		for (const page of pages) {
			const html = render(
				<ChatMessage page={page} {...props} />,
				pageOverrides,
			);
			expect(html).toContain(`data-slot-name="${page}">true`);
			for (const other of pages.filter((candidate) => candidate !== page))
				expect(html).not.toContain(`data-slot-name="${other}"`);
		}
		expect(render(<ChatMessage {...props} />, pageOverrides)).toContain(
			"Hello page",
		);
		expect(render(<ChatMessage {...props} />, pageOverrides)).not.toContain(
			"data-slot-name",
		);
	});
	it("leaves other pages on their built-in presentation when only one is configured", () => {
		const pageOverrides: AiChatPluginOverrides["pageOverrides"] = {
			chat: { ChatMessage: () => <article data-slot-name="isolated" /> },
		};
		for (const page of pages) {
			const html = render(
				<ChatMessage page={page} {...props} />,
				pageOverrides,
			);
			if (page === "chat") expect(html).toContain('data-slot-name="isolated"');
			else {
				expect(html).toContain("Hello page");
				expect(html).not.toContain("data-slot-name");
			}
		}
	});
	it("keeps built-in defaults with omitted and empty page overrides", () => {
		for (const page of pages) {
			expect(render(<ChatMessage page={page} {...props} />)).toContain(
				"Hello page",
			);
			expect(
				render(<ChatMessage page={page} {...props} />, { [page]: {} }),
			).toContain("Hello page");
		}
	});
});

import { ChatPage } from "../client/components/pages/chat-page.internal";
import { ChatLayout } from "../client/components/chat-layout";
vi.mock("../client/components/chat-sidebar", () => ({
	ChatSidebar: () => null,
}));
vi.mock("../client/components/chat-interface", () => ({
	ChatInterface: ({ page }: { page?: "chat" | "chatConversation" }) => (
		<ChatMessage page={page} {...props} />
	),
}));
it("supplies the route scope through built-in ChatPage and ChatLayout while standalone layout stays default", () => {
	const pageOverrides = {
		chat: { ChatMessage: () => <article data-page="chat" /> },
		chatConversation: {
			ChatMessage: () => <article data-page="conversation" />,
		},
	};
	expect(render(<ChatPage />, pageOverrides)).toContain('data-page="chat"');
	expect(
		render(<ChatPage conversationId="conversation-1" />, pageOverrides),
	).toContain('data-page="conversation"');
	expect(render(<ChatLayout showSidebar={false} />, pageOverrides)).toContain(
		"Hello page",
	);
});
