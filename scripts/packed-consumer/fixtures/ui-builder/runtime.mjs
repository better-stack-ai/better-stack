import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createMemoryAdapter } from "@btst/adapter-memory";
import { QueryClient } from "@tanstack/react-query";
import { z } from "zod";
import * as core from "@btst/stack/api";
import * as authorization from "@btst/stack/authorization";
import * as serverAuth from "@btst/stack/authorization/server";
import * as cms from "@btst/plugin-cms/api";
import * as cmsPermissions from "@btst/plugin-cms/permissions";
import * as cmsQueries from "@btst/plugin-cms/query-keys";
import * as ui from "@btst/plugin-ui-builder";
import * as uiQueries from "@btst/plugin-ui-builder/query-keys";
import { createApiClient } from "@btst/stack/plugins/client";

const require = createRequire(import.meta.url);

async function verify({
	createBackendStack,
	defineAuthorization,
	createServerAuth,
	cmsBackendPlugin,
	cmsPermissions,
	CMS_QUERY_KEYS,
	createCMSQueryKeys,
	UI_BUILDER_CONTENT_TYPE,
	UI_BUILDER_TYPE_SLUG,
	createUIBuilderQueryKeys,
}) {
	assert.equal(UI_BUILDER_TYPE_SLUG, "ui-builder-page");
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
	const stack = createBackendStack({
		adapter: (db) => createMemoryAdapter(db)({}),
		plugins: {
			cms: cmsBackendPlugin({ contentTypes: [UI_BUILDER_CONTENT_TYPE] }),
		},
		auth,
	});
	const request = (id) =>
		new Request("https://example.test/api", { headers: { "x-owner": id } });
	const owner = stack.forRequest(request("owner")).operations.cms;
	const layers = [
		{
			id: "legacy-layer",
			type: "div",
			name: "Existing page",
			props: {},
			children: "Existing content",
		},
	];
	const data = {
		layers: JSON.stringify(layers),
		variables: "[]",
		status: "published",
	};
	const item = await owner.createContentItem({
		typeSlug: UI_BUILDER_TYPE_SLUG,
		body: { slug: "retained-page", data },
	});
	assert.deepEqual(JSON.parse(item.parsedData.layers), layers);
	await stack.adapter.create({
		model: "contentItem",
		forceAllowId: true,
		data: {
			id: "v5-ui-page",
			contentTypeId: item.contentTypeId,
			slug: "v5-ui-page",
			data: JSON.stringify(data),
			authorId: "owner",
			createdAt: new Date("2024-01-01T00:00:00.000Z"),
			updatedAt: new Date("2024-01-02T00:00:00.000Z"),
		},
	});
	assert.equal(
		(
			await owner.getContentItem({
				typeSlug: UI_BUILDER_TYPE_SLUG,
				id: "v5-ui-page",
			})
		).parsedData.layers,
		JSON.stringify(layers),
	);
	await assert.rejects(
		stack.forRequest(request("other")).operations.cms.updateContentItem({
			typeSlug: UI_BUILDER_TYPE_SLUG,
			id: item.id,
			body: { data: { status: "draft" } },
		}),
		{ statusCode: 403 },
	);
	await assert.rejects(
		owner.updateContentItem({
			typeSlug: UI_BUILDER_TYPE_SLUG,
			id: item.id,
			body: { data: { status: "invalid" } },
		}),
		{ statusCode: 400 },
	);
	const restored = createBackendStack({
		adapter: () => stack.adapter,
		plugins: {
			cms: cmsBackendPlugin({ contentTypes: [UI_BUILDER_CONTENT_TYPE] }),
		},
		auth,
	});
	assert.equal(
		(
			await restored.trusted.cms.getContentItem({
				typeSlug: UI_BUILDER_TYPE_SLUG,
				id: item.id,
			})
		).parsedData.layers,
		JSON.stringify(layers),
	);
	const api = createApiClient({
		baseURL: "https://example.test",
		basePath: "/api",
	});
	const uiKeys = createUIBuilderQueryKeys(api);
	const cmsKeys = createCMSQueryKeys(api);
	assert.deepEqual(
		uiKeys.cmsContent.list({ limit: 5 }).queryKey,
		cmsKeys.cmsContent.list({ typeSlug: UI_BUILDER_TYPE_SLUG, limit: 5 })
			.queryKey,
	);
	const cache = new QueryClient();
	await restored.raw.cms.prefetchForRoute("contentList", cache, {
		typeSlug: UI_BUILDER_TYPE_SLUG,
		limit: 5,
	});
	const cached = cache.getQueryData(
		CMS_QUERY_KEYS.contentList({ typeSlug: UI_BUILDER_TYPE_SLUG, limit: 5 }),
	);
	assert.equal(cached.pages[0].items[0].id, item.id);
	assert.equal(
		cached.pages[0].items[0].parsedData.layers,
		JSON.stringify(layers),
	);
}

await verify({
	...core,
	...authorization,
	...serverAuth,
	...cms,
	...cmsPermissions,
	...cmsQueries,
	...ui,
	...uiQueries,
});
await verify({
	...require("@btst/stack/api"),
	...require("@btst/stack/authorization"),
	...require("@btst/stack/authorization/server"),
	...require("@btst/plugin-cms/api"),
	...require("@btst/plugin-cms/permissions"),
	...require("@btst/plugin-cms/query-keys"),
	...require("@btst/plugin-ui-builder"),
	...require("@btst/plugin-ui-builder/query-keys"),
});
console.log(
	"Packed UI Builder CMS persistence, authorization, validation, ESM/CJS and SSG/cache parity passed",
);
