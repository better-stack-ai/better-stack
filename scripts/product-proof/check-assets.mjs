#!/usr/bin/env node

import { readFile, stat } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REQUIRED_TEXT_FIELDS = ["alt", "caption", "source"];
const TEXT_SOURCE_EXTENSIONS = new Set([
	".css",
	".html",
	".hbs",
	".js",
	".json",
	".jsx",
	".md",
	".mdx",
	".mjs",
	".svg",
	".ts",
	".tsx",
]);
const ALLOWED_TEXT_CONTEXTS = new Set([
	"canonicalWebsiteUrl",
	"lowercaseNpmPackageToken",
]);

function indexesOf(source, search) {
	const indexes = [];
	let offset = 0;
	while (offset <= source.length - search.length) {
		const index = source.indexOf(search, offset);
		if (index === -1) break;
		indexes.push(index);
		offset = index + search.length;
	}
	return indexes;
}

function allowedRanges(contents, rule) {
	const ranges = [];
	if (rule.context === "canonicalWebsiteUrl") {
		for (const index of indexesOf(contents, rule.url)) {
			ranges.push({ start: index, end: index + rule.url.length });
		}
		return ranges;
	}

	for (const index of indexesOf(contents, rule.token)) {
		ranges.push({ start: index, end: index + rule.token.length });
	}
	return ranges;
}

function readSvgDimensions(source) {
	const viewBox = source.match(
		/viewBox=["']\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*["']/i,
	);
	if (!viewBox) return null;
	return { width: Number(viewBox[3]), height: Number(viewBox[4]) };
}

function readUInt24LE(buffer, offset) {
	return (
		buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16)
	);
}

function readWebPDimensions(buffer) {
	if (
		buffer.length < 30 ||
		buffer.toString("ascii", 0, 4) !== "RIFF" ||
		buffer.toString("ascii", 8, 12) !== "WEBP"
	) {
		return null;
	}

	let offset = 12;
	while (offset + 8 <= buffer.length) {
		const chunk = buffer.toString("ascii", offset, offset + 4);
		const size = buffer.readUInt32LE(offset + 4);
		const dataOffset = offset + 8;

		if (chunk === "VP8X" && dataOffset + 10 <= buffer.length) {
			return {
				width: readUInt24LE(buffer, dataOffset + 4) + 1,
				height: readUInt24LE(buffer, dataOffset + 7) + 1,
			};
		}
		if (chunk === "VP8L" && dataOffset + 5 <= buffer.length) {
			const bits = buffer.readUInt32LE(dataOffset + 1);
			return {
				width: (bits & 0x3fff) + 1,
				height: ((bits >>> 14) & 0x3fff) + 1,
			};
		}
		if (chunk === "VP8 " && dataOffset + 10 <= buffer.length) {
			return {
				width: buffer.readUInt16LE(dataOffset + 6) & 0x3fff,
				height: buffer.readUInt16LE(dataOffset + 8) & 0x3fff,
			};
		}

		offset = dataOffset + size + (size % 2);
	}
	return null;
}

async function dimensionsFor(path, format) {
	if (format === "svg") {
		return readSvgDimensions(await readFile(path, "utf8"));
	}
	if (format === "webp") {
		return readWebPDimensions(await readFile(path));
	}
	return null;
}

