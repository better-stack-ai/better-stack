import { createClientStack } from "@btst/stack/client";
import {
	aiChatClientPlugin,
	ChatLayout,
} from "@btst/stack/plugins/ai-chat/client";
import { StackProvider } from "@btst/stack/context";
import { tanstackRouter } from "@btst/stack/tanstack";
import { QueryClientProvider } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useClientOrigins } from "@/lib/client-origins";
import { getOrCreateQueryClient } from "@/lib/query-client";

export const Route = createFileRoute("/public-chat")({
	component: PublicChatPage,
});

/** Public AI chat backed by the explicit stateless public endpoint. */
function PublicChatPage() {
	const queryClient = getOrCreateQueryClient();
	const { siteOrigin } = useClientOrigins();
	const stack = useMemo(
		() =>
			createClientStack({
				api: { baseURL: siteOrigin, basePath: "/api/public-chat" },
				site: { baseURL: siteOrigin, basePath: "/" },
				queryClient,
				plugins: {
					aiChat: aiChatClientPlugin({ mode: "public" }),
				},
			}),
		[queryClient, siteOrigin],
	);

	return (
		<QueryClientProvider client={queryClient}>
			<StackProvider stack={stack} router={tanstackRouter()}>
				<div className="min-h-screen bg-background">
					<main className="h-screen">
						<ChatLayout />
					</main>
				</div>
			</StackProvider>
		</QueryClientProvider>
	);
}
