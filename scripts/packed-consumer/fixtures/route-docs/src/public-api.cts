import {
	ROUTE_DOCS_QUERY_KEY,
	generateSchema,
	getRegisteredRoutes,
	routeDocsClientPlugin,
	useRegisteredRoutes,
	type DocumentedPlugin,
	type DocumentedRoute,
	type PluginSitemapEntry,
	type RegisteredRoute,
	type RouteDocsClientConfig,
	type RouteDocsSchema,
	type RouteParameter,
} from "@btst/plugin-route-docs/client";
const config: RouteDocsClientConfig = { title: "Application routes" };
const plugin = routeDocsClientPlugin(config);
const id: "routeDocs" = plugin.id;
const existingEntry: PluginSitemapEntry = {
	url: "https://example.test/pages/catalog/existing",
	pluginKey: "catalog",
	lastModified: new Date("2025-02-01"),
	changeFrequency: "monthly",
	priority: 0.5,
};
const invalidEntry: PluginSitemapEntry = {
	url: "https://example.test",
	pluginKey: "catalog",
	// @ts-expect-error Sitemap timestamps preserve the string/Date contract.
	lastModified: 42,
};
// @ts-expect-error Shared API configuration belongs on createClientStack.
routeDocsClientPlugin({ apiBaseURL: "https://example.test" });
export {
	id,
	plugin,
	ROUTE_DOCS_QUERY_KEY,
	generateSchema,
	getRegisteredRoutes,
	useRegisteredRoutes,
};
export type {
	DocumentedPlugin,
	DocumentedRoute,
	PluginSitemapEntry,
	RegisteredRoute,
	RouteDocsSchema,
	RouteParameter,
};
