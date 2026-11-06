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
	let integrity = artifact.integrity;
	if (source.outcome === "already-published") {
		assert.equal(source.package, release.name, "Reconciled package mismatch");
		assert.equal(
			source.version,
			release.version,
			"Reconciled version mismatch",
		);
		assert.equal(source.dist_tag, release.distTag, "Reconciled tag mismatch");
		const original = {
			version: release.version,
			sha: release.sha,
			integrity: source.source?.integrity,
		};
		assert.ok(
			typeof original.integrity === "string" && original.integrity.length > 0,
			"Reconciled integrity is missing",
		);
		assert.deepEqual(source.source, original, "Reconciled source mismatch");
		assert.deepEqual(
			source.tagged,
			original,
			"Reconciled tag receipt mismatch",
		);
		integrity = original.integrity;
	}
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
			integrity,
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
	if (source.initialPrerelease) {
		const latest = await registry(release.name, "latest", true);
		const expected = source.prereleaseLatest ?? {
			version: release.version,
			sha: release.sha,
			integrity,
		};
		assert.ok(
			!source.prereleaseLatest || latest,
			"Initial prerelease latest tag disappeared",
		);
		if (latest)
			assert.deepEqual(
				{
					version: latest.version,
					sha: latest.gitHead,
					integrity: latest.dist?.integrity,
				},
				expected,
				"Initial prerelease latest tag changed unexpectedly",
			);
	}
	return {
		package: release.name,
		version: release.version,
		dist_tag: release.distTag,
		gitHead: release.sha,
		integrity,
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
	assert.equal(
		gate.candidate_sha,
		release.sha,
		"Publication preflight source mismatch",
	);
	assert.equal(
		gate.freshness?.observations,
		2,
		"Publication preflight requires both observations",
	);
	const source = gate.publication.find((item) => item.package === release.name);
	assert.ok(source, "Publication source receipt is missing");
	const registry = async (name, version, allowMissing = false) => {
		const response = await fetch(
			`https://registry.npmjs.org/${encodeURIComponent(name)}/${encodeURIComponent(version)}`,
			{ signal: AbortSignal.timeout(30000) },
		);
		if (allowMissing && response.status === 404) return null;
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
