import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { builtinModules } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";
import { build } from "esbuild";

const runtimes = [
	"react",
	"react-dom",
	"next",
	"react-router",
	"@tanstack/react-router",
];

const external = [...runtimes, ...builtinModules, "node:*"];

function groupFor(subpath) {
	const parts = subpath.split("/");
	if (parts[1] === "plugins" && !["api", "client"].includes(parts[2])) {
		return `Plugin: ${parts[2]}`;
	}
	if (parts[1] === "components") return "Components";
	if (["next", "react-router", "tanstack"].includes(parts[1])) {
		return "Framework adapters";
	}
	return "Core";
}

export async function measure(packageDir, revision) {
	packageDir = resolve(packageDir);
	const pkg = JSON.parse(
		await readFile(resolve(packageDir, "package.json"), "utf8"),
	);
	const entries = [];
	const unavailable = [];
	for (const [subpath, entry] of Object.entries(pkg.exports)) {
		if (subpath.includes("*")) continue;
		const target = typeof entry === "string" ? entry : entry.import?.default;
		if (!target || !/\.(mjs|js|css)$/.test(target)) continue;
		const kind = target.endsWith(".css") ? "CSS" : "JavaScript";
		const name = `${pkg.name}${subpath === "." ? "" : subpath.slice(1)}`;
		if (!existsSync(resolve(packageDir, target))) {
			unavailable.push(name);
			continue;
		}
		const result = await build({
			absWorkingDir: packageDir,
			entryPoints: [target],
			bundle: true,
			write: false,
			outdir: "bundle-size-output",
			format: "esm",
			platform: "node",
			target: "es2022",
			minify: true,
			legalComments: "none",
			define: { "process.env.NODE_ENV": '"production"' },
			external,
			logLevel: "silent",
			plugins: [
				{
					name: "stylesheet-assets",
					setup(builder) {
						builder.onResolve({ filter: /.*/ }, (args) => {
							if (
								args.kind === "url-token" ||
								args.path === "tailwindcss" ||
								args.path.startsWith("@tailwindcss/")
							) {
								return { path: args.path, external: true };
							}
						});
					},
				},
			],
		});
		for (const output of result.outputFiles) {
			const outputKind = output.path.endsWith(".css") ? "CSS" : kind;
			entries.push({
				name: `${name}${kind !== outputKind ? " (imported CSS)" : ""}`,
				group: groupFor(subpath),
				kind: outputKind,
				bytes: output.contents.byteLength,
				gzip: gzipSync(output.contents, { level: 9 }).byteLength,
			});
		}
	}
	if (entries.length === 0 && unavailable.length === 0) {
		throw new Error("No public bundles found");
	}
	return { revision, entries, unavailable };
}

function delta(before, after) {
	const difference = after - before;
	const bytes = `${difference > 0 ? "+" : ""}${difference} B`;
	if (before === 0) return bytes;
	return `${bytes} (${difference > 0 ? "+" : ""}${((difference / before) * 100).toFixed(1)}%)`;
}

export function report(base, head) {
	const before = new Map(base.entries.map((entry) => [entry.name, entry]));
	const after = new Map(head.entries.map((entry) => [entry.name, entry]));
	const unavailable = new Set([...base.unavailable, ...head.unavailable]);
	const rows = [...new Set([...before.keys(), ...after.keys()])]
		.filter((name) => !unavailable.has(name.replace(/ \(imported CSS\)$/, "")))
		.map((name) => {
			const previous = before.get(name);
			const current = after.get(name);
			return { ...(current ?? previous), previous, current };
		});
	const changed = rows.filter(
		({ previous, current }) =>
			!previous ||
			!current ||
			previous.bytes !== current.bytes ||
			previous.gzip !== current.gzip,
	).length;
	const lines = [
		"<!-- btst-bundle-size -->",
		"## BTST module bundle cost",
		"",
		`Merge-base: \`${base.revision}\` · PR head: \`${head.revision}\``,
		"",
		`${changed} of ${rows.length} bundles changed. Reporting only; no size limits.`,
		"",
		"Each row retains the full exported API and bundles its dependencies. Rows overlap; do not sum them.",
		"React, React DOM, Next.js, React Router, TanStack Router (including subpaths), and Node built-ins are excluded.",
		"Production ESM, ES2022, Node resolution; these are standalone estimates, not browser application totals.",
		"CSS includes stylesheet imports but excludes URL assets and Tailwind generation. CSS emitted by JavaScript imports is listed separately.",
	];
	for (const [label, snapshot] of [
		["Merge-base", base],
		["PR head", head],
	]) {
		if (snapshot.unavailable.length) {
			lines.push(
				"",
				`**${label}: missing declared build outputs**: ${snapshot.unavailable.map((name) => `\`${name}\``).join(", ")}. No size comparison is available for these exports.`,
			);
		}
	}
	const groups = [...new Set(rows.map((row) => row.group))].sort();
	for (const group of groups) {
		for (const kind of ["JavaScript", "CSS"]) {
			const members = rows
				.filter((row) => row.group === group && row.kind === kind)
				.sort((a, b) => {
					const growth = (row) =>
						(row.current?.gzip ?? 0) - (row.previous?.gzip ?? 0);
					return growth(b) - growth(a) || a.name.localeCompare(b.name);
				});
			if (!members.length) continue;
			lines.push(
				"",
				`### ${group} · ${kind}`,
				"",
				"| Entry point | Minified base → PR | Change | Gzip base → PR | Change |",
				"| --- | ---: | ---: | ---: | ---: |",
			);
			for (const { name, previous, current } of members) {
				const status = !previous ? " (new)" : !current ? " (removed)" : "";
				lines.push(
					`| \`${name}\`${status} | ${previous?.bytes ?? 0} → ${current?.bytes ?? 0} B | ${delta(previous?.bytes ?? 0, current?.bytes ?? 0)} | ${previous?.gzip ?? 0} → ${current?.gzip ?? 0} B | ${delta(previous?.gzip ?? 0, current?.gzip ?? 0)} |`,
				);
			}
		}
	}
	return `${lines.join("\n")}\n`;
}

if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(process.argv[1]).href
) {
	const [command, first, second, third] = process.argv.slice(2);
	if (command === "measure" && first && second && third) {
		await writeFile(
			second,
			JSON.stringify(await measure(first, third), null, 2),
		);
	} else if (command === "report" && first && second && third) {
		const base = JSON.parse(await readFile(first, "utf8"));
		const head = JSON.parse(await readFile(second, "utf8"));
		await writeFile(third, report(base, head));
	} else {
		throw new Error(
			"Usage: bundle-size.mjs measure <package-dir> <output.json> <revision> | report <base.json> <head.json> <output.md>",
		);
	}
}
