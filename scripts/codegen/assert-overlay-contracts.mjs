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
		originBoundaries: [
			"nextjs/app/cms-example/layout.tsx",
			"nextjs/app/directory/layout.tsx",
			"nextjs/app/public-chat/layout.tsx",
		],
		standalonePages: [
			"nextjs/app/cms-example/page.tsx",
			"nextjs/app/directory/page.tsx",
			"nextjs/app/directory/[id]/page.tsx",
			"nextjs/app/directory/category/[categoryId]/page.tsx",
		],
		publicChat: "nextjs/app/public-chat/page.tsx",
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
		originBoundaries: ["react-router/app/root.tsx"],
		standalonePages: [
			"react-router/app/routes/cms-example.tsx",
			"react-router/app/routes/directory/index.tsx",
			"react-router/app/routes/directory/resource.$id.tsx",
			"react-router/app/routes/directory/category.$categoryId.tsx",
		],
		publicChat: "react-router/app/routes/public-chat.tsx",
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
		originBoundaries: ["tanstack/src/routes/__root.tsx"],
		standalonePages: [
			"tanstack/src/routes/cms-example.tsx",
			"tanstack/src/routes/directory/index.tsx",
			"tanstack/src/routes/directory/$id.tsx",
			"tanstack/src/routes/directory/category/$categoryId.tsx",
		],
		publicChat: "tanstack/src/routes/public-chat.tsx",
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
	const [originBoundaries, standalonePages, publicChat] = await Promise.all([
		Promise.all(framework.originBoundaries.map(source)),
		Promise.all(framework.standalonePages.map(source)),
		source(framework.publicChat),
	]);

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
		"await kanban.updateColumn({ id: column.id, data: { title } })",
		`${label} WealthReview column reconciliation`,
	);
	requireText(
		backend,
		"const refreshedBoards = await kanban.listBoards({",
		`${label} WealthReview concurrent reconciliation`,
	);
	rejectText(
		backend,
		"kanban.createColumn({",
		`${label} WealthReview duplicate column guard`,
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
		'credentials: "include"',
		`${label} managed API browser credentials`,
	);
	requireText(
		client,
		"cms: crossOriginApiEndpoint",
		`${label} managed API endpoint projection`,
	);
	rejectText(
		client,
		"uiBuilder: crossOriginApiEndpoint",
		`${label} inherited UI Builder API runtime`,
	);
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
	requireText(
		serverClient,
		label === "Next.js"
			? "getServerClientOriginsFromHeaders"
			: "getServerClientOrigins",
		`${label} standalone provider origin hydration`,
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
	for (const boundary of originBoundaries) {
		requireText(
			boundary,
			"ClientOriginsProvider",
			`${label} standalone server origin boundary`,
		);
		requireText(
			boundary,
			label === "TanStack Start"
				? "getTrustedClientOrigins"
				: label === "React Router"
					? "getServerClientOrigins"
					: "getRequestClientOrigins",
			`${label} standalone trusted origin resolution`,
		);
	}
	for (const standalonePage of standalonePages) {
		requireText(
			standalonePage,
			"useClientOrigins",
			`${label} standalone CMS provider origin hydration`,
		);
		requireText(
			standalonePage,
			"getCmsBrowserClientStack",
			`${label} standalone CMS stack`,
		);
		requireText(
			standalonePage,
			", origins)",
			`${label} standalone CMS hydrated origins`,
		);
	}
	requireText(publicChat, "useClientOrigins", `${label} public chat origins`);
	requireText(publicChat, "baseURL: siteOrigin", `${label} public chat origin`);
	rejectText(
		publicChat,
		"window.location.origin",
		`${label} public chat origin`,
	);
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
