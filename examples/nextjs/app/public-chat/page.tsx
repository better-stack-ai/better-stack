"use client";

import { ChatLayout } from "@btst/stack/plugins/ai-chat/client";
import { BetterStackProvider } from "@btst/stack/context";
import type { AiChatPluginOverrides } from "@btst/stack/plugins/ai-chat/client";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import { useState } from "react";

// Get base URL - works on both server and client
const getBaseURL = () =>
	typeof window !== "undefined"
		? process.env.NEXT_PUBLIC_BASE_URL || window.location.origin
		: process.env.BASE_URL || "http://localhost:3000";

type PluginOverrides = {
	"ai-chat": AiChatPluginOverrides;
};

/**
 * Public Chat Page
 *
 * This demonstrates the AI Chat plugin in PUBLIC mode:
 * - No authentication required
 * - No conversation history (not persisted)
 * - No sidebar
 * - Ideal for public-facing chatbots
 */
export default function PublicChatPage() {
	const [queryClient] = useState(() => new QueryClient());
	const baseURL = getBaseURL();

	return (
		<QueryClientProvider client={queryClient}>
			<BetterStackProvider<PluginOverrides>
				basePath=""
				overrides={{
					"ai-chat": {
						mode: "public",
						apiBaseURL: baseURL,
						apiBasePath: "/api/public-chat",
						// Navigation not needed in public mode
						navigate: () => {},
					},
				}}
			>
				<div className="min-h-screen bg-background">
					<header className="border-b p-4">
						<h1 className="text-xl font-semibold">Public Chat Demo</h1>
						<p className="text-sm text-muted-foreground">
							This chat is stateless - no history is saved
						</p>
					</header>
					<main className="h-[calc(100vh-80px)]">
						<ChatLayout
							apiBaseURL={baseURL}
							apiBasePath="/api/public-chat"
							showSidebar={false}
						/>
					</main>
				</div>
			</BetterStackProvider>
		</QueryClientProvider>
	);
}
