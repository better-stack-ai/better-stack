import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";

const description = "Temporary package placeholder for staged publishing";
const readme =
	"# Temporary Holding Version\n\nThis version is a temporary placeholder for this package. An operational version to replace this has been submitted for review and is awaiting a staged release.\n";

export async function verifyNpmStagingPlaceholder(
	published,
	name,
	fetchArchive = fetch,
) {
	assert.equal(published.name, name);
	assert.equal(published.version, "0.0.0-stage");
	assert.equal(published.stub, true);
	assert.equal(published.gitHead, undefined);
	assert.equal(published.description, description);
	for (const field of [
		"scripts",
		"bin",
		"main",
		"module",
		"exports",
		"browser",
		"dependencies",
		"optionalDependencies",
		"peerDependencies",
		"bundledDependencies",
		"bundleDependencies",
		"gypfile",
	])
		assert.equal(
			published[field],
			undefined,
			`Staging placeholder has ${field}`,
		);
	assert.equal(published.dist?.fileCount, 2);
	assert(
		Number.isInteger(published.dist.unpackedSize) &&
			published.dist.unpackedSize > 0 &&
			published.dist.unpackedSize <= 4096,
	);
	const tarball = `https://registry.npmjs.org/${name}/-/${name.split("/").at(-1)}-0.0.0-stage.tgz`;
	assert.equal(
		published.dist.tarball,
		tarball,
		"Staging placeholder must come from the npm registry",
	);
	const response = await fetchArchive(tarball, {
		redirect: "error",
		signal: AbortSignal.timeout(10000),
	});
	assert(response.ok, `Staging placeholder archive HTTP ${response.status}`);
	const chunks = [];
	let size = 0;
	for await (const chunk of response.body) {
		size += chunk.length;
		assert(size <= 16384, "Staging placeholder archive exceeds size limit");
		chunks.push(chunk);
	}
	const compressed = Buffer.concat(chunks);
	assert.equal(
		`sha512-${createHash("sha512").update(compressed).digest("base64")}`,
		published.dist.integrity,
		"Staging placeholder archive integrity mismatch",
	);
	const archive = gunzipSync(compressed, { maxOutputLength: 16384 });
	const tar = (...args) =>
		execFileSync("tar", args, {
			input: archive,
			encoding: "utf8",
			maxBuffer: 8192,
			timeout: 5000,
		});
	const paths = tar("-tf", "-").trim().split("\n");
	assert(paths.length <= 3);
	assert.deepEqual(
		paths.filter((path) => path !== "package" && path !== "package/").sort(),
		["package/README.md", "package/package.json"],
	);
	const members = tar("-tvf", "-").trim().split("\n");
	assert.equal(members.length, paths.length);
	for (const [index, path] of paths.entries())
		assert.equal(
			members[index][0],
			path === "package" || path === "package/" ? "d" : "-",
			"Staging placeholder has an unexpected member type",
		);
	const manifestText = tar("-xOf", "-", "package/package.json");
	const readmeText = tar("-xOf", "-", "package/README.md");
	assert.deepEqual(JSON.parse(manifestText), {
		name,
		version: "0.0.0-stage",
		stub: true,
		description,
	});
	assert.equal(readmeText, readme);
	assert.equal(
		Buffer.byteLength(manifestText) + Buffer.byteLength(readmeText),
		published.dist.unpackedSize,
	);
	return {
		name,
		version: published.version,
		integrity: published.dist.integrity,
		kind: "npm-staging-placeholder",
		archiveVerified: true,
	};
}
