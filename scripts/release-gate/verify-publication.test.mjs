import assert from "node:assert/strict";
import { test } from "node:test";
import { verifyPublication } from "./verify-publication.mjs";

test("publication verification requires the selected artifact and preserves its stable channel", async () => {
	const release = {
		name: "@btst/plugin-blog",
		version: "1.1.0-next.0",
		distTag: "next",
		sha: "a".repeat(40),
	};
	const artifact = {
		name: release.name,
		version: release.version,
		gitHead: release.sha,
		integrity: "sha512-candidate",
	};
	const published = {
		name: release.name,
		version: release.version,
		gitHead: release.sha,
		dist: { integrity: artifact.integrity },
	};
	const stable = {
		version: "1.0.0",
		sha: "b".repeat(40),
		integrity: "sha512-stable",
	};
	const calls = [];
	const registry = async (name, version) => {
		calls.push(name);
		return version === "latest"
			? {
					name,
					version: stable.version,
					gitHead: stable.sha,
					dist: { integrity: stable.integrity },
				}
			: published;
	};
	await verifyPublication({ release, artifact, source: { stable }, registry });
	assert.deepEqual([...new Set(calls)], [release.name]);
	for (const changed of [
		{ ...published, gitHead: "c".repeat(40) },
		{ ...published, dist: { integrity: "sha512-wrong" } },
		{ ...published, version: "2.0.0" },
	]) {
		await assert.rejects(
			verifyPublication({
				release,
				artifact,
				source: { stable },
				registry: async () => changed,
			}),
		);
	}
	await assert.rejects(
		verifyPublication({
			release,
			artifact,
			source: { stable },
			registry: async (name, version) =>
				version === "latest" ? published : registry(name, version),
		}),
		/Stable/,
	);
});
