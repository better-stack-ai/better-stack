"use client";

import { ChatLayout } from "@btst/stack/plugins/ai-chat/client";
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

	return (
		<QueryClientProvider client={queryClient}>
			<StackProvider
				basePath=""
				router={nextRouter()}
				api={{ baseURL, basePath: "/api/public-chat" }}
			>
				<div className="min-h-screen bg-background">
					<main className="h-screen">
						<ChatLayout mode="public" showSidebar={false} />
					</main>
				</div>
			</StackProvider>
		</QueryClientProvider>
	);
}
