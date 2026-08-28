import type { AiChatPluginOverrides } from "@btst/stack/plugins/ai-chat/client";
import { ChatLayout } from "@btst/stack/plugins/ai-chat/client";
import { StackProvider } from "@btst/stack/context";
import { tanstackRouter } from "@btst/stack/tanstack";
import { QueryClientProvider } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { getOrCreateQueryClient } from "@/lib/query-client";

export const Route = createFileRoute("/public-chat")({
	component: PublicChatPage,
});

const getBaseURL = () =>
	typeof window !== "undefined"
		? window.location.origin
		: process.env.VITE_PUBLIC_SITE_URL ||
			process.env.BASE_URL ||
			"http://localhost:3000";

type PluginOverrides = {
	aiChat: AiChatPluginOverrides;
};

/** Public AI chat backed by the explicit stateless public endpoint. */
function PublicChatPage() {
	const queryClient = getOrCreateQueryClient();
	const baseURL = getBaseURL();

	return (
		<QueryClientProvider client={queryClient}>
			<StackProvider<PluginOverrides>
				basePath=""
				router={tanstackRouter()}
				api={{ baseURL, basePath: "/api/public-chat" }}
				overrides={{ aiChat: { mode: "public" } }}
			>
				<div className="min-h-screen bg-background">
					<main className="h-screen">
						<ChatLayout showSidebar={false} />
					</main>
				</div>
			</StackProvider>
		</QueryClientProvider>
	);
}
