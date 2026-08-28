import { QueryClient } from "@tanstack/react-query";
import type { ComponentProps } from "react";
import { createClientStack } from "../client";
import { StackProvider } from "../context";
import {
	aiChatClientPlugin,
	ChatInput,
	ChatInterface,
	ChatLayout,
} from "../plugins/ai-chat/client";

const queryClient = new QueryClient();
const aiChat = aiChatClientPlugin({
	mode: "authenticated",
	seo: { siteName: "Example" },
	hooks: {
		onErrorLoad: (_error, context) => {
			context.apiBasePath satisfies string;
		},
	},
});

aiChat.id satisfies "aiChat";

const stack = createClientStack({
	api: { baseURL: "https://app.example.com", basePath: "/api/data" },
	site: { baseURL: "https://app.example.com", basePath: "/pages" },
	queryClient,
	plugins: { aiChat },
});

stack.provider.plugins.aiChat.config?.mode satisfies
	| "authenticated"
	| "public"
	| undefined;
// @ts-expect-error Provider config exposes only browser-safe AI Chat factory values.
stack.provider.plugins.aiChat.config?.hooks;

<StackProvider stack={stack} />;

// @ts-expect-error Mode is configured only in aiChatClientPlugin().
<ChatLayout mode="public" />;
// @ts-expect-error Mode is configured only in aiChatClientPlugin().
<ChatInterface mode="public" />;
type ChatInputProps = ComponentProps<typeof ChatInput>;
// @ts-expect-error ChatInput has no component-level mode.
type ChatInputMode = ChatInputProps["mode"];

<StackProvider
	stack={stack}
	overrides={{
		aiChat: {
			uploadFile: async () => "https://cdn.example.com/file.png",
			showAttribution: false,
		},
	}}
/>;

// Mode is a client-plugin factory concern, not a presentation override.
// @ts-expect-error Configure mode once in aiChatClientPlugin().
<StackProvider
	stack={stack}
	overrides={{
		aiChat: {
			mode: "public",
		},
	}}
/>;

aiChatClientPlugin({
	// @ts-expect-error Shared API configuration belongs to createClientStack().
	apiBaseURL: "https://app.example.com",
});

aiChatClientPlugin({
	// @ts-expect-error Shared API paths belong to createClientStack().
	apiBasePath: "/api/data",
});

aiChatClientPlugin({
	// @ts-expect-error Shared site configuration belongs to createClientStack().
	siteBaseURL: "https://app.example.com",
});

aiChatClientPlugin({
	// @ts-expect-error Shared site paths belong to createClientStack().
	siteBasePath: "/pages",
});

aiChatClientPlugin({
	// @ts-expect-error The stack owns the one shared query client.
	queryClient,
});

aiChatClientPlugin({
	// @ts-expect-error Request headers belong to createClientStack().api.
	headers: new Headers(),
});

aiChatClientPlugin({
	hooks: {
		// @ts-expect-error The canonical loader error phase is onErrorLoad.
		onLoadError: () => undefined,
	},
});

createClientStack({
	api: { baseURL: "https://app.example.com", basePath: "/api/data" },
	site: { baseURL: "https://app.example.com", basePath: "/pages" },
	queryClient,
	plugins: {
		// @ts-expect-error Package slugs are not programmatic registration IDs.
		"ai-chat": aiChatClientPlugin(),
	},
});

// @ts-expect-error Provider override keys are inferred from the registered ID.
<StackProvider stack={stack} overrides={{ "ai-chat": {} }} />;

// @ts-expect-error Transport headers are stack endpoint configuration.
<StackProvider
	stack={stack}
	overrides={{
		aiChat: {
			headers: { authorization: "secret" },
		},
	}}
/>;
