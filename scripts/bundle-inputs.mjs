import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

// Unknown paths require measurement. Package docs remain inputs to packed archives.
export function bundleInputsChanged(paths) {
	return paths.some(
		(path) =>
			!(
				/^(?:docs|\.agents|e2e|playground|examples)\//.test(path) ||
				/^\.changeset\/[^/]+\.md$/.test(path) ||
				/^(?:AGENTS|CLAUDE|CONTRIBUTING|README)\.md$/.test(path)
			),
	);
}

export function changedBundleInputs(base, head, cwd = process.cwd()) {
	const paths = execFileSync(
		"git",
		["diff", "--name-only", "--no-renames", "-z", base, head, "--"],
		{ cwd, encoding: "utf8" },
	)
		.split("\0")
		.filter(Boolean);
	return bundleInputsChanged(paths);
}

export function validateBaseline(snapshot, revision) {
	assert.equal(snapshot.revision, revision, "Bundle baseline source differs");
	assert(
		Array.isArray(snapshot.entries),
		"Missing baseline module measurements",
	);
	assert(
		Array.isArray(snapshot.unavailable),
		"Missing unavailable baseline exports",
	);
	assert(
		snapshot.archives?.length > 0,
		"Missing baseline archive measurements",
	);
	for (const archive of snapshot.archives) {
		assert.equal(archive.gitHead, revision, "Baseline archive source differs");
		assert(archive.bytes > 0 && archive.integrity?.startsWith("sha512-"));
	}
}

if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(process.argv[1]).href
) {
	if (process.argv[2] === "validate") {
		validateBaseline(
			JSON.parse(await readFile(process.argv[3], "utf8")),
			process.argv[4],
		);
	} else {
		console.log(changedBundleInputs(process.argv[2], process.argv[3]));
	}
}
