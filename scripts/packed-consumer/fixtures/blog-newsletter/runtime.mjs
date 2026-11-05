import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { build } from "vite";
import { createFixture, esm } from "./backend.mjs";
const require = createRequire(import.meta.url);
for (const modules of [
	esm,
	Object.assign(
		{},
		...[
			"@btst/stack/api",
			"@btst/stack/authorization",
			"@btst/stack/authorization/server",
			"@btst/plugin-blog/api",
			"@btst/plugin-newsletter/api",
			"@btst/plugin-blog/permissions",
			"@btst/plugin-newsletter/permissions",
		].map((name) => require(name)),
	),
]) {
	const { stack, editor, request, emails } = await createFixture(modules);
	const response = await stack.handler(
		new Request("https://example.test/api/posts?slug=existing-post", {
			headers: { "x-user": "editor" },
		}),
	);
	assert.equal(response.status, 200);
	const post = (await response.json()).items[0];
	assert.equal(post.id, "existing-post-id");
	assert.equal(post.createdAt, "2020-01-02T03:04:05.000Z");
	const campaign = await editor.newsletter.createCampaign({
		subject: post.title,
		body: post.content,
		fromName: "Editor",
		fromEmail: "editor@example.test",
		format: "markdown",
		tags: ["readers"],
	});
	await assert.rejects(
		stack
			.forRequest(request("no-send"))
			.operations.newsletter.sendCampaign({ id: campaign.id }),
		{ statusCode: 403 },
	);
	assert.equal(emails.length, 0);
	await assert.rejects(
		stack
			.forRequest(request("no-create"))
			.operations.newsletter.createCampaign({
				subject: post.title,
				body: post.content,
				fromName: "Editor",
				fromEmail: "editor@example.test",
			}),
		{ statusCode: 403 },
	);
	assert.equal(
		(
			await stack.handler(
				new Request("https://example.test/api/posts?slug=existing-post", {
					headers: { "x-user": "no-blog" },
				}),
			)
		).status,
		403,
	);
	await editor.newsletter.sendCampaign({ id: campaign.id });
	assert.equal(emails.length, 1);
	assert.equal(emails[0].to, "reader@example.test");
	assert.equal(emails[0].subject, "Existing Blog edition");
	assert.match(emails[0].html, /<h1>Existing Blog body<\/h1>/);
	assert.equal(
		(await editor.blog.listPosts({ slug: "existing-post" })).items[0].content,
		"# Existing Blog body",
	);
}
const alias = [];
for (const name of [
	"@btst/stack",
	"@btst/plugin-blog",
	"@btst/plugin-newsletter",
]) {
	const manifest = JSON.parse(
		await readFile(`node_modules/${name}/package.json`, "utf8"),
	);
	for (const [entry, target] of Object.entries(manifest.exports)) {
		if (!target.require) continue;
		const id = name + entry.slice(1);
		const replacement = require.resolve(id);
		assert.match(replacement, /\.cjs$/);
		alias.push({
			find: new RegExp(`^${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`),
			replacement,
		});
	}
}
await build({
	resolve: { conditions: ["module", "browser", "production", "import"], alias },
	build: { emptyOutDir: false, rollupOptions: { input: "commonjs.html" } },
});
console.log(
	"Packed Blog–Newsletter ESM/CJS source data, independent permissions, scoped delivery and actual CommonJS UI bundle passed",
);
