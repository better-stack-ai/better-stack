import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { test } from "node:test";
import { publishCohort, selectCohort } from "./cohort.mjs";

const sha = "a".repeat(40);
const manifests = {
	"packages/stack/package.json": { name: "@btst/stack", version: "6.0.0" },
	"packages/plugin-blog/package.json": {
		name: "@btst/plugin-blog",
		version: "1.0.0",
		peerDependencies: { "@btst/stack": ">=6 <7" },
	},
	"packages/cli/package.json": { name: "@btst/codegen", version: "6.0.0" },
	"packages/ui/package.json": {
		name: "@workspace/ui",
		version: "0.0.0",
		private: true,
	},
};
const tags = [
	"@btst/stack@6.0.0",
	"@btst/plugin-blog@1.0.0",
	"@btst/codegen@6.0.0",
];
const readGit = (command, ref) => {
	if (command === "ls-tree") return Object.keys(manifests).join("\n");
	if (command === "status") return "";
	if (command === "rev-parse") return sha;
	return JSON.stringify(manifests[ref.slice(sha.length + 1)]);
};
const select = (options = {}) =>
	selectCohort({
		tags,
		sha,
		primaryTag: tags[0],
		ref: `refs/tags/${tags[0]}`,
		readGit,
		...options,
	});

test("cohort selects an explicit complete dependency-ordered tagged source", () => {
	assert.deepEqual(
		select().map((release) => release.name),
		["@btst/stack", "@btst/plugin-blog", "@btst/codegen"],
	);
	for (const invalid of [
		null,
		{},
		tags.slice(0, 2),
		[tags[0], tags[0], tags[2]],
		[tags[1], tags[0], tags[2]],
		[tags[0], tags[2], tags[1]],
		["v6.0.0", tags[1], tags[2]],
		[tags[0], "@btst/plugin-blog@9.0.0", tags[2]],
		[tags[0], "@workspace/ui@0.0.0", tags[2]],
	]) {
		assert.throws(() => select({ tags: invalid }));
	}
	assert.throws(() => select({ ref: "refs/heads/main" }), /workflow ref/);
	assert.throws(
		() =>
			select({
				readGit: (command, ...args) =>
					command === "rev-parse" ? "b".repeat(40) : readGit(command, ...args),
			}),
		/source mismatch/,
	);
	assert.throws(
		() =>
			select({
				readGit: (command, ...args) =>
					command === "status" ? " M source.ts" : readGit(command, ...args),
			}),
		/clean/,
	);
});

test("cohort rejects dependency inversions even when Core and CLI bookend the set", () => {
	const dependency = "packages/plugin-newsletter/package.json";
	const additional = {
		...manifests,
		[dependency]: {
			name: "@btst/plugin-newsletter",
			version: "1.0.0",
			peerDependencies: { "@btst/plugin-blog": "^1.0.0" },
		},
	};
	assert.throws(
		() =>
			select({
				tags: [tags[0], "@btst/plugin-newsletter@1.0.0", tags[1], tags[2]],
				readGit: (command, ref, ...args) =>
					command === "ls-tree"
						? Object.keys(additional).join("\n")
						: command === "show"
							? JSON.stringify(additional[ref.slice(sha.length + 1)])
							: readGit(command, ref, ...args),
			}),
		/dependency must publish first/,
	);
});

async function exercise(options = {}) {
	const destination = await mkdtemp(join(tmpdir(), "btst-cohort-"));
	const events = [];
	const artifacts = new Map();
	try {
		const releases = select();
		await publishCohort({
			releases,
			destination,
			pack: async ({ packageDir, destination: directory, expectedSha }) => {
				const manifest = manifests[`${packageDir}/package.json`];
				events.push(`pack:${manifest.name}`);
				if (options.packFailure === manifest.name)
					throw new Error("pack failed");
				const artifact = {
					path: join(directory, "archive.tgz"),
					name: manifest.name,
					version: manifest.version,
					gitHead: expectedSha,
					integrity: "sha512-sealed",
				};
				artifacts.set(artifact.path, artifact);
				return artifact;
			},
			inspect: async (path) =>
				options.tamper
					? { ...artifacts.get(path), integrity: "sha512-tampered" }
					: artifacts.get(path),
			run: (command, args) => {
				if (command === "npm") {
					assert.deepEqual(args.slice(2), [
						"--access",
						"public",
						"--provenance",
						"--tag",
						"latest",
					]);
					events.push(`publish:${artifacts.get(args[1]).name}`);
					return;
				}
				if (basename(args[0]) === "gate.mjs") {
					const name = args[args.indexOf("--publishing") + 1];
					events.push(`gate:${name}`);
					if (options.gateFailure === name) throw new Error("gate failed");
					const gate = {
						passed: true,
						mode: "publication",
						publication_ready: true,
						candidate_sha: sha,
						freshness: { observations: 2 },
						publication: [
							{
								package: name,
								outcome:
									options.alreadyPublished === name
										? "already-published"
										: "published-source-is-ancestor",
							},
						],
					};
					if (options.invalidGate) gate.freshness.observations = 1;
					return writeFileSync(args.at(-1), JSON.stringify(gate));
				}
				assert.equal(basename(args[0]), "verify-publication.mjs");
				events.push(`verify:${basename(join(args[1], ".."))}`);
				if (options.verifyFailure) throw new Error("verification failed");
			},
		});
		return events;
	} catch (error) {
		error.events = events;
		throw error;
	} finally {
		await rm(destination, { recursive: true, force: true });
	}
}

test("cohort seals all archives before serial gated signed publication", async () => {
	const events = await exercise();
	assert.deepEqual(events, [
		"pack:@btst/stack",
		"pack:@btst/plugin-blog",
		"pack:@btst/codegen",
		"gate:@btst/stack",
		"publish:@btst/stack",
		"verify:stack",
		"gate:@btst/plugin-blog",
		"publish:@btst/plugin-blog",
		"verify:plugin-blog",
		"gate:@btst/codegen",
		"publish:@btst/codegen",
		"verify:codegen",
	]);
});

test("pack, gate, archive and verification failures prevent later publication", async () => {
	for (const options of [
		{ packFailure: "@btst/codegen" },
		{ gateFailure: "@btst/stack" },
		{ invalidGate: true },
		{ tamper: true },
		{ verifyFailure: true },
	]) {
		await assert.rejects(exercise(options), (error) => {
			assert.ok(!error.events.includes("publish:@btst/plugin-blog"));
			if (!options.verifyFailure)
				assert.ok(!error.events.includes("publish:@btst/stack"));
			return true;
		});
	}
});

test("reconciled owners are verified without another npm publish", async () => {
	const events = await exercise({ alreadyPublished: "@btst/stack" });
	assert.ok(!events.includes("publish:@btst/stack"));
	assert.ok(events.includes("verify:stack"));
	assert.ok(events.includes("publish:@btst/codegen"));
});

test("workflow shares one build and keeps single-package and cohort receipts separate", async () => {
	const workflow = await readFile(
		new URL("../../.github/workflows/release.yml", import.meta.url),
		"utf8",
	);
	assert.equal((workflow.match(/run: pnpm typecheck/g) ?? []).length, 1);
	assert.match(
		workflow,
		/Publish explicit cohort from one build[\s\S]*cohort\.mjs --publish/,
	);
	assert.match(
		workflow,
		/Save publication receipts\n\s+if: always\(\) && inputs\.release_tags == ''/,
	);
	assert.match(
		workflow,
		/Save cohort publication receipts\n\s+if: always\(\) && inputs\.release_tags != ''/,
	);
});
