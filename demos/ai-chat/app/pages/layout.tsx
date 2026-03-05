"use client";
import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { QueryClientProvider } from "@tanstack/react-query";
import { StackProvider } from "@btst/stack/context";
import { PageAIContextProvider } from "@btst/stack/plugins/ai-chat/client/context";
import type { AiChatPluginOverrides } from "@btst/stack/plugins/ai-chat/client";
import { getOrCreateQueryClient } from "@/lib/query-client";

type PluginOverrides = {
	aiChat: AiChatPluginOverrides;
};

const hasApiKey =
	typeof process !== "undefined" && !!process.env.NEXT_PUBLIC_HAS_OPENAI_KEY;

export default function PagesLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const router = useRouter();
	const [queryClient] = useState(() => getOrCreateQueryClient());
	const baseURL =
		typeof window !== "undefined"
			? window.location.origin
			: "http://localhost:3000";

	return (
		<QueryClientProvider client={queryClient}>
			<PageAIContextProvider>
				<StackProvider<PluginOverrides>
					basePath="/pages"
					overrides={{
						aiChat: {
							apiBaseURL: baseURL,
							apiBasePath: "/api/data",
							mode: "public",
							navigate: (path) => router.push(path),
							refresh: () => router.refresh(),
							Link: ({ href, ...props }) => (
								<Link href={href || "#"} {...props} />
							),
							chatSuggestions: [
								"What plugins does BTST offer?",
								"How do I install @btst/stack?",
								"Tell me about the blog plugin",
							],
						},
					}}
				>
					<div className="min-h-screen flex flex-col">
						<nav className="border-b bg-background sticky top-0 z-50">
							<div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
								<Link
									href="/pages/chat"
									className="font-semibold text-lg hover:opacity-75 transition-opacity"
								>
									BTST AI Chat Demo
								</Link>
								<div className="flex items-center gap-4 text-sm">
									<Link
										href="/pages/chat"
										className="text-muted-foreground hover:text-foreground transition-colors"
									>
										Chat
									</Link>
									<a
										href="/api/data/reference"
										className="text-muted-foreground hover:text-foreground transition-colors"
									>
										API Docs
									</a>
									<Link
										href="/pages/route-docs"
										className="text-muted-foreground hover:text-foreground transition-colors"
									>
										Route Docs
									</Link>
								</div>
							</div>
						</nav>
						{!hasApiKey && (
							<div className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-center text-sm text-amber-800">
								Add <code className="font-mono">OPENAI_API_KEY</code> to{" "}
								<code className="font-mono">.env.local</code> to enable AI chat.
							</div>
						)}
						<main className="flex-1">{children}</main>
					</div>
				</StackProvider>
			</PageAIContextProvider>
		</QueryClientProvider>
	);
}
