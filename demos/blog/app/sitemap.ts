import type { MetadataRoute } from "next";
import { QueryClient } from "@tanstack/react-query";
import { getStackClient } from "@/lib/stack-client";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
	const queryClient = new QueryClient();
	const lib = getStackClient(queryClient);
	const entries = await lib.generateSitemap();

	return entries.map((e) => ({
		url: e.url,
		lastModified: e.lastModified,
		changeFrequency: e.changeFrequency,
		priority: e.priority,
	}));
}
