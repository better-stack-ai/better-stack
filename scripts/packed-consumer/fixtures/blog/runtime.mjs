import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createMemoryAdapter } from "@btst/adapter-memory";
import { QueryClient } from "@tanstack/react-query";
import * as core from "@btst/stack/api";
import * as authorization from "@btst/stack/authorization";
import * as serverAuth from "@btst/stack/authorization/server";
import * as blog from "@btst/plugin-blog/api";
import { blogPermissions } from "@btst/plugin-blog/permissions";
import { z } from "zod";
const require = createRequire(import.meta.url);
for (const optional of [
	"@btst/plugin-newsletter/api",
	"@btst/plugin-ai-chat/api",
	"@btst/components/markdown",
]) {
	assert.throws(() => require.resolve(optional), { code: "MODULE_NOT_FOUND" });
}
async function verify({
	createBackendStack,
	defineAuthorization,
	createServerAuth,
	blogBackendPlugin,
	blogPermissions,
	BLOG_QUERY_KEYS,
}) {
	const auth = createServerAuth({
		authorization: defineAuthorization({
			identity: z.object({ id: z.string() }),
			permissions: [blogPermissions],
			rules: ({ blog }) => [
				blog.post.read.allow(),
				blog.tag.read.allow(),
				blog.post.create.when(({ identity }) => identity !== null),
				blog.post.update.when(
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
		plugins: { blog: blogBackendPlugin() },
		auth,
	};
	const stack = createBackendStack({
		...options,
		adapter: (db) => createMemoryAdapter(db)({}),
	});
	const request = (id) =>
		new Request("https://example.test/api", { headers: { "x-owner": id } });
	const owner = stack.forRequest(request("owner")).operations.blog;
	const input = {
		title: "Packed article",
		slug: "packed-article",
		content: "# Reader heading\n\nPublic body",
		excerpt: "Excerpt",
		published: true,
		tags: [{ name: "Packed" }],
	};
	const item = await owner.createPost(input);
	assert.equal(item.authorId, "owner");
	await assert.rejects(
		stack
			.forRequest(request("other"))
			.operations.blog.updatePost({
				id: item.id,
				data: { ...input, title: "Forbidden" },
			}),
		{ statusCode: 403 },
	);
	await assert.rejects(owner.createPost({ ...input, slug: "", title: "" }), {
		name: "ZodError",
	});
	const response = await stack.handler(
		new Request("https://example.test/api/posts?slug=packed-article"),
	);
	assert.equal(response.status, 200);
	assert.equal((await response.json()).items[0].slug, item.slug);
	const restored = createBackendStack({
		...options,
		adapter: () => stack.adapter,
	});
	const cache = new QueryClient();
	await restored.raw.blog.prefetchForRoute("posts", cache);
	await restored.raw.blog.prefetchForRoute("post", cache, { slug: item.slug });
	const list = cache.getQueryData(
		BLOG_QUERY_KEYS.postsList({ published: true }),
	);
	assert.deepEqual(list.pageParams, [0]);
	assert.equal(list.pages[0][0].slug, item.slug);
	const post = cache.getQueryData(BLOG_QUERY_KEYS.postDetail(item.slug));
	assert.equal(post.tags[0].slug, "packed");
	assert.equal(typeof post.createdAt, "string");
	assert.equal(
		cache.getQueryData(BLOG_QUERY_KEYS.postsList({ published: false })),
		undefined,
	);
	await restored.raw.blog.prefetchForRoute("drafts", cache);
	assert.deepEqual(
		cache.getQueryData(BLOG_QUERY_KEYS.postsList({ published: false })).pages,
		[[]],
	);
}
await verify({
	...core,
	...authorization,
	...serverAuth,
	...blog,
	blogPermissions,
});
await verify({
	...require("@btst/stack/api"),
	...require("@btst/stack/authorization"),
	...require("@btst/stack/authorization/server"),
	...require("@btst/plugin-blog/api"),
	...require("@btst/plugin-blog/permissions"),
});
console.log(
	"Packed Blog ESM/CJS auth, operations, data, HTTP, serialization and SSG passed",
);
