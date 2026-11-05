import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export async function verifyPublication({
	release,
	artifact,
	source,
	registry,
}) {
	assert.equal(artifact.name, release.name);
	assert.equal(artifact.version, release.version);
	assert.equal(artifact.gitHead, release.sha);
	for (const version of [release.version, release.distTag]) {
		const published = await registry(release.name, version);
		assert.equal(
			published?.name,
			release.name,
			"Published package identity mismatch",
		);
		assert.equal(
			published.version,
			release.version,
			"Published version/tag mismatch",
		);
		assert.equal(published.gitHead, release.sha, "Published source mismatch");
		assert.equal(
			published.dist?.integrity,
			artifact.integrity,
			"Published artifact integrity mismatch",
		);
	}
	if (source.stable) {
		const latest = await registry(release.name, "latest");
		assert.deepEqual(
			{
				version: latest?.version,
				sha: latest?.gitHead,
				integrity: latest?.dist?.integrity,
			},
			source.stable,
			"Stable channel changed during prerelease publication",
		);
	}
	return {
		package: release.name,
		version: release.version,
		dist_tag: release.distTag,
		gitHead: release.sha,
		integrity: artifact.integrity,
	};
}

if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(process.argv[1]).href
) {
	const [metadataFile, artifactFile, gateFile, outputFile] =
		process.argv.slice(2);
	assert.ok(
		metadataFile && artifactFile && gateFile && outputFile,
		"Usage: verify-publication.mjs <release.json> <artifact.json> <gate.json> <output.json>",
	);
	const json = async (file) => JSON.parse(await readFile(file, "utf8"));
	const release = await json(metadataFile);
	const artifact = await json(artifactFile);
	const gate = await json(gateFile);
	assert.ok(
		gate.passed && gate.mode === "publication" && gate.publication_ready,
		"Publication preflight did not pass",
	);
	const source = gate.publication.find((item) => item.package === release.name);
	assert.ok(source, "Publication source receipt is missing");
	const registry = async (name, version) => {
		const response = await fetch(
			`https://registry.npmjs.org/${encodeURIComponent(name)}/${encodeURIComponent(version)}`,
			{ signal: AbortSignal.timeout(30000) },
		);
		assert.ok(
			response.ok,
			`Registry ${response.status} for ${name}@${version}`,
		);
		return response.json();
	};
	for (let attempt = 1; ; attempt++) {
		try {
			const receipt = await verifyPublication({
				release,
				artifact,
				source,
				registry,
			});
			await writeFile(outputFile, `${JSON.stringify(receipt, null, 2)}\n`);
			break;
		} catch (error) {
			if (attempt === 90) throw error;
			console.error(
				`Waiting for selected publication (${attempt}/90): ${error.message}`,
			);
			await new Promise((resolve) => setTimeout(resolve, 10000));
		}
	}
}
