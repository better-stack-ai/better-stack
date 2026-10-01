"use client";

import { createClientStack } from "@btst/stack/client";
import {
	aiChatClientPlugin,
	ChatLayout,
} from "@btst/stack/plugins/ai-chat/client";
import { StackProvider } from "@btst/stack/context";
import { nextRouter } from "@btst/stack/next";
import { QueryClientProvider } from "@tanstack/react-query";
import { useMemo, useState, type CSSProperties } from "react";
import { useClientOrigins } from "@/lib/client-origins";
import { getOrCreateQueryClient } from "@/lib/query-client";

/** Public AI chat backed by the explicit stateless public endpoint. */
export default function PublicChatPage() {
	const queryClient = getOrCreateQueryClient();
	const [widgetPage, setWidgetPage] = useState(0);
	const articleBody = `This is example article ${widgetPage}. The page widget answers questions using the current article as context. Moving to the next article starts a new conversation so answers stay relevant to that page.`;
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
			<StackProvider stack={stack} router={nextRouter()}>
				<div className="min-h-screen bg-background">
					<main className="h-screen">
						{widgetPage === 0 ? (
							<>
								<button
									type="button"
									data-testid="show-page-widget"
									onClick={() => setWidgetPage(1)}
								>
									Try the page widget
								</button>
								<ChatLayout />
							</>
						) : (
							<>
								<h1>Example article {widgetPage}</h1>
								<p data-testid="article-content">{articleBody}</p>
								<button
									type="button"
									data-testid="next-widget-page"
									onClick={() => setWidgetPage((page) => page + 1)}
								>
									Next article
								</button>
								<ChatLayout
									layout="widget"
									floating
									expandable
									className="font-mono [--background:#fef3c7] text-foreground z-40"
									style={
										{
											fontFamily: "monospace",
											"--foreground": "#0c4a6e",
											right: 16,
											bottom: 16,
											zIndex: 40,
										} as CSSProperties
									}
									pageKey={String(widgetPage)}
									introTip="Questions about this article? Ask AI."
									pageContext={{
										routeName: `Article ${widgetPage}`,
										pageDescription: `/public-chat/article-${widgetPage}\n${articleBody}`,
										suggestions: ["Summarize this article"],
									}}
								/>
							</>
						)}
					</main>
				</div>
			</StackProvider>
		</QueryClientProvider>
	);
}
