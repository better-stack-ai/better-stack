import { createClientStack } from "@btst/stack/client";
import {
	aiChatClientPlugin,
	ChatLayout,
} from "@btst/stack/plugins/ai-chat/client";
import { StackProvider } from "@btst/stack/context";
import { tanstackRouter } from "@btst/stack/tanstack";
import { QueryClientProvider } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useClientOrigins } from "@/lib/client-origins";
import { getOrCreateQueryClient } from "@/lib/query-client";

export const Route = createFileRoute("/public-chat")({
	component: PublicChatPage,
});

/** Public AI chat backed by the explicit stateless public endpoint. */
function PublicChatPage() {
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
			<StackProvider stack={stack} router={tanstackRouter()}>
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
