import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

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
	},
	{
		factory: "blogBackendPlugin",
		lifecycleSlug: "blog",
		hookType: "BlogBackendHooks",
	},
	{
		factory: "cmsBackendPlugin",
		lifecycleSlug: "cms",
		hookType: "CMSBackendHooks",
	},
	{
		factory: "commentsBackendPlugin",
		lifecycleSlug: "comments",
		hookType: "CommentsBackendHooks",
	},
	{
		factory: "formBuilderBackendPlugin",
		lifecycleSlug: "form-builder",
		hookType: "FormBuilderBackendHooks",
	},
	{
		factory: "kanbanBackendPlugin",
		lifecycleSlug: "kanban",
		hookType: "KanbanBackendHooks",
	},
	{
		factory: "mediaBackendPlugin",
		lifecycleSlug: "media",
		hookType: "MediaBackendHooks",
	},
	{ factory: "openApiBackendPlugin" },
];
const clientPlugins = [
	{ factory: "aiChatClientPlugin" },
	{ factory: "blogClientPlugin" },
	{ factory: "cmsClientPlugin" },
	{ factory: "commentsClientPlugin" },
	{ factory: "formBuilderClientPlugin" },
	{ factory: "kanbanClientPlugin" },
	{ factory: "mediaClientPlugin" },
	{ factory: "routeDocsClientPlugin" },
	{ factory: "uiBuilderClientPlugin" },
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

function readGuardSource(absolute, file) {
	const source = readFileSync(absolute, "utf8");
	if (!/^packages\/stack\/registry\/[^/]+\.json$/.test(file)) return source;

	const registry = JSON.parse(source);
	if (!Array.isArray(registry.files)) return source;
	const encodedSources = [];
	const metadata = {
		...registry,
		files: registry.files.map(({ content, ...entry }) => {
			if (typeof content === "string") encodedSources.push(content);
			return entry;
		}),
	};
	const isolatedSources = encodedSources
		.map((encodedSource) => `{\n${encodedSource}\n}`)
		.join("\n");
	return `${JSON.stringify(metadata)}\n${isolatedSources}`;
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

function markdownFences(source) {
	return source.matchAll(/^ {0,3}```[^\n]*$/gm);
}

function markdownFenceContentStart(source, index) {
	const fences = [...markdownFences(source.slice(0, index))];
	if (fences.length % 2 === 0) return undefined;
	const openingFence = fences.at(-1);
	return openingFence?.index === undefined
		? undefined
		: source.indexOf("\n", openingFence.index) + 1;
}

function opensControlStatement(source, openIndex) {
	const prefix = source.slice(0, openIndex);
	const match = prefix.match(/([A-Za-z_$][\w$]*)\s*$/);
	if (!match) return false;
	if (!/^(?:catch|for|if|switch|while|with)$/.test(match[1])) return false;
	let cursor = prefix.length - match[0].length - 1;
	while (/\s/.test(source[cursor] ?? "")) cursor -= 1;
	return source[cursor] !== ".";
}

function canStartRegexLiteral(
	source,
	index,
	controlStatementClosures,
	allowAdjacentLessThan = false,
) {
	if (source[index + 1] === "=") return false;
	let cursor = index - 1;
	while (/\s/.test(source[cursor] ?? "")) cursor -= 1;
	if (cursor < 0) return true;
	if (source[cursor] === ")" && controlStatementClosures.has(cursor)) {
		return true;
	}
	if (
		(source[cursor] === "+" || source[cursor] === "-") &&
		source[cursor - 1] === source[cursor]
	) {
		return false;
	}
	if (source[cursor] === ">" && source[cursor - 1] === "=") {
		return true;
	}
	if (allowAdjacentLessThan && source[cursor] === "<") {
		if (/^<\/[A-Za-z][\w.:-]*\s*>/.test(source.slice(cursor))) return false;
		return true;
	}
	if (
		(source[cursor] === "<" || source[cursor] === ">") &&
		/\s/.test(source.slice(cursor + 1, index))
	) {
		return true;
	}
	if (/[[({,;:=!?&|+\-*%^~]/.test(source[cursor])) return true;
	const keyword = source
		.slice(0, cursor + 1)
		.match(/(?:^|\W)([A-Za-z_$][\w$]*)$/)?.[1];
	return /^(?:await|case|delete|in|instanceof|new|return|throw|typeof|void|yield)$/.test(
		keyword ?? "",
	);
}

function scanLexicalState(source, index) {
	let quote;
	let escaped = false;
	let regex = false;
	let regexCharacterClass = false;
	let lineComment = false;
	let blockComment = false;
	const blocks = [];
	const templateFrames = [];
	const parenthesisFrames = [];
	const controlStatementClosures = new Set();
	for (let cursor = 0; cursor < index; cursor += 1) {
		const char = source[cursor];
		const next = source[cursor + 1];
		const templateFrame = templateFrames.at(-1);
		if (
			!quote &&
			templateFrame?.expressionDepth === undefined &&
			templateFrame
		) {
			if (escaped) {
				escaped = false;
				continue;
			}
			if (char === "\\") {
				escaped = true;
				continue;
			}
			if (char === "`") {
				templateFrames.pop();
				continue;
			}
			if (char === "$" && next === "{") {
				templateFrame.expressionDepth = 0;
				cursor += 1;
			}
			continue;
		}
		if (regex) {
			if (escaped) escaped = false;
			else if (char === "\\") escaped = true;
			else if (char === "[") regexCharacterClass = true;
			else if (char === "]") regexCharacterClass = false;
			else if (char === "/" && !regexCharacterClass) regex = false;
			continue;
		}
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
		if (char === '"' || char === "'") quote = char;
		else if (char === "`") {
			templateFrames.push({ expressionDepth: undefined });
			escaped = false;
		} else if (char === "/" && next === "/") {
			lineComment = true;
			cursor += 1;
		} else if (char === "/" && next === "*") {
			blockComment = true;
			cursor += 1;
		} else if (
			char === "/" &&
			canStartRegexLiteral(
				source,
				cursor,
				controlStatementClosures,
				templateFrame?.expressionDepth !== undefined,
			)
		) {
			regex = true;
			regexCharacterClass = false;
			escaped = false;
		} else if (char === "(") {
			parenthesisFrames.push(opensControlStatement(source, cursor));
		} else if (char === ")") {
			if (parenthesisFrames.pop()) controlStatementClosures.add(cursor);
		} else if (char === "{") {
			if (templateFrame?.expressionDepth !== undefined) {
				templateFrame.expressionDepth += 1;
			}
			blocks.push(cursor);
		} else if (char === "}" && templateFrame?.expressionDepth === 0) {
			templateFrame.expressionDepth = undefined;
		} else if (char === "}") {
			if (templateFrame?.expressionDepth !== undefined) {
				templateFrame.expressionDepth -= 1;
			}
			blocks.pop();
		}
	}
	return {
		blockComment,
		blocks,
		lineComment,
		quote:
			quote ??
			(regex ? "/" : undefined) ??
			(templateFrames.length > 0 &&
			templateFrames.at(-1)?.expressionDepth === undefined
				? "`"
				: undefined),
	};
}

