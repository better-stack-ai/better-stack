import { createFileRoute } from "@tanstack/react-router";
import { QueryClient } from "@tanstack/react-query";
import { sitemapEntryToXmlString } from "@btst/stack/client";
import { getRequestClientStack } from "@/lib/stack-client.server";

export const Route = createFileRoute("/sitemap.xml")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const queryClient = new QueryClient();
				const stack = await getRequestClientStack(queryClient, request);
				const entries = await stack.generateSitemap();
				return new Response(sitemapEntryToXmlString(entries), {
					headers: {
						"Content-Type": "application/xml; charset=utf-8",
						"Cache-Control":
							"public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
					},
				});
			},
		},
	},
});
