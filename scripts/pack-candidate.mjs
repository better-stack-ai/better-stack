import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";

const run = promisify(execFile);

/** Pack with pnpm's dependency normalization and the owning repository's source identity. */
export async function packCandidate({ packageDir, destination, expectedSha }) {
	packageDir = resolve(packageDir);
	destination = resolve(destination);
	const { stdout: head } = await run("git", ["rev-parse", "HEAD"], {
		cwd: packageDir,
	});
	const gitHead = head.trim();
	assert.match(
		gitHead,
		/^[a-f\d]{40}$/,
		"Candidate source must be a Git commit",
	);
	if (expectedSha !== undefined)
		assert.equal(
			gitHead,
			expectedSha,
			"Candidate SHA does not match package source",
		);
	const file = join(packageDir, "package.json");
	const original = await readFile(file);
	const source = JSON.parse(original);
	assert.ok(
		source.name && source.version && !source.private,
		"Candidate must be a public package",
	);
	await mkdir(destination, { recursive: true });
	let path;
	try {
		await writeFile(
			file,
			`${JSON.stringify({ ...source, gitHead }, null, 2)}\n`,
		);
		const result = await run(
			"pnpm",
			["pack", "--json", "--pack-destination", destination],
			{ cwd: packageDir },
		);
		const filename = JSON.parse(result.stdout).filename;
		assert.ok(
			typeof filename === "string" && filename.endsWith(".tgz"),
			"pnpm did not report a package archive",
		);
		path = join(destination, basename(filename));
	} finally {
		await writeFile(file, original);
	}
	const { stdout } = await run("tar", ["-xOf", path, "package/package.json"]);
	const manifest = JSON.parse(stdout);
	assert.equal(manifest.name, source.name, "Packed package identity changed");
	assert.equal(
		manifest.version,
		source.version,
		"Packed package version changed",
	);
	assert.equal(
		manifest.gitHead,
		gitHead,
		"Packed package source identity changed",
	);
	for (const field of [
		"dependencies",
		"peerDependencies",
		"optionalDependencies",
	]) {
		for (const [name, range] of Object.entries(manifest[field] ?? {})) {
			assert.ok(
				!name.startsWith("@workspace/"),
				`Private published dependency: ${name}`,
			);
			assert.doesNotMatch(
				range,
				/^(?:workspace|catalog|file|link):/,
				`Unresolved published dependency: ${name}`,
			);
		}
	}
	const archive = await readFile(path);
	return {
		path,
		name: manifest.name,
		version: manifest.version,
		gitHead,
		manifest,
		bytes: archive.byteLength,
		integrity: `sha512-${createHash("sha512").update(archive).digest("base64")}`,
	};
}

if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(process.argv[1]).href
) {
	const options = {};
	for (let index = 2; index < process.argv.length; index += 2) {
		const name = {
			"--package-dir": "packageDir",
			"--destination": "destination",
			"--sha": "expectedSha",
		}[process.argv[index]];
		assert.ok(
			name && process.argv[index + 1],
			"Usage: pack-candidate.mjs --package-dir <directory> --destination <directory> [--sha <commit>]",
		);
		options[name] = process.argv[index + 1];
	}
	assert.ok(
		options.packageDir && options.destination,
		"Package directory and destination are required",
	);
	console.log(JSON.stringify(await packCandidate(options)));
}
