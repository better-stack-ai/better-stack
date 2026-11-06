import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
for (const format of ["import", "require"]) {
	const load = (name) => (format === "require" ? require(name) : import(name));
	const docs = await load("@btst/plugin-route-docs/client");
	const { createClientStack } = await load("@btst/stack/client");
	const { defineClientPlugin, defineRoute } = await load(
		"@btst/stack/plugins/client",
	);
	const { QueryClient } = await load("@tanstack/react-query");
	const { z } = await load("zod");
	let pageCalls = 0;
	const queryClient = new QueryClient();
	const definition = docs.routeDocsClientPlugin({
		title: "Application routes",
	});
	assert.equal(definition.id, "routeDocs");
	const stack = createClientStack({
		api: { baseURL: "https://api.example.test", basePath: "/api/data" },
		site: { baseURL: "https://site.example.test", basePath: "/pages" },
		queryClient,
		plugins: {
			catalog: defineClientPlugin({
				id: "catalog",
				resolve: () => ({
					routes: () => ({
						item: defineRoute(
							"/catalog/:slug",
							{
								page: () => {
									pageCalls++;
									return null;
								},
							},
							{ query: z.object({ preview: z.boolean().optional() }) },
						),
					}),
					sitemap: () => [
						{
							url: "https://site.example.test/pages/catalog/v5-existing",
							lastModified: "2025-02-01T00:00:00.000Z",
						},
					],
				}),
			}),
			routeDocs: definition,
		},
	});
	assert.deepEqual(docs.getRegisteredRoutes(stack.context), [
		{ path: "/catalog/:slug", plugin: "catalog", key: "item" },
	]);
	assert.deepEqual(docs.getRegisteredRoutes(null), []);
	const schema = await docs.generateSchema(stack.context);
	assert.equal(schema.plugins[0].name, "catalog");
	assert.equal(schema.plugins[0].key, "catalog");
	assert.deepEqual(schema.plugins[0].routes[0].pathParams, [
		{ name: "slug", type: "string", required: true },
	]);
	assert.equal(schema.plugins[0].routes[0].queryParams[0].name, "preview");
	assert.equal(schema.plugins[0].routes[0].queryParams[0].required, false);
	assert.equal(
		schema.allSitemapEntries[0].url,
		"https://site.example.test/pages/catalog/v5-existing",
	);
	assert.equal(
		schema.allSitemapEntries[0].lastModified,
		"2025-02-01T00:00:00.000Z",
	);
	assert.equal(pageCalls, 0, "introspection must not execute protected pages");
	const route = stack.router.getRoute("/route-docs");
	assert.ok(route);
	await route.loader();
	assert.ok(
		queryClient
			.getQueriesData({ queryKey: docs.ROUTE_DOCS_QUERY_KEY })
			.some(([, value]) => value?.plugins?.[0]?.name === "catalog"),
	);
	assert.deepEqual(
		(await route.meta()).find((entry) => entry.name === "robots"),
		{ name: "robots", content: "noindex" },
	);
	assert.ok(
		(await route.meta()).some(
			(entry) => entry.content === "https://site.example.test/pages/route-docs",
		),
	);
	const empty = await docs.generateSchema(null);
	assert.deepEqual(empty.plugins, []);
	assert.deepEqual(empty.allSitemapEntries, []);
	queryClient.clear();
}
for (const name of [
	"@btst/plugin-blog/api",
	"@btst/plugin-ai-chat/api",
	"@btst/plugin-media/api",
	"@btst/components/markdown",
]) {
	assert.throws(() => require.resolve(name));
}
console.log(
	"Route Docs packed ESM/CommonJS runtime, schema, stable identity and SSR loader passed",
);
