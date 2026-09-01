import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const checker = new URL("./check-assets.mjs", import.meta.url);

async function writeFixture(manifest, { writeSources = true } = {}) {
	const root = await mkdtemp(join(tmpdir(), "btst-product-proof-"));
	const manifestPath = join(root, "manifest.json");
	const assetFiles = new Set(manifest.assets.map((asset) => asset.file));

	for (const asset of manifest.assets) {
		const path = join(root, asset.file);
		await mkdir(dirname(path), { recursive: true });
		await writeFile(
			path,
			'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900"><title>Proof</title></svg>',
		);
		if (asset.source && writeSources) {
			const sourcePath = join(root, asset.source);
			await mkdir(dirname(sourcePath), { recursive: true });
			await writeFile(sourcePath, "deterministic fixture source");
		}
	}
	if (writeSources) {
		for (const source of manifest.textSources ?? []) {
			if (assetFiles.has(source)) continue;
			const sourcePath = join(root, source);
			await mkdir(dirname(sourcePath), { recursive: true });
			await writeFile(sourcePath, "deterministic fixture source");
		}
	}

	await writeFile(manifestPath, JSON.stringify(manifest));
	return manifestPath;
}

test("accepts a complete asset contract within its byte budget", async () => {
	const manifestPath = await writeFixture({
		version: 1,
		assetRevision: 1,
		kitMaxBytes: 1_800_000,
		forbiddenText: ["Better Stack", "john@example.com"],
		textSources: ["scripts/product-proof/render-diagrams.mjs"],
		assets: [
			{
				file: "ownership.svg",
				format: "svg",
				width: 1600,
				height: 900,
				maxBytes: 100_000,
				alt: "Diagram showing a React application keeping its code, data, and deployment after adding BTST.",
				caption:
					"BTST runs inside the application while the team keeps every operating boundary.",
				source: "scripts/product-proof/render-diagrams.mjs",
				decorative: false,
			},
		],
	});

	const result = spawnSync(process.execPath, [checker.pathname, manifestPath], {
		encoding: "utf8",
	});

	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stdout, /1 asset checked/);
});

test("rejects missing evidence metadata, dimension drift, and exceeded budgets", async () => {
	const manifestPath = await writeFixture({
		version: 1,
		assetRevision: 1,
		kitMaxBytes: 10,
		forbiddenText: ["Proof"],
		textSources: ["render-source.mjs"],
		assets: [
			{
				file: "blog-proof.svg",
				format: "svg",
				width: 800,
				height: 450,
				maxBytes: 20,
				alt: "",
				caption: "",
				source: "",
				decorative: false,
			},
		],
	});

	const result = spawnSync(process.execPath, [checker.pathname, manifestPath], {
		encoding: "utf8",
	});

	assert.equal(result.status, 1);
	assert.match(result.stderr, /alt is required/);
	assert.match(result.stderr, /caption is required/);
	assert.match(result.stderr, /source is required/);
	assert.match(result.stderr, /expected 800x450, found 1600x900/);
	assert.match(result.stderr, /bytes exceeds 20/);
	assert.match(result.stderr, /kit: .* bytes exceeds 10/);
	assert.match(result.stderr, /contains forbidden text "Proof"/);
});

test("requires the prohibited-copy policy and textual source contract", async () => {
	const manifestPath = await writeFixture(
		{
			version: 1,
			assetRevision: 1,
			kitMaxBytes: 1_800_000,
			assets: [
				{
					file: "ownership.svg",
					format: "svg",
					width: 1600,
					height: 900,
					maxBytes: 100_000,
					alt: "BTST ownership boundaries.",
					caption: "The app remains yours.",
					source: "missing-source.mjs",
					decorative: false,
				},
			],
		},
		{ writeSources: false },
	);

	const result = spawnSync(process.execPath, [checker.pathname, manifestPath], {
		encoding: "utf8",
	});

	assert.equal(result.status, 1);
	assert.match(
		result.stderr,
		/manifest.forbiddenText must contain at least one string/,
	);
	assert.match(
		result.stderr,
		/manifest.textSources must contain at least one unique path/,
	);
});

