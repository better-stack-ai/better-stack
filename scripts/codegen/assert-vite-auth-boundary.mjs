import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const clientDirectory = resolve(process.argv[2]);
const serverDirectory = resolve(process.argv[3]);
const framework = process.argv[4] ?? "Vite";
const serverMarkers = [
	"BTST_SERVER_AUTH_RESOLVER_MARKER",
	"BTST_REQUEST_HEADERS_SERVER_MARKER",
	"BTST_SERVER_STORAGE_ADAPTER_MARKER",
	"BTST_SERVER_STACK_MODULE_MARKER",
];
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

const clientFiles = await javascriptFiles(clientDirectory);
const serverFiles = await javascriptFiles(serverDirectory);

for (const marker of serverMarkers) {
	if (!(await contains(serverFiles, marker))) {
		throw new Error(`${framework} server build is missing ${marker}`);
	}
	if (await contains(clientFiles, marker)) {
		throw new Error(`${framework} browser build contains ${marker}`);
	}
}
if (!(await contains(clientFiles, clientMarker))) {
	throw new Error(`${framework} client authorization fixture is missing`);
}

console.log(`${framework} authorization boundary verified`);
