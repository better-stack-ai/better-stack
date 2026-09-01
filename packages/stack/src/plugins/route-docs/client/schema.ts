import type { ClientStackContext } from "../../../types";
import {
	fetchAllSitemapEntries,
	generateRouteDocsSchema,
	type RouteDocsSchema,
} from "../generator";

export function createEmptySchema(): RouteDocsSchema {
	return {
		plugins: [],
		generatedAt: new Date().toISOString(),
		allSitemapEntries: [],
	};
}

/** Generates the route schema from explicit resolved client definitions. */
export async function generateSchema(
	context: ClientStackContext | null,
): Promise<RouteDocsSchema> {
	if (!context) {
		return createEmptySchema();
	}

	try {
		const sitemapEntries = await fetchAllSitemapEntries(context);
		return generateRouteDocsSchema(context, sitemapEntries);
	} catch (error) {
		console.warn("Failed to generate route docs schema:", error);
		return generateRouteDocsSchema(context, []);
	}
}