test("reads dimensions from generated WebP evidence", async () => {
	const root = await mkdtemp(join(tmpdir(), "btst-product-proof-webp-"));
	const assetPath = join(root, "blog-proof.webp");
	const manifestPath = join(root, "manifest.json");
	await writeFile(
		assetPath,
		Buffer.from(
			"UklGRiIAAABXRUJQVlA4TBYAAAAvAQAAAA/wDaQzZHwEef5DCxWI6H8A",
			"base64",
		),
	);
	await writeFile(
		manifestPath,
		JSON.stringify({
			version: 1,
			assetRevision: 1,
			kitMaxBytes: 1_800_000,
			forbiddenText: ["Better Stack", "john@example.com"],
			textSources: ["capture.mjs"],
			assets: [
				{
					file: "blog-proof.webp",
					format: "webp",
					width: 2,
					height: 1,
					maxBytes: 100_000,
					alt: "BTST Blog showing a published product update.",
					caption:
						"A real Blog route is the visible result of one installed plugin.",
					source: "capture.mjs",
					decorative: false,
				},
			],
		}),
	);
	await writeFile(join(root, "capture.mjs"), "deterministic fixture source");

	const result = spawnSync(process.execPath, [checker.pathname, manifestPath], {
		encoding: "utf8",
	});

	assert.equal(result.status, 0, result.stderr);
});

test("rejects case variants of prohibited copy in raster source data", async () => {
	const root = await mkdtemp(join(tmpdir(), "btst-product-proof-source-"));
	const assetPath = join(root, "blog-proof.webp");
	const manifestPath = join(root, "manifest.json");
	await writeFile(
		assetPath,
		Buffer.from(
			"UklGRiIAAABXRUJQVlA4TBYAAAAvAQAAAA/wDaQzZHwEef5DCxWI6H8A",
			"base64",
		),
	);
	await writeFile(join(root, "capture.mjs"), "deterministic capture source");
	await writeFile(
		join(root, "dogfood-data.json"),
		JSON.stringify({ title: "A bEtTeR sTaCk release" }),
	);
	await writeFile(
		manifestPath,
		JSON.stringify({
			version: 1,
			assetRevision: 1,
			kitMaxBytes: 1_800_000,
			forbiddenText: ["Better Stack"],
			textSources: ["capture.mjs", "dogfood-data.json"],
			assets: [
				{
					file: "blog-proof.webp",
					format: "webp",
					width: 2,
					height: 1,
					maxBytes: 100_000,
					alt: "BTST Blog showing a published product update.",
					caption: "A real Blog route from the generated application.",
					source: "capture.mjs",
					decorative: false,
				},
			],
		}),
	);

	const result = spawnSync(process.execPath, [checker.pathname, manifestPath], {
		encoding: "utf8",
	});

	assert.equal(result.status, 1);
	assert.match(
		result.stderr,
		/dogfood-data.json: contains forbidden text "Better Stack"/,
	);
});

test("limits a prohibited display-token exception to an explicit source", async () => {
	const manifestPath = await writeFixture({
		version: 1,
		assetRevision: 1,
		kitMaxBytes: 1_800_000,
		forbiddenText: ["@BTST/STACK"],
		textSources: ["stack.ts", "navbar.tsx"],
		textSourceAllowlist: {
			"stack.ts": [
				{
					term: "@BTST/STACK",
					context: "lowercaseNpmPackageToken",
					token: "@btst/stack",
				},
			],
		},
		assets: [
			{
				file: "ownership.svg",
				format: "svg",
				width: 1600,
				height: 900,
				maxBytes: 100_000,
				alt: "BTST ownership boundaries.",
				caption: "The app remains yours.",
				source: "navbar.tsx",
				decorative: false,
			},
		],
	});
	await writeFile(
		join(dirname(manifestPath), "stack.ts"),
		'import { createStack } from "@btst/stack";',
	);

	const allowed = spawnSync(
		process.execPath,
		[checker.pathname, manifestPath],
		{
			encoding: "utf8",
		},
	);
	assert.equal(allowed.status, 0, allowed.stderr);

	await writeFile(
		join(dirname(manifestPath), "stack.ts"),
		'import { createStack } from "@btst/stack";\nconst lockup = "@BTST/STACK";',
	);
	const rejectedInAllowedSource = spawnSync(
		process.execPath,
		[checker.pathname, manifestPath],
		{
			encoding: "utf8",
		},
	);
	assert.equal(rejectedInAllowedSource.status, 1);
	assert.match(
		rejectedInAllowedSource.stderr,
		/stack\.ts: contains forbidden text "@BTST\/STACK" outside an allowed lowercase npm package token/,
	);

	await writeFile(
		join(dirname(manifestPath), "navbar.tsx"),
		"<span>@btst/stack</span>",
	);
	const rejected = spawnSync(
		process.execPath,
		[checker.pathname, manifestPath],
		{
			encoding: "utf8",
		},
	);
	assert.equal(rejected.status, 1);
	assert.match(
		rejected.stderr,
		/navbar\.tsx: contains forbidden text "@BTST\/STACK"/,
	);
});

