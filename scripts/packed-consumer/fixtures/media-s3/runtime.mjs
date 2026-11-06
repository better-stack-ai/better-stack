import "./media-runtime.mjs";
import assert from "node:assert/strict";
import { s3Adapter } from "@btst/plugin-media/api/adapters/s3";

const adapter = s3Adapter({
	bucket: "media",
	region: "us-east-1",
	accessKeyId: "fixture-key",
	secretAccessKey: "fixture-secret",
	endpoint: "https://storage.example.test",
	publicBaseUrl: "https://assets.example.test",
});
const token = await adapter.generateUploadToken({
	filename: "photo.jpg",
	mimeType: "image/jpeg",
	size: 5,
});
assert.equal(token.type, "presigned-url");
assert.equal(
	new URL(token.payload.uploadUrl).origin,
	"https://storage.example.test",
);
assert.ok(new URL(token.payload.uploadUrl).searchParams.has("X-Amz-Signature"));
assert.match(token.payload.publicUrl, /^https:\/\/assets\.example\.test\//);
