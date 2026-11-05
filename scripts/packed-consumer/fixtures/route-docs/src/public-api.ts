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
