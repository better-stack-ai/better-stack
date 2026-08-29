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

const backendPlugins = [
	{
		factory: "aiChatBackendPlugin",
		lifecycleSlug: "ai-chat",
		hookType: "AiChatBackendHooks",
		configType: "AiChatBackendConfig",
	},
	{
		factory: "blogBackendPlugin",
		lifecycleSlug: "blog",
		hookType: "BlogBackendHooks",
		configType: "BlogBackendOptions",
	},
	{
		factory: "cmsBackendPlugin",
		lifecycleSlug: "cms",
		hookType: "CMSBackendHooks",
		configType: "CMSBackendConfig",
	},
	{
		factory: "commentsBackendPlugin",
		lifecycleSlug: "comments",
		hookType: "CommentsBackendHooks",
		configType: "CommentsBackendOptions",
	},
	{
		factory: "formBuilderBackendPlugin",
		lifecycleSlug: "form-builder",
		hookType: "FormBuilderBackendHooks",
		configType: "FormBuilderBackendConfig",
	},
	{
		factory: "kanbanBackendPlugin",
		lifecycleSlug: "kanban",
		hookType: "KanbanBackendHooks",
		configType: "KanbanBackendOptions",
	},
	{
		factory: "mediaBackendPlugin",
		lifecycleSlug: "media",
		hookType: "MediaBackendHooks",
		configType: "MediaBackendConfig",
	},
	{ factory: "openApiBackendPlugin", configType: "OpenAPIOptions" },
];
const clientPlugins = [
	{ factory: "aiChatClientPlugin", configType: "AiChatClientConfig" },
	{ factory: "blogClientPlugin", configType: "BlogClientConfig" },
	{ factory: "cmsClientPlugin", configType: "CMSClientConfig" },
	{ factory: "commentsClientPlugin", configType: "CommentsClientConfig" },
	{
		factory: "formBuilderClientPlugin",
		configType: "FormBuilderClientConfig",
	},
	{ factory: "kanbanClientPlugin", configType: "KanbanClientConfig" },
	{ factory: "mediaClientPlugin", configType: "MediaClientConfig" },
	{ factory: "routeDocsClientPlugin", configType: "RouteDocsClientConfig" },
	{ factory: "uiBuilderClientPlugin", configType: "UIBuilderClientConfig" },
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

function isInsideMarkdownInlineCode(source, index) {
	const lineStart = source.lastIndexOf("\n", index - 1) + 1;
	const prefix = source.slice(lineStart, index);
	return (prefix.match(/(?<!`)`(?!`)/g)?.length ?? 0) % 2 === 1;
}

function isInsideCommentProse(source, index) {
	let quote;
	let escaped = false;
	let lineComment = false;
	let blockComment = false;
	for (let cursor = 0; cursor < index; cursor += 1) {
		const char = source[cursor];
		const next = source[cursor + 1];
		if (lineComment) {
			if (char === "\n") lineComment = false;
			continue;
		}
		if (blockComment) {
			if (char === "*" && next === "/") {
				blockComment = false;
				cursor += 1;
			}
			continue;
		}
		if (quote) {
			if (escaped) escaped = false;
			else if (char === "\\") escaped = true;
			else if (char === quote) quote = undefined;
			continue;
		}
		if (char === '"' || char === "'" || char === "`") quote = char;
		else if (char === "/" && next === "/") {
			lineComment = true;
			cursor += 1;
		} else if (char === "/" && next === "*") {
			blockComment = true;
			cursor += 1;
		}
	}
	if (lineComment || blockComment) return true;

	// Registry JSON stores source comments with encoded newlines and tabs.
	const encodedLineStart = source.lastIndexOf("\\n", index);
	if (encodedLineStart < 0) return false;
	const encodedPrefix = source
		.slice(encodedLineStart + 2, index)
		.replaceAll("\\t", "\t");
	return /^\s*(?:\/\/|\*)/.test(encodedPrefix);
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

function recordLifecycleProperties(
	failures,
	file,
	fullSource,
	objectSource,
	baseIndex,
	factory,
	names,
) {
	for (const name of names) {
		const propertyPattern = new RegExp(
			`(?:^|[,{])\\s*${escapeRegExp(name)}\\b(?=\\s*(?:\\??:|\\(|,|\\}))`,
			"gm",
		);
		for (const match of objectSource.matchAll(propertyPattern)) {
			const absoluteIndex =
				baseIndex + (match.index ?? 0) + match[0].indexOf(name);
			failures.push({
				file,
				line: lineAt(fullSource, absoluteIndex),
				label: `${factory} uses a removed lifecycle callback`,
				match: name,
			});
		}
	}
}

function readTopLevelObject(source, openIndex) {
	let depth = 0;
	let roundDepth = 0;
	let squareDepth = 0;
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
			if (depth <= 1) topLevel += char === "\n" ? "\n" : " ";
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
			if (depth <= 1 && roundDepth === 0 && squareDepth === 0) topLevel += char;
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
			if (depth <= 1 && roundDepth === 0 && squareDepth === 0) topLevel += char;
			continue;
		}
		if (char === "(") {
			if (depth <= 1 && roundDepth === 0 && squareDepth === 0) topLevel += char;
			else topLevel += " ";
			roundDepth += 1;
			continue;
		}
		if (char === ")") {
			roundDepth = Math.max(0, roundDepth - 1);
			if (depth <= 1 && roundDepth === 0 && squareDepth === 0) topLevel += char;
			else topLevel += " ";
			continue;
		}
		if (char === "[") {
			if (depth <= 1 && roundDepth === 0 && squareDepth === 0) topLevel += char;
			else topLevel += " ";
			squareDepth += 1;
			continue;
		}
		if (char === "]") {
			squareDepth = Math.max(0, squareDepth - 1);
			if (depth <= 1 && roundDepth === 0 && squareDepth === 0) topLevel += char;
			else topLevel += " ";
			continue;
		}
		if (char === "{") {
			depth += 1;
			topLevel +=
				depth <= 1 && roundDepth === 0 && squareDepth === 0 ? char : " ";
			continue;
		}
		if (char === "}") {
			depth -= 1;
			topLevel +=
				depth <= 1 && roundDepth === 0 && squareDepth === 0 ? char : " ";
			if (depth === 0) return { end: index, topLevel };
			continue;
		}
		topLevel +=
			(depth <= 1 && roundDepth === 0 && squareDepth === 0) || char === "\n"
				? char
				: " ";
	}

	return undefined;
}

function isCanonicalTypeAnnotation(annotation, configType) {
	if (!annotation || !configType) return false;
	const compact = annotation.replace(/\s+/g, "");
	return compact === configType || compact === `Readonly<${configType}>`;
}

function resolveIdentifierBinding(
	source,
	file,
	identifier,
	configType,
	callIndex,
) {
	const candidates = [];
	const markdownFence = /\.mdx?$/.test(file)
		? source.lastIndexOf("```", callIndex)
		: -1;
	const searchStart = Math.max(0, markdownFence);
	const beforeCall = source.slice(searchStart, callIndex);
	const variablePattern = new RegExp(
		`\\b(?:const|let|var)\\s+${escapeRegExp(identifier)}\\b(?:\\s*:\\s*([^=;\\n]+))?\\s*=`,
		"g",
	);
	for (const binding of beforeCall.matchAll(variablePattern)) {
		let valueIndex = searchStart + (binding.index ?? 0) + binding[0].length;
		while (/\s/.test(source[valueIndex] ?? "")) valueIndex += 1;
		const object =
			source[valueIndex] === "{"
				? readTopLevelObject(source, valueIndex)
				: undefined;
		candidates.push({
			index: searchStart + (binding.index ?? 0),
			object,
			openIndex: object ? valueIndex : undefined,
			typed: isCanonicalTypeAnnotation(binding[1], configType),
		});
	}

	const functionPattern =
		/(?:\bfunction(?:\s+[A-Za-z_$][\w$]*)?\s*|\b(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=\s*(?:async\s*)?|(?:async\s+)?[A-Za-z_$][\w$]*\s*)\(([^()]*)\)\s*(?::[^={]+)?(?:=>\s*)?\{/g;
	for (const signature of source.matchAll(functionPattern)) {
		const signatureIndex = signature.index ?? 0;
		if (signatureIndex >= callIndex) break;
		const openIndex = signatureIndex + signature[0].lastIndexOf("{");
		const body = readTopLevelObject(source, openIndex);
		if (!body || callIndex <= openIndex || callIndex >= body.end) continue;
		const parameterPattern = new RegExp(
			`(?:^|,)\\s*(?:\\.\\.\\.\\s*)?${escapeRegExp(identifier)}\\s*\\??(?:\\s*:\\s*([^,=]+))?(?=\\s*(?:,|$))`,
		);
		const parameter = signature[1].match(parameterPattern);
		if (!parameter) continue;
		candidates.push({
			index: signatureIndex + signature[0].indexOf(signature[1]),
			typed: isCanonicalTypeAnnotation(parameter[1], configType),
		});
	}

	return candidates.sort((left, right) => right.index - left.index)[0];
}

function inspectFactoryObject(
	failures,
	file,
	source,
	factory,
	kind,
	contextualLifecycleNames,
	object,
	openIndex,
	reportIndex,
) {
	if (/\.\.\./.test(object.topLevel)) {
		failures.push({
			file,
			line: lineAt(source, reportIndex),
			label: `${kind} factory options contain an unverifiable spread`,
			match: factory,
		});
	}
	if (
		kind === "backend" &&
		/(?:^|[,{])\s*(?:on(?:Before|After)[A-Z][A-Za-z0-9]*|onError(?:[A-Z][A-Za-z0-9]*)?)\b(?=\s*(?:\??:|\(|,|}))/.test(
			object.topLevel,
		)
	) {
		failures.push({
			file,
			line: lineAt(source, reportIndex),
			label: "backend lifecycle callbacks must be nested under hooks",
			match: factory,
		});
	}
	if (kind === "backend" && contextualLifecycleNames.length > 0) {
		const objectSource = source.slice(openIndex, object.end + 1);
		recordLifecycleProperties(
			failures,
			file,
			source,
			objectSource,
			openIndex,
			factory,
			contextualLifecycleNames,
		);

		const hooksReference = object.topLevel
			.match(/\bhooks\s*:\s*([A-Za-z_$][\w$]*)|\b(hooks)\s*(?=[,}])/)
			?.slice(1)
			.find(Boolean);
		if (hooksReference) {
			const binding = resolveIdentifierBinding(
				source,
				file,
				hooksReference,
				undefined,
				reportIndex,
			);
			if (binding?.object && binding.openIndex !== undefined) {
				recordLifecycleProperties(
					failures,
					file,
					source,
					source.slice(binding.openIndex, binding.object.end + 1),
					binding.openIndex,
					factory,
					contextualLifecycleNames,
				);
			}
		}
	}
	if (
		kind === "client" &&
		/(?:^|[,{])\s*(?:apiBaseURL|apiBasePath|siteBaseURL|siteBasePath|queryClient|headers)\b(?=\s*(?:\??:|,|}))/.test(
			object.topLevel,
		)
	) {
		failures.push({
			file,
			line: lineAt(source, reportIndex),
			label: "client plugin duplicates stack-owned runtime",
			match: factory,
		});
	}
}

function checkFactoryCalls(
	failures,
	file,
	source,
	factory,
	kind,
	configType,
	contextualLifecycleNames = [],
) {
	const callPattern = new RegExp(`\\b${factory}[ \\t\\n]*\\(`, "g");
	for (const match of source.matchAll(callPattern)) {
		const callIndex = match.index ?? 0;
		let cursor = callIndex + match[0].length;
		while (/\s/.test(source[cursor] ?? "")) cursor += 1;
		if (source[cursor] === ")") continue;
		if (source[cursor] !== "{") {
			const expression = source
				.slice(cursor)
				.match(
					/^[A-Za-z_$][\w$]*(?:\s*\.\s*[A-Za-z_$][\w$]*)*(?:\s*\([^()\n]*\))?\s*(?=[,)])/,
				)?.[0]
				.trim();
			if (!expression) {
				if (
					/\.mdx?$/.test(file) &&
					isInsideMarkdownInlineCode(source, callIndex)
				) {
					continue;
				}
				if (isInsideCommentProse(source, callIndex)) continue;
				failures.push({
					file,
					line: lineAt(source, callIndex),
					label: `${kind} factory options expression cannot be parsed`,
					match: factory,
				});
				continue;
			}
			const identifier = /^[A-Za-z_$][\w$]*$/.test(expression)
				? expression
				: undefined;
			const binding = identifier
				? resolveIdentifierBinding(
						source,
						file,
						identifier,
						configType,
						callIndex,
					)
				: undefined;
			if (!binding) {
				if (
					/\.mdx?$/.test(file) &&
					isInsideMarkdownInlineCode(source, callIndex)
				) {
					continue;
				}
				failures.push({
					file,
					line: lineAt(source, callIndex),
					label: `${kind} factory options expression cannot be verified`,
					match: `${factory}(${expression})`,
				});
				continue;
			}
			if (binding.object && binding.openIndex !== undefined) {
				inspectFactoryObject(
					failures,
					file,
					source,
					factory,
					kind,
					contextualLifecycleNames,
					binding.object,
					binding.openIndex,
					binding.openIndex,
				);
			} else if (!binding.typed) {
				failures.push({
					file,
					line: lineAt(source, callIndex),
					label: `${kind} factory options binding cannot be verified`,
					match: `${factory}(${expression})`,
				});
			}
			continue;
		}
		const object = readTopLevelObject(source, cursor);
		if (!object) {
			failures.push({
				file,
				line: lineAt(source, callIndex),
				label: `${kind} factory options object cannot be parsed`,
				match: factory,
			});
			continue;
		}
		inspectFactoryObject(
			failures,
			file,
			source,
			factory,
			kind,
			contextualLifecycleNames,
			object,
			cursor,
			callIndex,
		);
	}
}

function checkTypedHookObjects(
	failures,
	file,
	source,
	factory,
	typeName,
	names,
) {
	if (names.length === 0) return;
	const declarationPattern = new RegExp(
		`:\\s*${escapeRegExp(typeName)}\\s*=\\s*\\{`,
		"g",
	);
	for (const declaration of source.matchAll(declarationPattern)) {
		const openIndex =
			(declaration.index ?? 0) + declaration[0].lastIndexOf("{");
		const object = readTopLevelObject(source, openIndex);
		if (!object) continue;
		recordLifecycleProperties(
			failures,
			file,
			source,
			source.slice(openIndex, object.end + 1),
			openIndex,
			factory,
			names,
		);
	}
}

function lifecycleInventory() {
	const names = new Set();
	const namesByFactory = new Map();
	for (const { lifecycleSlug, factory } of backendPlugins) {
		if (!lifecycleSlug) continue;
		const source = readFileSync(
			join(
				root,
				`packages/stack/src/plugins/${lifecycleSlug}/api/lifecycle-migrations.ts`,
			),
			"utf8",
		);
		const object = source.match(
			/Object\.freeze\(\{([\s\S]*?)\}\s+as const\)/,
		)?.[1];
		if (!object)
			throw new Error(`Unable to read ${lifecycleSlug} lifecycle inventory`);
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

	for (const { factory, hookType, configType } of backendPlugins) {
		const contextualNames = contextualNamesByFactory.get(factory) ?? [];
		checkFactoryCalls(
			failures,
			file,
			source,
			factory,
			"backend",
			configType,
			contextualNames,
		);
		if (hookType) {
			checkTypedHookObjects(
				failures,
				file,
				source,
				factory,
				hookType,
				contextualNames,
			);
		}
	}
	for (const { factory, configType } of clientPlugins) {
		checkFactoryCalls(failures, file, source, factory, "client", configType);
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
