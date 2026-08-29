import { readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const filesDirectory = resolve(scriptDirectory, "files");

async function source(path) {
	return readFile(resolve(filesDirectory, path), "utf8");
}

async function sourceFiles(directory) {
	const files = [];
	for (const entry of await readdir(directory, { withFileTypes: true })) {
		const path = resolve(directory, entry.name);
		if (entry.isDirectory()) files.push(...(await sourceFiles(path)));
		else if (/\.[cm]?[jt]sx?$/.test(entry.name)) files.push(path);
	}
	return files;
}

function requireText(value, expected, label) {
	if (!value.includes(expected)) {
		throw new Error(`${label} must contain ${JSON.stringify(expected)}`);
	}
}

function rejectText(value, rejected, label) {
	if (value.includes(rejected)) {
		throw new Error(`${label} must not contain ${JSON.stringify(rejected)}`);
	}
}

const frameworks = [
	{
		name: "Next.js",
		root: "nextjs",
		backend: "nextjs/lib/stack.ts",
		client: "nextjs/lib/stack-client.tsx",
		serverClient: "nextjs/lib/stack-client.server.ts",
		todo: "nextjs/lib/plugins/todo/client/client.tsx",
		page: "nextjs/app/(request)/pages/[[...all]]/page.tsx",
		layout: "nextjs/app/(request)/pages/layout.tsx",
		clientLayout: "nextjs/app/pages/client-layout.tsx",
		pageFactory: "createNextPage",
		layoutFactory: "createNextLayout",
	},
	{
		name: "React Router",
		root: "react-router",
		backend: "react-router/app/lib/stack.ts",
		client: "react-router/app/lib/stack-client.tsx",
		serverClient: "react-router/app/lib/stack-client.server.ts",
		todo: "react-router/app/lib/plugins/todo/client/client.tsx",
		page: "react-router/app/routes/pages/$.tsx",
		layout: "react-router/app/routes/pages/_layout.tsx",
		clientLayout: "react-router/app/routes/pages/_layout.tsx",
		pageFactory: "createReactRouterPage",
		layoutFactory: "createReactRouterLayout",
	},
	{
		name: "TanStack Start",
		root: "tanstack",
		backend: "tanstack/src/lib/stack.ts",
		client: "tanstack/src/lib/stack-client.tsx",
		serverClient: "tanstack/src/lib/stack-client.server.ts",
		todo: "tanstack/src/lib/plugins/todo/client/client.tsx",
		page: "tanstack/src/routes/pages/$.tsx",
		layout: "tanstack/src/routes/pages/route.tsx",
		clientLayout: "tanstack/src/routes/pages/route.tsx",
		pageFactory: "createTanStackPageOptions",
		layoutFactory: "createTanStackLayout",
	},
];

for (const framework of frameworks) {
	const [backend, client, serverClient, todo, page, layout, clientLayout] =
		await Promise.all([
			source(framework.backend),
			source(framework.client),
			source(framework.serverClient),
			source(framework.todo),
			source(framework.page),
			source(framework.layout),
			source(framework.clientLayout),
		]);
	const label = framework.name;

	requireText(backend, "createBackendStack({", `${label} backend`);
	requireText(backend, "openApi: openApiBackendPlugin", `${label} backend`);
	requireText(backend, ".trusted.cms", `${label} trusted CMS tool`);
	requireText(backend, ".trusted.kanban", `${label} trusted Kanban tool`);
	rejectText(backend, "routeDocs:", `${label} backend`);
	rejectText(backend, "uiBuilder:", `${label} backend`);
	for (const rawKanbanHelper of [
		"findOrCreateKanbanBoard",
		"getKanbanColumnsByBoardId",
		"createKanbanTask",
	]) {
		rejectText(backend, rawKanbanHelper, `${label} trusted Kanban tool`);
	}

	requireText(client, "createClientStack({", `${label} client runtime`);
	requireText(client, "createAppClientStack", `${label} client runtime`);
	requireText(client, "getBrowserClientStack", `${label} client runtime`);
	requireText(client, "routeDocs: routeDocsClientPlugin", `${label} client`);
	requireText(client, "uiBuilder: uiBuilderClientPlugin", `${label} client`);
	rejectText(client, "openApi:", `${label} client`);
	for (const serverOnly of [
		"authorization.server",
		"adapter-memory",
		"node:async_hooks",
		"BTST_REQUEST_HEADERS_SERVER_MARKER",
	]) {
		rejectText(client, serverOnly, `${label} browser client module`);
	}
	const browserHelper = client.slice(
		client.indexOf("export const getBrowserClientStack"),
		client.indexOf("/** Focused browser stack"),
	);
	rejectText(browserHelper, "headers", `${label} browser stack helper`);

	requireText(
		serverClient,
		"BTST_REQUEST_HEADERS_SERVER_MARKER",
		`${label} request client`,
	);
	requireText(serverClient, "createAppClientStack", `${label} request client`);
	requireText(serverClient, "authorization.server", `${label} request client`);
	requireText(serverClient, "headers:", `${label} request client`);
	requireText(todo, 'id: "todos"', `${label} Todo client`);
	requireText(todo, "resolve: (runtime)", `${label} Todo client`);
	requireText(page, framework.pageFactory, `${label} page route`);
	requireText(layout, framework.layoutFactory, `${label} identity layout`);
	requireText(clientLayout, "initialIdentity", `${label} client layout`);
	requireText(clientLayout, "stack={stack}", `${label} client layout`);

	const maintainedSources = await sourceFiles(
		resolve(filesDirectory, framework.root),
	);
	for (const file of maintainedSources) {
		const value = await readFile(file, "utf8");
		for (const stale of [
			'import { stack } from "@btst/stack"',
			"createStackClient",
			"StackProvider<",
			"satisfies Partial<PluginOverrides>",
			"as never",
		]) {
			rejectText(value, stale, file);
		}
	}
}

console.log("Canonical codegen overlay contracts verified");