export async function checkAssetKit(manifestPath) {
	const absoluteManifest = resolve(manifestPath);
	const root = dirname(absoluteManifest);
	const manifest = JSON.parse(await readFile(absoluteManifest, "utf8"));
	const errors = [];

	if (manifest.version !== 1) errors.push("manifest.version must be 1");
	if (
		!Number.isInteger(manifest.assetRevision) ||
		manifest.assetRevision <= 0
	) {
		errors.push("manifest.assetRevision must be a positive integer");
	}
	if (!Number.isInteger(manifest.kitMaxBytes) || manifest.kitMaxBytes <= 0) {
		errors.push("manifest.kitMaxBytes must be a positive integer");
	}
	if (
		!Array.isArray(manifest.forbiddenText) ||
		manifest.forbiddenText.length === 0 ||
		manifest.forbiddenText.some(
			(value) => typeof value !== "string" || value.trim() === "",
		)
	) {
		errors.push("manifest.forbiddenText must contain at least one string");
	}
	const textSources = Array.isArray(manifest.textSources)
		? manifest.textSources.filter(
				(value) => typeof value === "string" && value.trim() !== "",
			)
		: [];
	if (
		textSources.length === 0 ||
		textSources.length !== (manifest.textSources?.length ?? 0)
	) {
		errors.push("manifest.textSources must contain at least one unique path");
	}
	if (new Set(textSources).size !== textSources.length) {
		errors.push("manifest.textSources must not contain duplicate paths");
	}
	if (!Array.isArray(manifest.assets) || manifest.assets.length === 0) {
		errors.push("manifest.assets must contain at least one asset");
		return { errors, count: 0, totalBytes: 0 };
	}

	const prohibitedCopy = Array.isArray(manifest.forbiddenText)
		? manifest.forbiddenText
				.filter((value) => typeof value === "string" && value.trim() !== "")
				.map((value) => ({ original: value, normalized: value.toLowerCase() }))
		: [];
	const textSourceAllowlist =
		manifest.textSourceAllowlist === undefined
			? {}
			: manifest.textSourceAllowlist;
	if (
		typeof textSourceAllowlist !== "object" ||
		textSourceAllowlist === null ||
		Array.isArray(textSourceAllowlist)
	) {
		errors.push("manifest.textSourceAllowlist must be a path-to-terms object");
	}
	const sourceAllowlist = new Map();
	if (
		typeof textSourceAllowlist === "object" &&
		textSourceAllowlist !== null &&
		!Array.isArray(textSourceAllowlist)
	) {
		for (const [source, rules] of Object.entries(textSourceAllowlist)) {
			if (!textSources.includes(source)) {
				errors.push(
					`manifest.textSourceAllowlist path must be declared in textSources: ${source}`,
				);
			}
			if (!Array.isArray(rules) || rules.length === 0) {
				errors.push(
					`manifest.textSourceAllowlist.${source} must contain context rules`,
				);
				continue;
			}
			const validRules = [];
			const ruleKeys = new Set();
			for (const rule of rules) {
				if (
					typeof rule !== "object" ||
					rule === null ||
					Array.isArray(rule) ||
					typeof rule.term !== "string" ||
					rule.term.trim() === "" ||
					!ALLOWED_TEXT_CONTEXTS.has(rule.context)
				) {
					errors.push(
						`manifest.textSourceAllowlist.${source} contains an invalid context rule`,
					);
					continue;
				}
				const term = rule.term;
				if (
					!prohibitedCopy.some(
						(forbidden) => forbidden.normalized === term.toLowerCase(),
					)
				) {
					errors.push(
						`manifest.textSourceAllowlist.${source} contains non-policy term "${term}"`,
					);
				}
				if (rule.context === "canonicalWebsiteUrl") {
					let url;
					try {
						url = new URL(rule.url);
					} catch {
						url = null;
					}
					if (
						url?.protocol !== "https:" ||
						!rule.url.toLowerCase().includes(term.toLowerCase())
					) {
						errors.push(
							`manifest.textSourceAllowlist.${source} canonicalWebsiteUrl must be an HTTPS URL containing "${term}"`,
						);
						continue;
					}
				}
				if (
					rule.context === "lowercaseNpmPackageToken" &&
					(typeof rule.token !== "string" ||
						rule.token !== rule.token.toLowerCase() ||
						rule.token !== term.toLowerCase() ||
						!/^@[a-z0-9._-]+\/[a-z0-9._/-]+$/.test(rule.token))
				) {
					errors.push(
						`manifest.textSourceAllowlist.${source} lowercaseNpmPackageToken must be the exact lowercase package token for "${term}"`,
					);
					continue;
				}
				const ruleKey = JSON.stringify(rule).toLowerCase();
				if (ruleKeys.has(ruleKey)) {
					errors.push(
						`manifest.textSourceAllowlist.${source} contains duplicate context rules`,
					);
					continue;
				}
				ruleKeys.add(ruleKey);
				validRules.push({ ...rule, normalizedTerm: term.toLowerCase() });
			}
			sourceAllowlist.set(source, validRules);
		}
	}
	const declaredTextSources = new Set(textSources);
	const scannedTextPaths = new Set();
	for (const source of declaredTextSources) {
		const sourcePath = resolve(root, source);
		let contents;
		try {
			contents = await readFile(sourcePath, "utf8");
			scannedTextPaths.add(sourcePath);
		} catch {
			errors.push(`${source}: text source file does not exist`);
			continue;
		}
		const normalizedContents = contents.toLowerCase();
		for (const forbidden of prohibitedCopy) {
			const occurrences = indexesOf(normalizedContents, forbidden.normalized);
			if (occurrences.length === 0) continue;
			const matchingRules = (sourceAllowlist.get(source) ?? []).filter(
				(rule) => rule.normalizedTerm === forbidden.normalized,
			);
			const ranges = matchingRules.flatMap((rule) =>
				allowedRanges(contents, rule),
			);
			const hasDisallowedOccurrence = occurrences.some(
				(index) =>
					!ranges.some(
						(range) =>
							index >= range.start &&
							index + forbidden.normalized.length <= range.end,
					),
			);
			if (hasDisallowedOccurrence) {
				const context =
					matchingRules.length === 0
						? ""
						: ` outside an allowed ${matchingRules
								.map((rule) =>
									rule.context === "lowercaseNpmPackageToken"
										? "lowercase npm package token"
										: "canonical website URL",
								)
								.join(" or ")}`;
				errors.push(
					`${source}: contains forbidden text "${forbidden.original}"${context}`,
				);
			}
		}
	}

	let totalBytes = 0;
	for (const asset of manifest.assets) {
		const label = asset.file ?? "<unnamed asset>";
		if (!asset.file || typeof asset.file !== "string") {
			errors.push(`${label}: file is required`);
			continue;
		}
		for (const field of REQUIRED_TEXT_FIELDS) {
			if (asset.decorative === true && field === "alt") continue;
			if (typeof asset[field] !== "string" || asset[field].trim() === "") {
				errors.push(`${label}: ${field} is required`);
			}
		}
		if (typeof asset.source === "string" && asset.source.trim() !== "") {
			if (
				TEXT_SOURCE_EXTENSIONS.has(extname(asset.source).toLowerCase()) &&
				!declaredTextSources.has(asset.source)
			) {
				errors.push(
					`${label}: textual source must be declared in manifest.textSources`,
				);
			}
			try {
				await stat(resolve(root, asset.source));
			} catch {
				errors.push(`${label}: source file does not exist`);
			}
		}
		if (typeof asset.decorative !== "boolean") {
			errors.push(`${label}: decorative must be true or false`);
		}

		const path = resolve(root, asset.file);
		let fileStat;
		try {
			fileStat = await stat(path);
		} catch {
			errors.push(`${label}: file does not exist`);
			continue;
		}

		totalBytes += fileStat.size;
		if (!Number.isInteger(asset.maxBytes) || asset.maxBytes <= 0) {
			errors.push(`${label}: maxBytes must be a positive integer`);
		} else if (fileStat.size > asset.maxBytes) {
			errors.push(`${label}: ${fileStat.size} bytes exceeds ${asset.maxBytes}`);
		}

		const extension = extname(asset.file).slice(1).toLowerCase();
		if (asset.format !== extension) {
			errors.push(
				`${label}: format ${asset.format} does not match .${extension}`,
			);
		}
		const dimensions = await dimensionsFor(path, asset.format);
		if (!dimensions) {
			errors.push(`${label}: dimensions could not be read`);
		} else if (
			dimensions.width !== asset.width ||
			dimensions.height !== asset.height
		) {
			errors.push(
				`${label}: expected ${asset.width}x${asset.height}, found ${dimensions.width}x${dimensions.height}`,
			);
		}

		if (prohibitedCopy.length > 0) {
			const searchable = [asset.alt, asset.caption];
			if (asset.format === "svg" && !scannedTextPaths.has(path)) {
				searchable.push(await readFile(path, "utf8"));
			}
			const normalizedSearchable = searchable
				.filter((value) => typeof value === "string")
				.map((value) => value.toLowerCase());
			for (const forbidden of prohibitedCopy) {
				if (
					normalizedSearchable.some((value) =>
						value.includes(forbidden.normalized),
					)
				) {
					errors.push(
						`${label}: contains forbidden text "${forbidden.original}"`,
					);
				}
			}
		}
	}

	if (totalBytes > manifest.kitMaxBytes) {
		errors.push(`kit: ${totalBytes} bytes exceeds ${manifest.kitMaxBytes}`);
	}

	return { errors, count: manifest.assets.length, totalBytes };
}

async function main() {
	const manifestPath = process.argv[2];
	if (!manifestPath) {
		console.error(
			"Usage: node scripts/product-proof/check-assets.mjs <manifest.json>",
		);
		process.exitCode = 1;
		return;
	}

	const result = await checkAssetKit(manifestPath);
	if (result.errors.length > 0) {
		for (const error of result.errors) console.error(`- ${error}`);
		process.exitCode = 1;
		return;
	}

	const noun = result.count === 1 ? "asset" : "assets";
	console.log(
		`${result.count} ${noun} checked; ${result.totalBytes} bytes total`,
	);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	await main();
}
