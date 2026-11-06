import "./media-runtime.mjs";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { vercelBlobAdapter } from "@btst/plugin-media/api/adapters/vercel-blob";
import { vercelBlobUpload } from "@btst/plugin-media/client/vercel-blob";

const require = createRequire(import.meta.url);
assert.equal(
	typeof require("@btst/plugin-media/api/adapters/vercel-blob")
		.vercelBlobAdapter,
	"function",
);
assert.equal(vercelBlobAdapter({ token: "fixture-token" }).type, "vercel-blob");
assert.equal(typeof vercelBlobUpload, "function");
assert.ok(require.resolve("@vercel/blob/client"));
