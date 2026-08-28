"use client";

import { createClientStack } from "@btst/stack/client";
import {
	aiChatClientPlugin,
	ChatLayout,
} from "@btst/stack/plugins/ai-chat/client";
import { StackProvider } from "@btst/stack/context";
import { nextRouter } from "@btst/stack/next";
import { QueryClientProvider } from "@tanstack/react-query";
import { getOrCreateQueryClient } from "@/lib/query-client";

const getBaseURL = () =>
	typeof window !== "undefined"
		? window.location.origin
		: process.env.NEXT_PUBLIC_SITE_URL ||
			process.env.BASE_URL ||
			"http://localhost:3000";

/** Public AI chat backed by the explicit stateless public endpoint. */
export default function PublicChatPage() {
	const queryClient = getOrCreateQueryClient();
	const baseURL = getBaseURL();
	const stack = createClientStack({
		api: { baseURL, basePath: "/api/public-chat" },
		site: { baseURL, basePath: "" },
		queryClient,
		plugins: {
			aiChat: aiChatClientPlugin({ mode: "public" }),
		},
	});

	return (
		<QueryClientProvider client={queryClient}>
			<StackProvider stack={stack} router={nextRouter()}>
				<div className="min-h-screen bg-background">
					<main className="h-screen">
						<ChatLayout />
					</main>
				</div>
			</StackProvider>
		</QueryClientProvider>
	);
}
