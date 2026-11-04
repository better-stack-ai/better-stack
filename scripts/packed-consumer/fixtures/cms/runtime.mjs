import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createMemoryAdapter } from "@btst/adapter-memory";
import { QueryClient } from "@tanstack/react-query";
import * as core from "@btst/stack/api";
import * as authorization from "@btst/stack/authorization";
import * as serverAuth from "@btst/stack/authorization/server";
import * as cms from "@btst/plugin-cms/api";
import { cmsPermissions } from "@btst/plugin-cms/permissions";
import { contentListDiscriminator } from "@btst/plugin-cms/query-keys";
import { z } from "zod";

const require = createRequire(import.meta.url);

async function verify({
	createBackendStack,
	defineAuthorization,
	createServerAuth,
	cmsBackendPlugin,
	cmsPermissions,
	CMS_QUERY_KEYS,
}) {
	const contentTypes = [
		{
			name: "Article",
			slug: "article",
			schema: z.object({ title: z.string().min(1) }),
		},
	];
	const auth = createServerAuth({
		authorization: defineAuthorization({
			identity: z.object({ id: z.string() }),
			permissions: [cmsPermissions],
			rules: ({ cms }) => [
				cms.contentType.read.allow(),
				cms.record.read.allow(),
				cms.record.create.when(({ identity }) => identity !== null),
				cms.record.update.when(
					({ identity, facts }) => identity?.id === facts.authorId,
				),
			],
		}),
		getIdentity: ({ request }) => ({
			id: request.headers.get("x-owner") ?? "owner",
		}),
	});
	const options = {
		basePath: "/api",
		plugins: { cms: cmsBackendPlugin({ contentTypes }) },
		auth,
	};
	const stack = createBackendStack({
		...options,
		adapter: (db) => createMemoryAdapter(db)({}),
	});
	const request = (id) =>
		new Request("https://example.test/api", { headers: { "x-owner": id } });
	const owner = stack.forRequest(request("owner")).operations.cms;
	const item = await owner.createContentItem({
		typeSlug: "article",
		body: { slug: "packed-article", data: { title: "Packed article" } },
	});
	assert.equal(item.authorId, "owner");
	assert.equal(
		(await owner.getContentItem({ typeSlug: "article", id: item.id })).slug,
		"packed-article",
	);
	await assert.rejects(
		stack.forRequest(request("other")).operations.cms.updateContentItem({
			typeSlug: "article",
			id: item.id,
			body: { data: { title: "Forbidden" } },
		}),
		{ statusCode: 403 },
	);
	await assert.rejects(
		owner.updateContentItem({
			typeSlug: "article",
			id: item.id,
			body: { data: { title: "" } },
		}),
		{ statusCode: 400 },
	);
	const restored = createBackendStack({
		...options,
		adapter: () => stack.adapter,
	});
	assert.equal(
		(
			await restored.trusted.cms.getContentItem({
				typeSlug: "article",
				id: item.id,
			})
		).slug,
		"packed-article",
	);
	const cache = new QueryClient();
	await restored.raw.cms.prefetchForRoute("contentList", cache, {
		typeSlug: "article",
		view: "content",
		fields: ["title"],
		limit: 5,
	});
	const cached = cache.getQueryData(
		CMS_QUERY_KEYS.contentList({
			typeSlug: "article",
			view: "content",
			fields: ["title"],
			limit: 5,
		}),
	);
	assert.equal(cached.pages[0].items[0].parsedData.title, "Packed article");
	assert.match(cached.pages[0].items[0].createdAt, /^\d{4}-\d{2}-\d{2}T.*Z$/);
}

await verify({
	...core,
	...authorization,
	...serverAuth,
	...cms,
	cmsPermissions,
});
await verify({
	...require("@btst/stack/api"),
	...require("@btst/stack/authorization"),
	...require("@btst/stack/authorization/server"),
	...require("@btst/plugin-cms/api"),
	...require("@btst/plugin-cms/permissions"),
});
assert.deepEqual(
	contentListDiscriminator({
		typeSlug: "article",
		fields: ["title", "title"],
		search: " ",
	}),
	{
		typeSlug: "article",
		limit: 20,
		offset: 0,
		search: undefined,
		fields: ["title"],
	},
);
assert.equal(
	typeof require("@btst/plugin-cms/query-keys").contentListDiscriminator,
	"function",
);
console.log(
	"Packed CMS ESM/CJS operations, authorization, validation, existing data and SSG keys passed",
);
