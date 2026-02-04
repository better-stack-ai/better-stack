import type { Sitemap } from "../types";

/**
 * Converts an array of sitemap entries into an XML string following the sitemap.org protocol.
 *
 * @param entries - Array of sitemap entries from `lib.generateSitemap()`
 * @returns Complete XML string for the sitemap
 *
 * @example
 * ```ts
 * const entries = await lib.generateSitemap();
 * const xml = sitemapEntryToXmlString(entries);
 * return new Response(xml, {
 *   headers: { "Content-Type": "application/xml; charset=utf-8" }
 * });
 * ```
 */
export function sitemapEntryToXmlString(entries: Sitemap): string {
	const xml =
		`<?xml version="1.0" encoding="UTF-8"?>` +
		`<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">` +
		entries
			.map((entry) => {
				const url = `<loc>${entry.url}</loc>`;
				const lastModified = entry.lastModified
					? `<lastmod>${
							entry.lastModified instanceof Date
								? entry.lastModified.toISOString()
								: entry.lastModified
						}</lastmod>`
					: "";
				const changeFrequency = entry.changeFrequency
					? `<changefreq>${entry.changeFrequency}</changefreq>`
					: "";
				const priority =
					entry.priority !== undefined
						? `<priority>${entry.priority}</priority>`
						: "";

				return `<url>${url}${lastModified}${changeFrequency}${priority}</url>`;
			})
			.join("") +
		`</urlset>`;

	return xml;
}
