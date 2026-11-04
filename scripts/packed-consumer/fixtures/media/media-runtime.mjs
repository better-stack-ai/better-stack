import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { createMemoryAdapter } from "@btst/adapter-memory";
import { createBackendStack } from "@btst/stack/api";
import { defineAuthorization } from "@btst/stack/authorization";
import { createServerAuth } from "@btst/stack/authorization/server";
import { mediaBackendPlugin } from "@btst/plugin-media/api";
import { mediaPermissions } from "@btst/plugin-media/permissions";
import { localAdapter } from "@btst/plugin-media/api/adapters/local";
import { z } from "zod";

const require = createRequire(import.meta.url);
assert.equal(
	typeof (await import("@btst/plugin-media/client")).mediaClientPlugin,
	"function",
);
assert.equal(
	typeof require("@btst/plugin-media/client").mediaClientPlugin,
	"function",
);
assert.equal(
	typeof require("@btst/plugin-media/api/adapters/s3").s3Adapter,
	"function",
);
assert.equal(
	typeof require("@btst/plugin-media/api/adapters/vercel-blob")
		.vercelBlobAdapter,
	"function",
);
const manifest = JSON.parse(
	await readFile(new URL("./package.json", import.meta.url)),
);
const hasProvider = (name) => Object.hasOwn(manifest.dependencies, name);
for (const name of [
	"@aws-sdk/client-s3",
	"@aws-sdk/s3-request-presigner",
	"@vercel/blob",
]) {
	if (!hasProvider(name))
		assert.throws(() => require.resolve(name), { code: "MODULE_NOT_FOUND" });
}

async function verify({
	createBackendStack,
	defineAuthorization,
	createServerAuth,
	mediaBackendPlugin,
	mediaPermissions,
	localAdapter,
}) {
	const directory = await mkdtemp(join(tmpdir(), "packed-media-files-"));
	try {
		const storage = localAdapter({
			uploadDir: directory,
			publicPath: "/uploads",
		});
		const stored = await storage.upload(Buffer.from("existing file"), {
			filename: "existing.txt",
			mimeType: "text/plain",
			size: 13,
		});
		assert.equal(
			await readFile(join(directory, basename(stored.url)), "utf8"),
			"existing file",
		);
		await storage.delete(stored.url);
		await assert.rejects(readFile(join(directory, basename(stored.url))), {
			code: "ENOENT",
		});

		const authorization = defineAuthorization({
			identity: z.object({ id: z.string() }),
			permissions: [mediaPermissions],
			rules: ({ media }) => [
				media.library.read.when(({ identity }) => identity?.id === "owner"),
				media.asset.read.when(
					({ identity, facts }) => identity?.id === facts.tenantId,
				),
				media.asset.upload.when(
					({ identity, facts }) => identity?.id === facts.tenantId,
				),
			],
		});
		let adapter;
		const createStack = () =>
			createBackendStack({
				basePath: "/api",
				adapter: (db) => (adapter ??= createMemoryAdapter(db)({})),
				plugins: {
					media: mediaBackendPlugin({
						storageAdapter: storage,
						allowedUrlPrefixes: ["https://assets.example.test/"],
						resolveTenantId: () => "owner",
					}),
				},
				auth: createServerAuth({
					authorization,
					getIdentity: ({ request }) => {
						const id = request.headers.get("x-owner");
						return id ? { id } : null;
					},
				}),
			});
		const request = (id) =>
			new Request("https://app.example.test/api", {
				headers: { "x-owner": id },
			});
		const stack = createStack();
		const operations = stack.forRequest(request("owner")).operations.media;
		const input = {
			filename: "existing.txt",
			originalName: "Existing.txt",
			mimeType: "text/plain",
			size: 13,
			url: "https://assets.example.test/existing.txt",
		};
		const legacy = await adapter.create({
			model: "mediaAsset",
			forceAllowId: true,
			data: {
				...input,
				id: "v5-asset",
				filename: "legacy.txt",
				tenantId: "owner",
				createdAt: new Date("2024-01-01T00:00:00.000Z"),
			},
		});
		assert.equal(legacy.id, "v5-asset");
		const asset = await operations.createAsset(input);
		assert.equal(asset.filename, "existing.txt");
		assert.equal(asset.tenantId, "owner");
		const recovered = await createStack()
			.forRequest(request("owner"))
			.operations.media.listAssets({});
		assert.equal(
			recovered.items.find((item) => item.id === asset.id)?.url,
			input.url,
		);
		assert.equal(
			recovered.items.find((item) => item.id === legacy.id)?.filename,
			"legacy.txt",
		);
		await assert.rejects(
			stack.forRequest(request("other")).operations.media.createAsset(input),
			{ statusCode: 403 },
		);
		await assert.rejects(operations.createAsset({ ...input, size: -1 }));
		assert.equal((await operations.listAssets({})).total, 2);
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
}

await verify({
	createBackendStack,
	defineAuthorization,
	createServerAuth,
	mediaBackendPlugin,
	mediaPermissions,
	localAdapter,
});
await verify({
	...require("@btst/stack/api"),
	...require("@btst/stack/authorization"),
	...require("@btst/stack/authorization/server"),
	...require("@btst/plugin-media/api"),
	...require("@btst/plugin-media/permissions"),
	...require("@btst/plugin-media/api/adapters/local"),
});
console.log(
	"Packed Media ESM/CJS storage, operation authorization, validation and existing asset identities passed",
);
