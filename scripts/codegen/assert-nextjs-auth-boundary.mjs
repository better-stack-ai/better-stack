import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const buildDirectory = resolve(process.argv[2] ?? ".next");
const serverMarker = "BTST_SERVER_AUTH_RESOLVER_MARKER";
const clientMarker = "production-boundary-fixture";

async function javascriptFiles(directory) {
	const files = [];

	for (const entry of await readdir(directory, { withFileTypes: true })) {
		const path = resolve(directory, entry.name);
		if (entry.isDirectory()) {
			files.push(...(await javascriptFiles(path)));
		} else if (/\.(?:js|mjs)$/.test(entry.name)) {
			files.push(path);
		}
	}

	return files;
}

async function contains(files, marker) {
	for (const file of files) {
		if ((await readFile(file, "utf8")).includes(marker)) return true;
	}
	return false;
}

const serverFiles = await javascriptFiles(resolve(buildDirectory, "server"));
const clientFiles = await javascriptFiles(resolve(buildDirectory, "static"));

if (!(await contains(serverFiles, serverMarker))) {
	throw new Error(
		"Server authorization resolver marker is missing from the server build",
	);
}

if (await contains(clientFiles, serverMarker)) {
	throw new Error("Server authorization resolver leaked into a browser chunk");
}

if (!(await contains(clientFiles, clientMarker))) {
	throw new Error(
		"Client authorization fixture is missing from the browser build",
	);
}

const prerenderManifest = JSON.parse(
	await readFile(resolve(buildDirectory, "prerender-manifest.json"), "utf8"),
);
const expectedStaticRoutes = [
	"/pages/ssg-blog",
	"/pages/ssg-cms/product",
	"/pages/ssg-forms",
	"/pages/ssg-kanban",
];

for (const route of expectedStaticRoutes) {
	if (!prerenderManifest.routes[route]) {
		throw new Error(
			`${route} is no longer prerendered; keep it outside the request identity layout`,
		);
	}
}

if (!prerenderManifest.dynamicRoutes["/pages/ssg-blog/[slug]"]) {
	throw new Error(
		"The SSG blog detail route no longer supports on-demand prerendering",
	);
}

if (prerenderManifest.routes["/pages/authorization-boundary"]) {
	throw new Error(
		"The request identity boundary was unexpectedly included in the prerender manifest",
	);
}

console.log("Next.js authorization boundary verified");