test("rejects missing declared textual source files", async () => {
	const manifestPath = await writeFixture(
		{
			version: 1,
			assetRevision: 1,
			kitMaxBytes: 1_800_000,
			forbiddenText: ["Better Stack"],
			textSources: ["missing-source.mjs"],
			assets: [
				{
					file: "ownership.svg",
					format: "svg",
					width: 1600,
					height: 900,
					maxBytes: 100_000,
					alt: "BTST ownership boundaries.",
					caption: "The app remains yours.",
					source: "missing-source.mjs",
					decorative: false,
				},
			],
		},
		{ writeSources: false },
	);

	const result = spawnSync(process.execPath, [checker.pathname, manifestPath], {
		encoding: "utf8",
	});

	assert.equal(result.status, 1);
	assert.match(
		result.stderr,
		/missing-source.mjs: text source file does not exist/,
	);
});

test("rejects a drifted Blog backend registration before rendering proof", async () => {
	const { assertBlogRegistrationSources } = await import(
		"../../e2e/product-proof/registration-contract.mjs"
	);
	const backendSource = `
		createBackendStack({
			plugins: {
				blog: renamedBlogPlugin({ hooks: blogHooks }),
			},
		});
	`;
	const clientSource = `
		createClientStack({
			plugins: {
				blog: blogClientPlugin({
					seo: {
						siteName: "BTST Blog",
						author: "BTST Team",
					},
				}),
			},
		});
	`;

	assert.throws(
		() => assertBlogRegistrationSources({ backendSource, clientSource }),
		/Blog backend registration proof drifted from scripts\/codegen\/files\/nextjs\/lib\/stack\.ts/,
	);
});

test("rejects a drifted Blog client registration before rendering proof", async () => {
	const { assertBlogRegistrationSources } = await import(
		"../../e2e/product-proof/registration-contract.mjs"
	);
	const backendSource = `
		createBackendStack({
			plugins: {
				blog: blogBackendPlugin({ hooks: blogHooks }),
			},
		});
	`;
	const clientSource = `
		createClientStack({
			plugins: {
				blog: renamedBlogClientPlugin({
					seo: {
						siteName: "BTST Blog",
						author: "BTST Team",
					},
				}),
			},
		});
	`;

	assert.throws(
		() => assertBlogRegistrationSources({ backendSource, clientSource }),
		/Blog client registration proof drifted from scripts\/codegen\/files\/nextjs\/lib\/stack-client\.tsx/,
	);
});

test("derives the displayed Blog proof from the current generated-app sources", async () => {
	const { assertBlogRegistrationSources } = await import(
		"../../e2e/product-proof/registration-contract.mjs"
	);
	const [backendSource, clientSource] = await Promise.all([
		readFile("scripts/codegen/files/nextjs/lib/stack.ts", "utf8"),
		readFile("scripts/codegen/files/nextjs/lib/stack-client.tsx", "utf8"),
	]);
	const proof = assertBlogRegistrationSources({
		backendSource,
		clientSource,
	});

	assert.deepEqual(proof.backendExcerpt, [
		"blog: blogBackendPlugin({ hooks: blogHooks }),",
	]);
	assert.ok(
		proof.clientExcerpt.some(
			(line) => line.trim() === 'siteName: "BTST Blog",',
		),
		"client excerpt includes current siteName source",
	);
	assert.ok(
		proof.clientExcerpt.some((line) => line.trim() === 'author: "BTST Team",'),
		"client excerpt includes current author source",
	);
	assert.ok(
		proof.clientExcerpt.includes("\t// … hooks unchanged"),
		"client excerpt labels omitted hooks",
	);
	assert.equal(proof.clientExcerpt.at(-1), "}),");
	for (const line of proof.clientExcerpt) {
		if (line.includes("// …")) continue;
		assert.ok(clientSource.includes(line), `client source includes ${line}`);
	}
});
