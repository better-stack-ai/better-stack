import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const BACKEND_SOURCE_PATH = "scripts/codegen/files/nextjs/lib/stack.ts";
const CLIENT_SOURCE_PATH = "scripts/codegen/files/nextjs/lib/stack-client.tsx";

function sourceLine(source, marker) {
	const line = source
		.split("\n")
		.find((candidate) => candidate.includes(marker));
	return line?.trim();
}

function clientRegistrationExcerpt(source) {
	const lines = source.split("\n");
	const start = lines.findIndex((line) =>
		line.includes("blog: blogClientPlugin({"),
	);
	const defaultImage = lines.findIndex(
		(line, index) =>
			index >= start &&
			line.includes("defaultImage: `${siteOrigin}/og-image.png`,"),
	);
	if (start < 0 || defaultImage < start) return undefined;
	const indentation = lines[start].match(/^\s*/)?.[0].length ?? 0;
	const seoClose = defaultImage + 1;
	const pluginClose = lines.findIndex(
		(line, index) =>
			index > seoClose &&
			(line.match(/^\s*/)?.[0].length ?? -1) === indentation &&
			line.trim() === "}),",
	);
	if (lines[seoClose]?.trim() !== "}," || pluginClose < 0) return undefined;
	return [
		...lines.slice(start, seoClose + 1).map((line) => line.slice(indentation)),
		"\t// … hooks unchanged",
		lines[pluginClose].slice(indentation),
	];
}

export function assertBlogRegistrationSources({ backendSource, clientSource }) {
	const backendLine = sourceLine(
		backendSource,
		"blog: blogBackendPlugin({ hooks: blogHooks }),",
	);
	if (!backendLine) {
		throw new Error(
			`Blog backend registration proof drifted from ${BACKEND_SOURCE_PATH}`,
		);
	}
	const clientLines = clientRegistrationExcerpt(clientSource);
	if (
		!clientLines ||
		!clientLines.some((line) => line.includes('siteName: "BTST Blog"')) ||
		!clientLines.some((line) => line.includes('author: "BTST Team"'))
	) {
		throw new Error(
			`Blog client registration proof drifted from ${CLIENT_SOURCE_PATH}`,
		);
	}

	return { backendExcerpt: [backendLine], clientExcerpt: clientLines };
}

export async function loadBlogRegistrationProof(repoRoot) {
	const [backendSource, clientSource] = await Promise.all([
		readFile(resolve(repoRoot, BACKEND_SOURCE_PATH), "utf8"),
		readFile(resolve(repoRoot, CLIENT_SOURCE_PATH), "utf8"),
	]);
	return assertBlogRegistrationSources({ backendSource, clientSource });
}
