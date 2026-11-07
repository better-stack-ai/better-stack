import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

for (const name of [
	"@btst/plugin-blog/api",
	"@btst/plugin-cms/api",
	"@btst/plugin-school/api",
	"@btst/plugin-ecommerce/api",
]) {
	assert.throws(() => require.resolve(name), { code: "MODULE_NOT_FOUND" });
}

for (const format of ["import", "require"]) {
	const load = (name) => (format === "require" ? require(name) : import(name));
	const { createBackendStack } = await load("@btst/stack/api");
	const { createMemoryAdapter } = await load("@btst/adapter-memory");
	const { defineAuthorization } = await load("@btst/stack/authorization");
	const { createServerAuth } = await load("@btst/stack/authorization/server");
	const { searchBackendPlugin } = await load("@btst/plugin-search/api");
	const { searchPermissions } = await load("@btst/plugin-search/permissions");
	const { z } = await load("zod");
	const seen = [];
	const stack = createBackendStack({
		basePath: "/api",
		adapter: (db) => createMemoryAdapter(db)({}),
		auth: createServerAuth({
			authorization: defineAuthorization({
				identity: z.object({ id: z.string() }),
				permissions: [searchPermissions],
				rules: ({ search }) => [search.query.read.allow()],
			}),
			getIdentity: ({ request }) => {
				const id = request.headers.get("x-reader");
				return id ? { id } : null;
			},
		}),
		plugins: {
			search: searchBackendPlugin({
				providers: [
					{
						id: "application",
						label: "Application",
						async search({ q, identity, request }) {
							seen.push({ identity, reader: request.headers.get("x-reader") });
							return {
								items: q.toLowerCase().includes("packed")
									? [
											{
												resourceId: "public-guide",
												title: "Packed search guide",
												snippet: "Public application content",
												href: "/guide",
											},
											...(identity?.id === "owner"
												? [
														{
															resourceId: "private-guide",
															title: "Private guide",
															snippet: "Owner content",
															href: "/private",
														},
													]
												: []),
										]
									: [],
								hasMore: false,
							};
						},
					},
				],
			}),
		},
	});
	const request = (reader) =>
		new Request("https://example.test/api/search?q=packed", {
			headers: reader ? { "x-reader": reader } : {},
		});
	const anonymous = await stack
		.forRequest(request())
		.operations.search.search({ q: "packed" });
	assert.deepEqual(
		anonymous.items.map((item) => item.resourceId),
		["public-guide"],
	);
	assert.equal(anonymous.nextPage, null);
	assert.equal(anonymous.hasMore, false);
	assert.equal(JSON.stringify(anonymous).includes("Private"), false);
	const owner = await stack
		.forRequest(request("owner"))
		.operations.search.search({ q: "packed" });
	assert.equal(owner.items.length, 2);
	assert.ok(
		seen.some(
			(entry) => entry.identity?.id === "owner" && entry.reader === "owner",
		),
	);
	const response = await stack.handler(request());
	assert.equal(response.status, 200);
	assert.deepEqual(await response.json(), anonymous);
	const calls = seen.length;
	assert.deepEqual(
		(await stack.forRequest(request()).operations.search.search({ q: "   " }))
			.items,
		[],
	);
	assert.equal(seen.length, calls);
	await assert.rejects(
		stack
			.forRequest(request())
			.operations.search.search({ q: "packed", sources: ["unregistered"] }),
	);
	assert.equal(
		(
			await stack.handler(
				new Request("https://example.test/api/search?q=packed&limit=500"),
			)
		).status,
		400,
	);
}
console.log(
	"Standalone Search packed ESM/CommonJS request identity, visibility, HTTP and validation passed",
);
