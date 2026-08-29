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
		sitemap: "nextjs/app/sitemap.ts",
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
		sitemap: "react-router/app/routes/sitemap.xml.ts",
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
		sitemap: "tanstack/src/routes/sitemap[.]xml.ts",
		pageFactory: "createTanStackPageOptions",
		layoutFactory: "createTanStackLayout",
	},
];

for (const framework of frameworks) {
	const [
		backend,
		client,
		serverClient,
		todo,
		page,
		layout,
		clientLayout,
		sitemap,
	] = await Promise.all([
		source(framework.backend),
		source(framework.client),
		source(framework.serverClient),
		source(framework.todo),
		source(framework.page),
		source(framework.layout),
		source(framework.clientLayout),
		source(framework.sitemap),
	]);
	const label = framework.name;

	requireText(backend, "createBackendStack({", `${label} backend`);
	requireText(backend, "openApi: openApiBackendPlugin", `${label} backend`);
	requireText(backend, ".trusted.cms", `${label} trusted CMS tool`);
	requireText(backend, ".trusted.kanban", `${label} trusted Kanban tool`);
	requireText(
		backend,
		"const requiredColumnTitles =",
		`${label} WealthReview columns`,
	);
	requireText(
		backend,
		"!board.columns.some((column) => column.title === title)",
		`${label} WealthReview column reconciliation`,
	);
	requireText(
		backend,
		'const targetTitle = params.amlFlag ? "Escalated" : "New Intakes"',
		`${label} WealthReview routing`,
	);
	rejectText(
		backend,
		"board.columns.length > 0",
		`${label} WealthReview column reconciliation`,
	);
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
	requireText(client, "getStackClient", `${label} client runtime`);
	requireText(client, "routeDocs: routeDocsClientPlugin", `${label} client`);
	requireText(client, "uiBuilder: uiBuilderClientPlugin", `${label} client`);
	requireText(
		client,
		"identityPartition: requestIdentity",
		`${label} protected SSR query partition`,
	);
	requireText(
		client,
		"context.currentUserId = requestIdentity.id",
		`${label} Comments SSR query partition`,
	);
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
		client.indexOf("export const getStackClient"),
		client.indexOf("/** Focused browser stack"),
	);
	rejectText(browserHelper, "headers", `${label} browser stack helper`);
	rejectText(browserHelper, "identity", `${label} browser stack helper`);

	requireText(
		serverClient,
		"BTST_REQUEST_HEADERS_SERVER_MARKER",
		`${label} request client`,
	);
	requireText(serverClient, "createAppClientStack", `${label} request client`);
	requireText(serverClient, "authorization.server", `${label} request client`);
	requireText(serverClient, "headers:", `${label} request client`);
	requireText(
		serverClient,
		"resolveTrustedClientOrigins",
		`${label} trusted server origin`,
	);
	rejectText(
		serverClient,
		"VERCEL_URL",
		`${label} deployment hostname as public origin`,
	);
	requireText(
		serverClient,
		"filterCredentialForwardingHeaders",
		`${label} credential header filter`,
	);
	requireText(
		serverClient,
		"getConfiguredApiOrigin",
		`${label} configured API origin`,
	);
	requireText(
		serverClient,
		"getConfiguredSiteOrigin",
		`${label} configured site origin`,
	);
	rejectText(
		serverClient,
		"baseURL: new URL(request.url).origin",
		`${label} request-derived credential destination`,
	);
	requireText(
		serverClient,
		"requestIdentity:",
		`${label} request identity partition`,
	);
	requireText(todo, 'id: "todos"', `${label} Todo client`);
	requireText(todo, "resolve: (runtime)", `${label} Todo client`);
	requireText(page, framework.pageFactory, `${label} page route`);
	requireText(layout, framework.layoutFactory, `${label} identity layout`);
	requireText(clientLayout, "initialIdentity", `${label} client layout`);
	requireText(clientLayout, "stack={stack}", `${label} client layout`);
	requireText(client, "options?.apiOrigin", `${label} explicit API origin`);
	requireText(client, "options?.siteOrigin", `${label} explicit site origin`);
	if (label !== "Next.js") {
		requireText(layout, "apiOrigin", `${label} SSR provider API origin`);
		requireText(layout, "siteOrigin", `${label} SSR provider site origin`);
		requireText(
			layout,
			"{ apiOrigin, siteOrigin }",
			`${label} SSR provider origins`,
		);
		rejectText(layout, "requestOrigin", `${label} raw request origin snapshot`);
	} else {
		requireText(
			layout,
			"resolveClientOrigins: getRequestClientOrigins",
			`${label} trusted client origin hydration`,
		);
		requireText(
			clientLayout,
			"getStackClient(queryClient, clientOrigins)",
			`${label} hydrated client origins`,
		);
	}
	if (label === "TanStack Start") {
		requireText(
			page,
			"await getInitialIdentity()",
			`${label} trusted navigation origins`,
		);
	}
	requireText(
		sitemap,
		"stack-client.server",
		`${label} request-only sitemap stack`,
	);
	rejectText(
		sitemap,
		"getStackClientForRequest",
		`${label} request-only sitemap stack`,
	);

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
