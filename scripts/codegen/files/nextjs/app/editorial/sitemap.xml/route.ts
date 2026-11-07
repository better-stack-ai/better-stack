import { QueryClient } from "@tanstack/react-query";
import { getServerClientOrigins } from "@/lib/stack-client.server";
import { createEditorialClient } from "@/lib/editorial-client";

export const dynamic = "force-dynamic";

export async function GET() {
	const stack = createEditorialClient(
		new QueryClient(),
		getServerClientOrigins(),
	);
	const entries = await stack.generateSitemap();
	const xml = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries.map((entry) => `<url><loc>${entry.url.replaceAll("&", "&amp;").replaceAll("<", "&lt;")}</loc></url>`).join("")}</urlset>`;
	return new Response(xml, { headers: { "content-type": "application/xml" } });
}
