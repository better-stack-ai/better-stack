import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { QueryClient } from "@tanstack/react-query";
import { getRequestClientStack } from "@/lib/stack-client.server";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
	const queryClient = new QueryClient();
	const stack = await getRequestClientStack(
		queryClient,
		new Headers(await headers()),
	);
	const entries = await stack.generateSitemap();
	return entries.map((entry) => ({
		url: entry.url,
		lastModified: entry.lastModified,
		changeFrequency: entry.changeFrequency,
		priority: entry.priority,
	}));
}
