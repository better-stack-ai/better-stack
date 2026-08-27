import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const clientDirectory = resolve(process.argv[2]);
const serverDirectory = resolve(process.argv[3]);
const framework = process.argv[4] ?? "Vite";
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

const clientFiles = await javascriptFiles(clientDirectory);
const serverFiles = await javascriptFiles(serverDirectory);

if (!(await contains(serverFiles, serverMarker))) {
	throw new Error(
		`${framework} server authorization resolver marker is missing`,
	);
}
if (await contains(clientFiles, serverMarker)) {
	throw new Error(
		`${framework} server authorization resolver leaked into a browser chunk`,
	);
}
if (!(await contains(clientFiles, clientMarker))) {
	throw new Error(`${framework} client authorization fixture is missing`);
}

console.log(`${framework} authorization boundary verified`);
