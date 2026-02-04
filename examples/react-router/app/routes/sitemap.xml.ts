import type { Route } from "./+types/sitemap.xml";
import { QueryClient } from "@tanstack/react-query";
import { getStackClient } from "~/lib/stack-client";
import { sitemapEntryToXmlString } from "@btst/stack/client";

export async function loader({}: Route.LoaderArgs) {
  // Create a QueryClient instance for server-side data fetching
  const queryClient = new QueryClient();
  const lib = getStackClient(queryClient);
  const entries = await lib.generateSitemap();
  const xml = sitemapEntryToXmlString(entries);

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      // Force dynamic - always fetch fresh data
      "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}

