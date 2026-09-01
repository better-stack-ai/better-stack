import { describe, it, expect } from "vitest";
import { createClientStack } from "../client";
import { defineClientPlugin } from "../plugins/client";
import { createRoute } from "@btst/yar";
import { QueryClient } from "@tanstack/react-query";

function createStack(
	plugins: Parameters<typeof createClientStack>[0]["plugins"],
) {
	return createClientStack({
		api: { baseURL: "https://example.com", basePath: "/api" },
		site: { baseURL: "https://example.com", basePath: "/pages" },
		queryClient: new QueryClient(),
		plugins,
	});
}

describe("Client sitemap generation", () => {
	it("aggregates sitemaps from multiple plugins and de-duplicates by URL", async () => {
		const pluginA = defineClientPlugin({
			id: "a",
			resolve: () => ({
				routes: () => ({
					a: createRoute("/a", () => ({ PageComponent: () => null })),
				}),
				sitemap: () => [
					{ url: "https://example.com/a", priority: 0.8 },
					{ url: "https://example.com/b", changeFrequency: "weekly" },
				],
			}),
		});

		const pluginB = defineClientPlugin({
			id: "b",
			resolve: () => ({
				routes: () => ({
					b: createRoute("/b", () => ({ PageComponent: () => null })),
				}),
				sitemap: async () => [
					{ url: "https://example.com/b", priority: 0.5 }, // duplicate
					{ url: "https://example.com/c", changeFrequency: "monthly" },
				],
			}),
		});

		const client = createStack({ a: pluginA, b: pluginB });

		const entries = await client.generateSitemap();
		const urls = entries.map((e) => e.url).sort();
		expect(urls).toEqual([
			"https://example.com/a",
			"https://example.com/b",
			"https://example.com/c",
		]);

		// Ensure de-duplication preserves first occurrence properties
		const bEntry = entries.find((e) => e.url === "https://example.com/b");
		expect(bEntry?.changeFrequency).toBe("weekly");
		expect(bEntry?.priority).toBeUndefined();
	});

	it("returns empty array when no plugins provide a sitemap", async () => {
		const noop = defineClientPlugin({
			id: "noop",
			resolve: () => ({
				routes: () => ({
					home: createRoute("/", () => ({ PageComponent: () => null })),
				}),
			}),
		});

		const client = createStack({ noop });
		const entries = await client.generateSitemap();
		expect(entries).toEqual([]);
	});
});
