import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const textExtensions = new Set([
	".hbs",
	".js",
	".json",
	".jsx",
	".md",
	".mdx",
	".mjs",
	".ts",
	".tsx",
]);

const guidanceTargets = [
	"README.md",
	"CONTRIBUTING.md",
	"docs/content/docs",
	".agents/skills",
];
const generatedTargets = [
	"scripts/codegen/README.md",
	"scripts/codegen/files",
	"packages/cli/src/templates",
	"packages/cli/scripts/fixtures",
	"packages/stack/scripts/fixtures/registry/README.md",
	"packages/stack/registry",
	"playground/src",
];

// Exact historical inputs are immutable negative fixtures, not maintained
// examples. Their README and hash allowlist fail closed if their bytes change.
const guardExclusions = new Map([
	[
		"packages/cli/scripts/fixtures/legacy-next",
		"immutable pre-migration CLI inputs documented by the fixture README",
	],
]);

const backendFactories = [
	"aiChatBackendPlugin",
	"blogBackendPlugin",
	"cmsBackendPlugin",
	"commentsBackendPlugin",
	"formBuilderBackendPlugin",
	"kanbanBackendPlugin",
	"mediaBackendPlugin",
	"openApiBackendPlugin",
];
const clientFactories = [
	"aiChatClientPlugin",
	"blogClientPlugin",
	"cmsClientPlugin",
	"commentsClientPlugin",
	"formBuilderClientPlugin",
	"kanbanClientPlugin",
	"mediaClientPlugin",
	"routeDocsClientPlugin",
	"uiBuilderClientPlugin",
];
const pluginIds = [
	"aiChat",
	"blog",
	"cms",
	"comments",
	"formBuilder",
	"kanban",
	"media",
	"openApi",
	"routeDocs",
	"uiBuilder",
];
const removedPluginIds = [
	"ai-chat",
	"form-builder",
	"open-api",
	"route-docs",
	"ui-builder",
];

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const pluginIdPattern = pluginIds.map(escapeRegExp).join("|");
const removedPluginIdPattern = removedPluginIds.map(escapeRegExp).join("|");

function collectFiles(target) {
	for (const excluded of guardExclusions.keys()) {
		if (target === excluded || target.startsWith(`${excluded}/`)) return [];
	}
	const absolute = join(root, target);
	if (!statSync(absolute).isDirectory()) return [absolute];
	const files = [];
	for (const entry of readdirSync(absolute, { withFileTypes: true })) {
		if (entry.name === "node_modules") continue;
		const child = join(absolute, entry.name);
		if (entry.isDirectory()) {
			files.push(...collectFiles(relative(root, child)));
		} else if (textExtensions.has(extname(entry.name))) {
			files.push(child);
		}
	}
	return files;
}

function stripMigrationBlocks(source, file) {
	const startPattern =
		/^\s*\{\/\* canonical-dx-guard: migration:start reason="[^"]+" \*\/\}\s*$/;
	const endPattern = /^\s*\{\/\* canonical-dx-guard: migration:end \*\/\}\s*$/;
	let insideMigration = false;
	const stripped = source
		.split("\n")
		.map((line, index) => {
			if (startPattern.test(line)) {
				if (insideMigration) {
					throw new Error(
						`${file}:${index + 1}: nested canonical DX migration marker`,
					);
				}
				insideMigration = true;
				return "";
			}
			if (endPattern.test(line)) {
				if (!insideMigration) {
					throw new Error(
						`${file}:${index + 1}: unmatched canonical DX migration marker`,
					);
				}
				insideMigration = false;
				return "";
			}
			return insideMigration ? "" : line;
		})
		.join("\n");
	if (insideMigration) {
		throw new Error(`${file}: unclosed canonical DX migration marker`);
	}
	return stripped;
}

function lineAt(source, index) {
	return source.slice(0, index).split("\n").length;
}

function recordMatches(failures, file, source, label, pattern) {
	for (const match of source.matchAll(pattern)) {
		failures.push({
			file,
			line: lineAt(source, match.index ?? 0),
			label,
			match: match[0].replace(/\s+/g, " ").slice(0, 100),
		});
	}
}

