"use client";

import { createClientStack } from "@btst/stack/client";
import {
	aiChatClientPlugin,
	ChatLayout,
} from "@btst/stack/plugins/ai-chat/client";
import { StackProvider } from "@btst/stack/context";
import { reactRouter } from "@btst/stack/react-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useClientOrigins } from "~/lib/client-origins";
import { getOrCreateQueryClient } from "~/lib/query-client";

/** Public AI chat backed by the explicit stateless public endpoint. */
export default function PublicChatPage() {
	const queryClient = getOrCreateQueryClient();
	const [widgetPage, setWidgetPage] = useState(0);
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
			<StackProvider stack={stack} router={reactRouter()}>
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
									pageKey={String(widgetPage)}
									introTip="Questions about this article? Ask AI."
									pageContext={{
										routeName: `Article ${widgetPage}`,
										pageDescription: `/public-chat/article-${widgetPage}`,
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