function isInsideCommentProse(source, index) {
	const state = scanLexicalState(source, index);
	if (state.lineComment || state.blockComment) return true;

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
			`(?:^|[,{])\\s*(?:async\\s+)?\\*?\\s*(?:${escapeRegExp(name)}\\b|["']${escapeRegExp(name)}["'])(?=\\s*(?:\\??:|\\(|,|\\}))`,
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

function hasComputedProperty(objectSource) {
	return /(?:^|[,{])\s*(?:(?:get|set|async)\s+)?\*?\s*\[[^\]]*\]\s*(?::|\()/m.test(
		objectSource,
	);
}

function skipLexicalTrivia(source, start) {
	let cursor = start;
	while (cursor < source.length) {
		while (/\s/.test(source[cursor] ?? "")) cursor += 1;
		if (source[cursor] === "/" && source[cursor + 1] === "/") {
			const lineEnd = source.indexOf("\n", cursor + 2);
			cursor = lineEnd >= 0 ? lineEnd + 1 : source.length;
			continue;
		}
		if (source[cursor] === "/" && source[cursor + 1] === "*") {
			const commentEnd = source.indexOf("*/", cursor + 2);
			cursor = commentEnd >= 0 ? commentEnd + 2 : source.length;
			continue;
		}
		break;
	}
	return cursor;
}

function hasExecutableIdentifierReference(source, start, end, identifier) {
	const pattern = new RegExp(`\\b${escapeRegExp(identifier)}\\b`, "g");
	for (const match of source.slice(start, end).matchAll(pattern)) {
		const index = start + (match.index ?? 0);
		const state = scanLexicalState(source, index);
		if (!state.lineComment && !state.blockComment && !state.quote) {
			return true;
		}
	}
	return false;
}

function hasExecutableSpread(source) {
	for (const spread of source.matchAll(/\.\.\./g)) {
		const state = scanLexicalState(source, spread.index ?? 0);
		if (!state.lineComment && !state.blockComment && !state.quote) return true;
	}
	return false;
}

function readTopLevelObject(source, openIndex) {
	let depth = 0;
	let roundDepth = 0;
	let squareDepth = 0;
	let quote;
	let escaped = false;
	let regex = false;
	let regexCharacterClass = false;
	let lineComment = false;
	let blockComment = false;
	let topLevel = "";
	const parenthesisFrames = [];
	const controlStatementClosures = new Set();

	for (let index = openIndex; index < source.length; index += 1) {
		const char = source[index];
		const next = source[index + 1];

		if (lineComment) {
			if (char === "\n") lineComment = false;
			topLevel += char === "\n" ? "\n" : " ";
			continue;
		}
		if (blockComment) {
			if (char === "*" && next === "/") {
				blockComment = false;
				topLevel += "  ";
				index += 1;
				continue;
			}
			topLevel += char === "\n" ? "\n" : " ";
			continue;
		}
		if (regex) {
			if (escaped) escaped = false;
			else if (char === "\\") escaped = true;
			else if (char === "[") regexCharacterClass = true;
			else if (char === "]") regexCharacterClass = false;
			else if (char === "/" && !regexCharacterClass) regex = false;
			topLevel += char === "\n" ? "\n" : " ";
			continue;
		}
		if (quote) {
			if (escaped) escaped = false;
			else if (char === "\\") escaped = true;
			else if (char === quote) quote = undefined;
			if (depth <= 1 && roundDepth === 0 && squareDepth === 0) topLevel += char;
			else topLevel += char === "\n" ? "\n" : " ";
			continue;
		}
		if (char === "/" && next === "/") {
			lineComment = true;
			topLevel += "  ";
			index += 1;
			continue;
		}
		if (char === "/" && next === "*") {
			blockComment = true;
			topLevel += "  ";
			index += 1;
			continue;
		}
		if (char === '"' || char === "'" || char === "`") {
			quote = char;
			topLevel +=
				depth <= 1 && roundDepth === 0 && squareDepth === 0 ? char : " ";
			continue;
		}
		if (
			char === "/" &&
			canStartRegexLiteral(source, index, controlStatementClosures, true)
		) {
			regex = true;
			regexCharacterClass = false;
			escaped = false;
			topLevel += " ";
			continue;
		}
		if (char === "(") {
			parenthesisFrames.push(opensControlStatement(source, index));
			if (depth <= 1 && roundDepth === 0 && squareDepth === 0) topLevel += char;
			else topLevel += " ";
			roundDepth += 1;
			continue;
		}
		if (char === ")") {
			if (parenthesisFrames.pop()) controlStatementClosures.add(index);
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
			if (depth === 0) {
				const continuation = skipLexicalTrivia(source, index + 1);
				if (source[continuation] === "/") return undefined;
				return { end: index, topLevel };
			}
			continue;
		}
		topLevel +=
			(depth <= 1 && roundDepth === 0 && squareDepth === 0) || char === "\n"
				? char
				: " ";
	}

	return undefined;
}

function readNamedImportDeclaration(source, importIndex) {
	let cursor = skipLexicalTrivia(source, importIndex + "import".length);
	if (source[cursor] !== "{") return undefined;
	const specifiersStart = cursor + 1;
	let quote;
	let escaped = false;
	let lineComment = false;
	let blockComment = false;
	for (cursor = specifiersStart; cursor < source.length; cursor += 1) {
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
		if (char === "/" && next === "/") {
			lineComment = true;
			cursor += 1;
			continue;
		}
		if (char === "/" && next === "*") {
			blockComment = true;
			cursor += 1;
			continue;
		}
		if (char === '"' || char === "'") {
			quote = char;
			continue;
		}
		if (char !== "}") continue;

		const specifiers = source.slice(specifiersStart, cursor);
		cursor = skipLexicalTrivia(source, cursor + 1);
		if (!/^from\b/.test(source.slice(cursor))) return undefined;
		cursor = skipLexicalTrivia(source, cursor + "from".length);
		const moduleQuote = source[cursor];
		if (moduleQuote !== '"' && moduleQuote !== "'") return undefined;
		const moduleStart = cursor + 1;
		cursor = moduleStart;
		escaped = false;
		for (; cursor < source.length; cursor += 1) {
			if (escaped) escaped = false;
			else if (source[cursor] === "\\") escaped = true;
			else if (source[cursor] === moduleQuote) {
				return {
					moduleName: source.slice(moduleStart, cursor),
					specifiers,
				};
			}
		}
		return undefined;
	}
	return undefined;
}

let namedImportCache;

function registrySourceStart(source, file, index) {
	if (!file.startsWith("packages/stack/registry/")) return undefined;
	const boundary = source.lastIndexOf("\n}\n{\n", index);
	if (boundary >= 0) return boundary + 3;
	const firstSource = source.indexOf("\n{\n");
	return firstSource >= 0 && firstSource < index ? firstSource + 1 : undefined;
}

function namedImportDeclarations(source, file) {
	if (namedImportCache?.source === source && namedImportCache.file === file) {
		return namedImportCache.declarations;
	}
	const declarations = [];
	const importPattern = /\bimport\b/g;
	for (const importMatch of source.matchAll(importPattern)) {
		const declarationIndex = importMatch.index ?? 0;
		const declaration = readNamedImportDeclaration(source, declarationIndex);
		if (!declaration) continue;
		const fenceStart = /\.mdx?$/.test(file)
			? markdownFenceContentStart(source, declarationIndex)
			: undefined;
		if (/\.mdx?$/.test(file) && fenceStart === undefined) continue;
		const registryStart = registrySourceStart(source, file, declarationIndex);
		const lexicalStart = fenceStart ?? registryStart ?? 0;
		const importState = scanLexicalState(
			source.slice(lexicalStart),
			declarationIndex - lexicalStart,
		);
		if (
			importState.lineComment ||
			importState.blockComment ||
			importState.quote ||
			importState.blocks.length !== (registryStart === undefined ? 0 : 1)
		) {
			continue;
		}
		declarations.push({ ...declaration, fenceStart, registryStart });
	}
	namedImportCache = { declarations, file, source };
	return declarations;
}

function factoryModuleMatches(moduleName, factory) {
	const pluginSlug = factory
		.replace(/(?:Backend|Client)Plugin$/, "")
		.replace(/([a-z0-9])([A-Z])/g, "$1-$2")
		.toLowerCase();
	return (
		moduleName === "@btst/stack" ||
		moduleName === "@btst/stack/plugins/api" ||
		moduleName === `@btst/stack/plugins/${pluginSlug}` ||
		moduleName.startsWith(`@btst/stack/plugins/${pluginSlug}/`)
	);
}

function factoryLocalNames(source, file, factory) {
	const names = [{ name: factory }];
	const trivia = String.raw`(?:\s|\/\*[\s\S]*?\*\/|\/\/[^\n]*(?:\n|$))*`;
	const aliasPattern = new RegExp(
		`\\b${escapeRegExp(factory)}\\b${trivia}as\\b${trivia}([A-Za-z_$][\\w$]*)\\b`,
		"g",
	);
	for (const importDeclaration of namedImportDeclarations(source, file)) {
		if (!factoryModuleMatches(importDeclaration.moduleName, factory)) continue;
		for (const alias of importDeclaration.specifiers.matchAll(aliasPattern)) {
			names.push({
				fenceStart: importDeclaration.fenceStart,
				name: alias[1],
				registryStart: importDeclaration.registryStart,
			});
		}
	}
	return names;
}

let typeScriptScopeCache;

function factoryScriptKind(file, source, factoryScope, callIndex) {
	const extension = extname(file);
	if (/^\.(?:cts|mts|ts)$/.test(extension)) return ts.ScriptKind.TS;
	if (extension === ".tsx") return ts.ScriptKind.TSX;
	if (/^\.(?:cjs|js|mjs)$/.test(extension)) return ts.ScriptKind.JS;
	if (extension === ".jsx") return ts.ScriptKind.JSX;
	if (factoryScope.fenceStart !== undefined) {
		const openingEnd = factoryScope.fenceStart - 1;
		const openingStart = source.lastIndexOf("\n", openingEnd - 1) + 1;
		const language = source
			.slice(openingStart, openingEnd)
			.match(/```\s*([A-Za-z0-9-]+)/)?.[1]
			?.toLowerCase();
		if (language === "ts" || language === "typescript") {
			return ts.ScriptKind.TS;
		}
		if (language === "js" || language === "javascript") {
			return ts.ScriptKind.JS;
		}
		if (language === "jsx") return ts.ScriptKind.JSX;
		if (language === "tsx") return ts.ScriptKind.TSX;
	}
	const lexicalStart =
		factoryScope.fenceStart ?? factoryScope.registryStart ?? 0;
	const callPrefix = source.slice(
		Math.max(lexicalStart, callIndex - 200),
		callIndex,
	);
	return /<[^<>\n]+>\s*$/.test(callPrefix)
		? ts.ScriptKind.TS
		: ts.ScriptKind.TSX;
}

function aliasScopeBounds(source, alias) {
	if (alias.fenceStart !== undefined) {
		const closingFence = markdownFences(source.slice(alias.fenceStart)).next()
			.value;
		return {
			end:
				closingFence?.index === undefined
					? source.length
					: alias.fenceStart + closingFence.index,
			start: alias.fenceStart,
		};
	}
	if (alias.registryStart !== undefined) {
		const start = source.indexOf("\n", alias.registryStart) + 1;
		const nextSource = source.indexOf("\n}\n{\n", start);
		return {
			end:
				nextSource >= 0
					? nextSource
					: source.endsWith("\n}")
						? source.length - 2
						: source.length,
			start,
		};
	}
	return { end: source.length, start: 0 };
}

function typeScriptScope(source, alias) {
	const { end, start } = aliasScopeBounds(source, alias);
	if (
		typeScriptScopeCache?.source === source &&
		typeScriptScopeCache.start === start &&
		typeScriptScopeCache.end === end &&
		typeScriptScopeCache.scriptKind === alias.scriptKind
	) {
		return typeScriptScopeCache;
	}
	const text = source.slice(start, end);
	const fileName = "/canonical-dx-guard.tsx";
	const options = {
		jsx: ts.JsxEmit.Preserve,
		module: ts.ModuleKind.ESNext,
		noLib: true,
		noResolve: true,
		target: ts.ScriptTarget.Latest,
	};
	const sourceFile = ts.createSourceFile(
		fileName,
		text,
		options.target,
		true,
		alias.scriptKind,
	);
	const host = {
		fileExists: (candidate) => candidate === fileName,
		getCanonicalFileName: (candidate) => candidate,
		getCurrentDirectory: () => "/",
		getDefaultLibFileName: () => "",
		getDirectories: () => [],
		getNewLine: () => "\n",
		getSourceFile: (candidate) =>
			candidate === fileName ? sourceFile : undefined,
		readFile: (candidate) => (candidate === fileName ? text : undefined),
		useCaseSensitiveFileNames: () => true,
		writeFile: () => {},
	};
	const program = ts.createProgram([fileName], options, host);
	typeScriptScopeCache = {
		checker: program.getTypeChecker(),
		end,
		source,
		sourceFile,
		scriptKind: alias.scriptKind,
		start,
	};
	return typeScriptScopeCache;
}

function factoryReferenceAt(sourceFile, index, name) {
	let reference;
	function visit(node) {
		if (
			((ts.isIdentifier(node) && node.getStart(sourceFile) === index) ||
				(ts.isStringLiteralLike(node) &&
					node.getStart(sourceFile) + 1 === index)) &&
			node.text === name &&
			!reference
		) {
			reference = node;
			return;
		}
		ts.forEachChild(node, visit);
	}
	visit(sourceFile);
	return reference;
}

function namespaceFactoryAccess(scope, reference, factory) {
	const parent = reference.parent;
	const access =
		ts.isIdentifier(reference) &&
		ts.isPropertyAccessExpression(parent) &&
		parent.name === reference
			? parent
			: ts.isStringLiteralLike(reference) &&
					ts.isElementAccessExpression(parent) &&
					parent.argumentExpression === reference
				? parent
				: undefined;
	if (!access) return undefined;
	let receiver = access.expression;
	while (
		ts.isPropertyAccessExpression(receiver) ||
		ts.isElementAccessExpression(receiver) ||
		ts.isParenthesizedExpression(receiver) ||
		ts.isNonNullExpression(receiver) ||
		ts.isAsExpression(receiver)
	) {
		receiver = receiver.expression;
	}
	if (!ts.isIdentifier(receiver)) return undefined;
	const declarations =
		scope.checker.getSymbolAtLocation(receiver)?.declarations ?? [];
	const namespaceImports = declarations.filter((declaration) => {
		if (!ts.isNamespaceImport(declaration)) return false;
		const importDeclaration = declaration.parent.parent;
		return (
			ts.isImportDeclaration(importDeclaration) &&
			ts.isStringLiteralLike(importDeclaration.moduleSpecifier) &&
			factoryModuleMatches(importDeclaration.moduleSpecifier.text, factory)
		);
	});
	return namespaceImports.length > 0
		? { declarations: namespaceImports, expression: access }
		: undefined;
}

function factoryCall(source, factoryScope, callIndex) {
	const scope = typeScriptScope(source, factoryScope);
	const reference = factoryReferenceAt(
		scope.sourceFile,
		callIndex - scope.start,
		factoryScope.name,
	);
	if (!reference) return undefined;
	const namespaceAccess = namespaceFactoryAccess(
		scope,
		reference,
		factoryScope.factory,
	);
	if (
		!namespaceAccess &&
		(!ts.isIdentifier(reference) ||
			ts.isPropertyAccessExpression(reference.parent) ||
			ts.isElementAccessExpression(reference.parent))
	) {
		return undefined;
	}
	let expression = namespaceAccess?.expression ?? reference;
	while (
		ts.isParenthesizedExpression(expression.parent) ||
		ts.isNonNullExpression(expression.parent) ||
		ts.isAsExpression(expression.parent) ||
		ts.isTypeAssertionExpression(expression.parent) ||
		ts.isSatisfiesExpression(expression.parent) ||
		(ts.isBinaryExpression(expression.parent) &&
			expression.parent.operatorToken.kind === ts.SyntaxKind.CommaToken &&
			expression.parent.right === expression)
	) {
		expression = expression.parent;
	}
	const call = expression.parent;
	if (!ts.isCallExpression(call) || call.expression !== expression) {
		return undefined;
	}
	return {
		declarations:
			namespaceAccess?.declarations ??
			scope.checker.getSymbolAtLocation(reference)?.declarations,
		openIndex: scope.start + call.arguments.pos - 1,
	};
}

function isFactoryNameShadowed(call) {
	const declarations = call.declarations;
	if (!declarations || declarations.length === 0) return false;
	return declarations.some(
		(declaration) =>
			!ts.isImportSpecifier(declaration) && !ts.isNamespaceImport(declaration),
	);
}

function resolveIdentifierBinding(source, file, identifier, callIndex) {
	const candidates = [];
	const markdownFence = /\.mdx?$/.test(file)
		? markdownFenceContentStart(source, callIndex)
		: undefined;
	const searchStart = markdownFence ?? 0;
	const scopedSource = source.slice(searchStart);
	const callBlocks = scanLexicalState(
		scopedSource,
		callIndex - searchStart,
	).blocks;
	const beforeCall = source.slice(searchStart, callIndex);
	const variablePattern = new RegExp(
		`\\b(?:const|let|var)\\s+${escapeRegExp(identifier)}\\b(?:\\s*:\\s*[^=;\\n]+)?\\s*=`,
		"g",
	);
	for (const binding of beforeCall.matchAll(variablePattern)) {
		const bindingIndex = searchStart + (binding.index ?? 0);
		const bindingState = scanLexicalState(
			scopedSource,
			bindingIndex - searchStart,
		);
		if (
			bindingState.lineComment ||
			bindingState.blockComment ||
			bindingState.quote
		) {
			continue;
		}
		const bindingBlocks = bindingState.blocks;
		if (
			bindingBlocks.some(
				(block, blockIndex) => callBlocks[blockIndex] !== block,
			)
		) {
			continue;
		}
		let valueIndex = bindingIndex + binding[0].length;
		while (/\s/.test(source[valueIndex] ?? "")) valueIndex += 1;
		const object =
			source[valueIndex] === "{"
				? readTopLevelObject(source, valueIndex)
				: undefined;
		candidates.push({
			blockDepth: bindingBlocks.length,
			index: bindingIndex,
			object,
			openIndex: object ? valueIndex : undefined,
			referencedBeforeCall: object
				? hasExecutableIdentifierReference(
						scopedSource,
						object.end + 1 - searchStart,
						callIndex - searchStart,
						identifier,
					)
				: false,
		});
	}

	const deepestBlock = Math.max(
		...candidates.map((candidate) => candidate.blockDepth),
	);
	const scopedCandidates = candidates
		.filter((candidate) => candidate.blockDepth === deepestBlock)
		.sort((left, right) => right.index - left.index);
	const binding = scopedCandidates[0];
	if (binding && candidates.length > 1) {
		binding.referencedBeforeCall = true;
	}
	return binding;
}

function inspectFactoryObject(
	failures,
	file,
	source,
	factory,
	kind,
	contextualLifecycleNames,
	hookType,
	object,
	openIndex,
	reportIndex,
	resolutionIndex = reportIndex,
) {
	if (hasExecutableSpread(object.topLevel)) {
		failures.push({
			file,
			line: lineAt(source, reportIndex),
			label: `${kind} factory options contain an unverifiable spread`,
			match: factory,
		});
	}
	if (hasComputedProperty(object.topLevel)) {
		failures.push({
			file,
			line: lineAt(source, reportIndex),
			label: `${kind} factory computed option key cannot be verified`,
			match: factory,
		});
	}
	if (
		kind === "backend" &&
		/(?:^|[,{])\s*(?:async\s+)?\*?\s*(?:(?:on(?:Before|After)[A-Z][A-Za-z0-9]*|onError(?:[A-Z][A-Za-z0-9]*)?)\b|["'](?:on(?:Before|After)[A-Z][A-Za-z0-9]*|onError(?:[A-Z][A-Za-z0-9]*)?)["'])(?=\s*(?:\??:|\(|,|}))/.test(
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
		recordLifecycleProperties(
			failures,
			file,
			source,
			object.topLevel,
			openIndex,
			factory,
			contextualLifecycleNames,
		);
	}

	if (kind === "backend" && hookType) {
		let hooksReference;
		const hooksProperty = object.topLevel.match(
			/(?:^|[,{])\s*(?:hooks|["']hooks["'])\s*:/m,
		);
		if (hooksProperty?.index !== undefined) {
			let hooksValueIndex =
				openIndex + hooksProperty.index + hooksProperty[0].length;
			while (/\s/.test(source[hooksValueIndex] ?? "")) hooksValueIndex += 1;
			if (source[hooksValueIndex] === "{") {
				const hooksObject = readTopLevelObject(source, hooksValueIndex);
				if (hooksObject && hasExecutableSpread(hooksObject.topLevel)) {
					failures.push({
						file,
						line: lineAt(source, hooksValueIndex),
						label: "backend hooks contain an unverifiable spread",
						match: factory,
					});
				}
				if (hooksObject && hasComputedProperty(hooksObject.topLevel)) {
					failures.push({
						file,
						line: lineAt(source, hooksValueIndex),
						label: "backend hooks computed key cannot be verified",
						match: factory,
					});
				}
				if (hooksObject && contextualLifecycleNames.length > 0) {
					recordLifecycleProperties(
						failures,
						file,
						source,
						hooksObject.topLevel,
						hooksValueIndex,
						factory,
						contextualLifecycleNames,
					);
				}
			} else if (
				!/^undefined\s*(?=[,}])/.test(
					object.topLevel.slice(hooksValueIndex - openIndex),
				)
			) {
				hooksReference = source
					.slice(hooksValueIndex)
					.match(/^([A-Za-z_$][\w$]*)\b/)?.[1];
				if (!hooksReference) {
					failures.push({
						file,
						line: lineAt(source, hooksValueIndex),
						label: "backend hooks value cannot be verified",
						match: factory,
					});
				}
			}
		} else if (/(?:^|[,{])\s*(hooks)\s*(?=[,}])/m.test(object.topLevel)) {
			hooksReference = "hooks";
		}

		if (hooksReference) {
			const binding = resolveIdentifierBinding(
				source,
				file,
				hooksReference,
				resolutionIndex,
			);
			if (
				binding?.object &&
				binding.openIndex !== undefined &&
				!binding.referencedBeforeCall
			) {
				if (hasExecutableSpread(binding.object.topLevel)) {
					failures.push({
						file,
						line: lineAt(source, binding.openIndex),
						label: "backend hooks contain an unverifiable spread",
						match: factory,
					});
				}
				if (hasComputedProperty(binding.object.topLevel)) {
					failures.push({
						file,
						line: lineAt(source, binding.openIndex),
						label: "backend hooks computed key cannot be verified",
						match: factory,
					});
				}
				if (contextualLifecycleNames.length > 0) {
					recordLifecycleProperties(
						failures,
						file,
						source,
						binding.object.topLevel,
						binding.openIndex,
						factory,
						contextualLifecycleNames,
					);
				}
			} else {
				if (
					/\.mdx?$/.test(file) &&
					isInsideMarkdownInlineCode(source, reportIndex)
				) {
					return;
				}
				failures.push({
					file,
					line: lineAt(source, reportIndex),
					label: "backend hooks binding cannot be verified",
					match: `${factory}(${hooksReference})`,
				});
			}
		}
	}
	if (
		kind === "client" &&
		/(?:^|[,{])\s*(?:(?:apiBaseURL|apiBasePath|siteBaseURL|siteBasePath|queryClient|headers|credentials)\b|["'](?:apiBaseURL|apiBasePath|siteBaseURL|siteBasePath|queryClient|headers|credentials)["'])(?=\s*(?:\??:|,|}))/.test(
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
	contextualLifecycleNames = [],
	hookType,
) {
	for (const localFactory of factoryLocalNames(source, file, factory)) {
		const callPattern = new RegExp(
			`\\b${escapeRegExp(localFactory.name)}\\b`,
			"g",
		);
		for (const match of source.matchAll(callPattern)) {
			const callIndex = match.index ?? 0;
			const fenceStart = /\.mdx?$/.test(file)
				? markdownFenceContentStart(source, callIndex)
				: undefined;
			const registryStart = registrySourceStart(source, file, callIndex);
			if (
				Object.hasOwn(localFactory, "fenceStart") &&
				fenceStart !== localFactory.fenceStart
			) {
				continue;
			}
			if (Object.hasOwn(localFactory, "registryStart")) {
				if (registryStart !== localFactory.registryStart) continue;
			}
			const callState =
				fenceStart === undefined
					? scanLexicalState(source, callIndex)
					: scanLexicalState(source.slice(fenceStart), callIndex - fenceStart);
			if (callState.lineComment || callState.blockComment) {
				continue;
			}
			const factoryScope = {
				factory,
				fenceStart,
				name: localFactory.name,
				registryStart,
			};
			factoryScope.scriptKind = factoryScriptKind(
				file,
				source,
				factoryScope,
				callIndex,
			);
			const call = factoryCall(source, factoryScope, callIndex);
			if (!call || isFactoryNameShadowed(call)) continue;
			let cursor = skipLexicalTrivia(source, call.openIndex + 1);
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
					? resolveIdentifierBinding(source, file, identifier, callIndex)
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
				if (
					binding.object &&
					binding.openIndex !== undefined &&
					!binding.referencedBeforeCall
				) {
					inspectFactoryObject(
						failures,
						file,
						source,
						factory,
						kind,
						contextualLifecycleNames,
						hookType,
						binding.object,
						binding.openIndex,
						binding.openIndex,
						callIndex,
					);
				} else {
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
				hookType,
				object,
				cursor,
				callIndex,
			);
		}
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
		if (hasComputedProperty(object.topLevel)) {
			failures.push({
				file,
				line: lineAt(source, openIndex),
				label: "backend hooks computed key cannot be verified",
				match: factory,
			});
		}
		recordLifecycleProperties(
			failures,
			file,
			source,
			object.topLevel,
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
	const source = stripMigrationBlocks(readGuardSource(absolute, file), file);

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

	for (const { factory, hookType } of backendPlugins) {
		const contextualNames = contextualNamesByFactory.get(factory) ?? [];
		checkFactoryCalls(
			failures,
			file,
			source,
			factory,
			"backend",
			contextualNames,
			hookType,
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
	for (const { factory } of clientPlugins) {
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