function readTopLevelObject(source, openIndex) {
	let depth = 0;
	let quote;
	let escaped = false;
	let lineComment = false;
	let blockComment = false;
	let topLevel = "";

	for (let index = openIndex; index < source.length; index += 1) {
		const char = source[index];
		const next = source[index + 1];

		if (lineComment) {
			if (char === "\n") lineComment = false;
			if (depth <= 1) topLevel += char;
			continue;
		}
		if (blockComment) {
			if (char === "*" && next === "/") {
				blockComment = false;
				index += 1;
			}
			if (depth <= 1) topLevel += char === "\n" ? "\n" : " ";
			continue;
		}
		if (quote) {
			if (escaped) escaped = false;
			else if (char === "\\") escaped = true;
			else if (char === quote) quote = undefined;
			if (depth <= 1) topLevel += char;
			else if (char === "\n") topLevel += "\n";
			continue;
		}
		if (char === "/" && next === "/") {
			lineComment = true;
			if (depth <= 1) topLevel += "  ";
			index += 1;
			continue;
		}
		if (char === "/" && next === "*") {
			blockComment = true;
			if (depth <= 1) topLevel += "  ";
			index += 1;
			continue;
		}
		if (char === '"' || char === "'" || char === "`") {
			quote = char;
			if (depth <= 1) topLevel += char;
			continue;
		}
		if (char === "{") {
			depth += 1;
			topLevel += depth <= 1 ? char : " ";
			continue;
		}
		if (char === "}") {
			depth -= 1;
			topLevel += depth <= 1 ? char : " ";
			if (depth === 0) return { end: index, topLevel };
			continue;
		}
		topLevel += depth <= 1 || char === "\n" ? char : " ";
	}

	return undefined;
}

function checkFactoryCalls(
	failures,
	file,
	source,
	factory,
	kind,
	contextualLifecycleNames = [],
) {
	const callPattern = new RegExp(`\\b${factory}\\(`, "g");
	for (const match of source.matchAll(callPattern)) {
		let cursor = (match.index ?? 0) + match[0].length;
		while (/\s/.test(source[cursor] ?? "")) cursor += 1;
		if (source[cursor] === ")") continue;
		if (source[cursor] !== "{") {
			if (kind === "client") continue;
			failures.push({
				file,
				line: lineAt(source, match.index ?? 0),
				label: `${kind} factory example must use one inline options object`,
				match: factory,
			});
			continue;
		}
		const object = readTopLevelObject(source, cursor);
		if (!object) continue;
		if (
			kind === "backend" &&
			/\bon(?:Before|After|Error)[A-Z][A-Za-z0-9]*\s*:/.test(object.topLevel)
		) {
			failures.push({
				file,
				line: lineAt(source, match.index ?? 0),
				label: "backend lifecycle callbacks must be nested under hooks",
				match: factory,
			});
		}
		if (kind === "backend" && contextualLifecycleNames.length > 0) {
			const callSource = source.slice(cursor, object.end + 1);
			for (const name of contextualLifecycleNames) {
				const propertyPattern = new RegExp(
					`\\b${escapeRegExp(name)}\\b(?=\\s*(?:\\??:|,|\\}))`,
					"g",
				);
				for (const lifecycleMatch of callSource.matchAll(propertyPattern)) {
					failures.push({
						file,
						line: lineAt(source, cursor + (lifecycleMatch.index ?? 0)),
						label: `${factory} uses a removed lifecycle callback`,
						match: name,
					});
				}
			}
		}
		if (
			kind === "client" &&
			/\b(?:apiBaseURL|apiBasePath|siteBaseURL|siteBasePath|queryClient|headers)\s*:/.test(
				object.topLevel,
			)
		) {
			failures.push({
				file,
				line: lineAt(source, match.index ?? 0),
				label: "client plugin duplicates stack-owned runtime",
				match: factory,
			});
		}
	}
}

function lifecycleInventory() {
	const inventories = [
		["ai-chat", "aiChatBackendPlugin"],
		["blog", "blogBackendPlugin"],
		["cms", "cmsBackendPlugin"],
		["comments", "commentsBackendPlugin"],
		["form-builder", "formBuilderBackendPlugin"],
		["kanban", "kanbanBackendPlugin"],
		["media", "mediaBackendPlugin"],
	];
	const names = new Set();
	const namesByFactory = new Map();
	for (const [plugin, factory] of inventories) {
		const source = readFileSync(
			join(
				root,
				`packages/stack/src/plugins/${plugin}/api/lifecycle-migrations.ts`,
			),
			"utf8",
		);
		const object = source.match(
			/Object\.freeze\(\{([\s\S]*?)\}\s+as const\)/,
		)?.[1];
		if (!object)
			throw new Error(`Unable to read ${plugin} lifecycle inventory`);
		const pluginNames = [...object.matchAll(/^\s*([A-Za-z0-9]+):/gm)].map(
			(match) => match[1],
		);
		for (const name of pluginNames) names.add(name);
		namesByFactory.set(factory, pluginNames);
	}
	const contextualNames = new Set([
		"onBeforeCreate",
		"onAfterCreate",
		"onBeforeUpdate",
		"onAfterUpdate",
		"onBeforeDelete",
		"onAfterDelete",
		"onError",
	]);
	return {
		globalNames: [...names].filter((name) => !contextualNames.has(name)),
		contextualNamesByFactory: new Map(
			[...namesByFactory].map(([factory, pluginNames]) => [
				factory,
				pluginNames.filter((name) => contextualNames.has(name)),
			]),
		),
	};
}

