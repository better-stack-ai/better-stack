import type { MetadataRoute } from "next";
import { QueryClient } from "@tanstack/react-query";
import { getStackClient } from "@/lib/stack-client";

//make sitemap dynamic
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    const queryClient = new QueryClient();
    const lib = getStackClient(queryClient);
    const entries = await lib.generateSitemap();

    // Next.js expects 'lastModified' as string | Date and absolute URLs in 'url'
    return entries.map((e) => ({
        url: e.url,
        lastModified: e.lastModified,
        changeFrequency: e.changeFrequency,
        priority: e.priority,
    }));
}