const guidanceFiles = guidanceTargets.flatMap(collectFiles);
const generatedFiles = generatedTargets.flatMap(collectFiles);
const allFiles = [...new Set([...guidanceFiles, ...generatedFiles])];
const generatedSet = new Set(generatedFiles);
const { globalNames: removedLifecycleNames, contextualNamesByFactory } =
	lifecycleInventory();
const failures = [];

for (const absolute of allFiles) {
	const file = relative(root, absolute);
	const source = stripMigrationBlocks(readFileSync(absolute, "utf8"), file);

	recordMatches(
		failures,
		file,
		source,
		"removed constructor",
		/\bcreateStackClient\b|\bstack\s*\(|import\s*\{[^}\n]*\bstack\b[^}\n]*\}\s*from\s*["']@btst\/stack(?:\/api)?["']/g,
	);
	recordMatches(
		failures,
		file,
		source,
		"manual StackProvider generic",
		/\bStackProvider[ \t]*</g,
	);
	recordMatches(
		failures,
		file,
		source,
		"manual provider override map",
		new RegExp(
			`\\btype\\s+\\w*(?:PluginOverrides|Overrides)\\s*=\\s*\\{[\\s\\S]{0,1200}?(?:${pluginIdPattern}|["'](?:${removedPluginIdPattern})["'])\\s*:`,
			"g",
		),
	);
	recordMatches(
		failures,
		file,
		source,
		"duplicated StackProvider runtime",
		/<StackProvider\b(?:(?!>).){0,2000}\b(?:api|basePath)=/gs,
	);
	recordMatches(
		failures,
		file,
		source,
		"removed programmatic plugin ID",
		new RegExp(
			`["'](?:${removedPluginIdPattern})["']\\s*:\\s*\\w+(?:Backend|Client)Plugin`,
			"g",
		),
	);
	recordMatches(
		failures,
		file,
		source,
		"removed plugin registration or override key",
		new RegExp(
			`\\b(?:plugins|overrides)\\s*(?:=|:)\\s*\\{[\\s\\S]{0,3000}?["'](?:${removedPluginIdPattern})["']\\s*:|\\bplugin\\s*:\\s*["'](?:${removedPluginIdPattern})["']`,
			"g",
		),
	);
	recordMatches(
		failures,
		file,
		source,
		"removed intrinsic plugin ID",
		new RegExp(`\\bid\\s*:\\s*["'](?:${removedPluginIdPattern})["']`, "g"),
	);
	recordMatches(
		failures,
		file,
		source,
		"ambiguous server namespace",
		new RegExp(
			`\\.(?:api|internal)\\.(?:${pluginIdPattern})\\b|\\.forRequest\\([^)]*\\)\\.api\\b`,
			"g",
		),
	);

	for (const factory of backendFactories) {
		checkFactoryCalls(
			failures,
			file,
			source,
			factory,
			"backend",
			contextualNamesByFactory.get(factory),
		);
	}
	for (const factory of clientFactories) {
		checkFactoryCalls(failures, file, source, factory, "client");
	}
	for (const name of removedLifecycleNames) {
		recordMatches(
			failures,
			file,
			source,
			"removed lifecycle callback",
			new RegExp(`\\b${escapeRegExp(name)}\\b`, "g"),
		);
	}

	if (generatedSet.has(absolute)) {
		recordMatches(
			failures,
			file,
			source,
			"provider-specific identity bridge in generated source",
			/better-auth\.session_token|@btst\/better-auth-ui|\bcreateBetterAuth\w*/g,
		);
	}
}

if (failures.length > 0) {
	console.error(
		"Canonical DX guard found legacy maintained guidance or sources:",
	);
	for (const failure of failures) {
		console.error(
			`- ${failure.file}:${failure.line} ${failure.label}: ${failure.match}`,
		);
	}
	process.exitCode = 1;
} else {
	console.log(
		`Canonical DX guard passed (${allFiles.length} maintained guidance/generated files).`,
	);
}
