import { ADAPTERS, PLUGINS } from "./constants";
import { renderTemplate } from "./render-template";
import type {
	Adapter,
	AliasPrefix,
	FileWritePlanItem,
	Framework,
	PluginKey,
	ScaffoldPlan,
} from "../types";

interface BuildScaffoldPlanInput {
	framework: Framework;
	adapter: Adapter;
	plugins: PluginKey[];
	alias: AliasPrefix;
	cssFile: string;
}

function getFrameworkPaths(framework: Framework, cssFile: string) {
	if (framework === "nextjs") {
		const prefix = cssFile.startsWith("src/") ? "src/" : "";
		return {
			stackPath: `${prefix}lib/stack.ts`,
			stackClientPath: `${prefix}lib/stack-client.tsx`,
			authClientPath: `${prefix}lib/auth-client.ts`,
			stackClientServerPath: `${prefix}lib/stack-client.server.ts`,
			stackClientOriginsPath: undefined,
			queryClientPath: `${prefix}lib/query-client.ts`,
			apiRoutePath: `${prefix}app/api/data/[[...all]]/route.ts`,
			pageRoutePath: `${prefix}app/(request)/pages/[[...all]]/page.tsx`,
			pagesLayoutPath: `${prefix}app/(request)/pages/layout.tsx`,
			pagesStaticLayoutPath: `${prefix}app/(static)/pages/layout.tsx`,
			pagesClientLayoutPath: `${prefix}app/pages/client-layout.tsx`,
			layoutPatchTarget: `${prefix}app/layout.tsx`,
		};
	}

	if (framework === "react-router") {
		return {
			stackPath: "app/lib/stack.ts",
			stackClientPath: "app/lib/stack-client.tsx",
			authClientPath: "app/lib/auth-client.ts",
			stackClientServerPath: "app/lib/stack-client.server.ts",
			stackClientOriginsPath: undefined,
			queryClientPath: "app/lib/query-client.ts",
			apiRoutePath: "app/routes/api/data/$.ts",
			pageRoutePath: "app/routes/pages/$.tsx",
			pagesLayoutPath: "app/routes/pages/_layout.tsx",
			pagesStaticLayoutPath: undefined,
			pagesClientLayoutPath: undefined,
			layoutPatchTarget: "app/root.tsx",
		};
	}

	return {
		stackPath: "src/lib/stack.ts",
		stackClientPath: "src/lib/stack-client.tsx",
		authClientPath: "src/lib/auth-client.ts",
		stackClientServerPath: "src/lib/stack-client.server.ts",
		stackClientOriginsPath: "src/lib/stack-client.origins.ts",
		queryClientPath: "src/lib/query-client.ts",
		apiRoutePath: "src/routes/api/data/$.ts",
		pageRoutePath: "src/routes/pages/$.tsx",
		pagesLayoutPath: "src/routes/pages/route.tsx",
		pagesStaticLayoutPath: undefined,
		pagesClientLayoutPath: undefined,
		layoutPatchTarget: "src/routes/__root.tsx",
	};
}

function getPublicSiteURLVar(framework: Framework) {
	if (framework === "nextjs") return "NEXT_PUBLIC_SITE_URL";
	return "VITE_PUBLIC_SITE_URL";
}

function getPublicApiURLVar(framework: Framework) {
	if (framework === "nextjs") return "NEXT_PUBLIC_API_URL";
	return "VITE_PUBLIC_API_URL";
}

function getMigrationBaseURLVar(framework: Framework) {
	if (framework === "nextjs") return "NEXT_PUBLIC_BASE_URL";
	return "VITE_BASE_URL";
}

function getBrowserSiteURLExpression(framework: Framework) {
	if (framework === "nextjs") return "process.env.NEXT_PUBLIC_SITE_URL";
	return "import.meta.env.VITE_PUBLIC_SITE_URL";
}

function getBrowserApiURLExpression(framework: Framework) {
	if (framework === "nextjs") return "process.env.NEXT_PUBLIC_API_URL";
	return "import.meta.env.VITE_PUBLIC_API_URL";
}

function getMigrationBrowserBaseURLExpression(framework: Framework) {
	if (framework === "nextjs") return "process.env.NEXT_PUBLIC_BASE_URL";
	return "import.meta.env.VITE_BASE_URL";
}

function getMigrationServerBaseURLExpression(framework: Framework) {
	if (framework === "nextjs") return "process.env.NEXT_PUBLIC_BASE_URL";
	return "import.meta.env.VITE_BASE_URL";
}

function getPagesLayoutFilePath(framework: Framework): string {
	if (framework === "nextjs") return "app/pages/client-layout.tsx";
	if (framework === "react-router") return "app/routes/pages/_layout.tsx";
	return "src/routes/pages/route.tsx";
}

function buildPluginTemplateContext(
	selectedPlugins: PluginKey[],
	framework: Framework,
) {
	const metas = PLUGINS.filter((plugin) =>
		selectedPlugins.includes(plugin.key),
	);
	const hasUiBuilder = selectedPlugins.includes("ui-builder");
	const hasCms = selectedPlugins.includes("cms");
	const hasAiChat = selectedPlugins.includes("ai-chat");
	const hasMedia = selectedPlugins.includes("media");
	const hasFormBuilder = selectedPlugins.includes("form-builder");
	const hasBlog = selectedPlugins.includes("blog");
	const hasKanban = selectedPlugins.includes("kanban");
	const hasBetterAuthUi = selectedPlugins.includes("better-auth-ui");
	const hasSitemap = hasBlog || hasCms || hasKanban;

	const backendMetas = metas.filter(
		(m) =>
			m.backendImportPath &&
			m.backendSymbol &&
			(m.key !== "ui-builder" || hasCms),
	);

	const clientMetas = metas.filter(
		(m) =>
			(m.key !== "ui-builder" || hasCms) &&
			Boolean(m.clientImportPath) &&
			Boolean(m.clientSymbol),
	);
	const backendImportLines = backendMetas
		.map((m) => `import { ${m.backendSymbol} } from "${m.backendImportPath}"`)
		.join("\n");
	const embeddedOverrides = clientMetas
		.map((m) => {
			const layoutFile = getPagesLayoutFilePath(framework);
			if (m.key === "blog") {
				return `\t\t\t\t\t${m.configKey}: {
\t\t\t\t\t\tuploadImage: async () => {
\t\t\t\t\t\t\tthrow new Error("TODO: implement blog.uploadImage override in ${layoutFile}")
\t\t\t\t\t\t},
\t\t\t\t\t},`;
			}
			if (m.key === "kanban") {
				return `\t\t\t\t\t${m.configKey}: {
\t\t\t\t\t\tuploadImage: async () => {
\t\t\t\t\t\t\tthrow new Error("TODO: implement kanban.uploadImage override in ${layoutFile}")
\t\t\t\t\t\t},
\t\t\t\t\t\tresolveUser: async () => null,
\t\t\t\t\t\tsearchUsers: async () => [],
\t\t\t\t\t},`;
			}
			return "";
		})
		.filter(Boolean)
		.join("\n");

	return {
		hasAiChat,
		hasMedia,
		hasFormBuilder,
		hasUiBuilder,
		hasBlog,
		hasCms,
		hasKanban,
		hasSitemap,
		backendImports: [
			backendImportLines,
			hasAiChat ? `import { openai } from "@ai-sdk/openai"` : "",
			hasCms ? `import { z } from "zod"` : "",
			hasMedia
				? `import { localAdapter } from "@btst/stack/plugins/media/api/adapters/local"`
				: "",
		]
			.filter(Boolean)
			.join("\n"),
		clientImports: [
			hasBetterAuthUi
				? 'import { accountClientPlugin, authClientPlugin } from "@btst/better-auth-ui/client"'
				: "",
			clientMetas
				.map((m) => `import { ${m.clientSymbol} } from "${m.clientImportPath}"`)
				.join("\n"),
		]
			.filter(Boolean)
			.join("\n"),
		backendEntries: metas
			.map((m) => {
				if (!m.backendSymbol) {
					return "";
				}
				if (m.key === "ai-chat") {
					return `\t\t${m.configKey}: ${m.backendSymbol}({ model: openai("gpt-4o-mini"), access: "public" }),`;
				}
				if (m.key === "cms") {
					const articleType = `{
				name: "Article",
				slug: "article",
				schema: z.object({
					title: z.string(),
					summary: z.string(),
					body: z.string(),
					publishedAt: z.string(),
					published: z.boolean(),
				}),
			}`;
					const contentTypes = hasUiBuilder
						? `[${articleType}, UI_BUILDER_CONTENT_TYPE]`
						: `[${articleType}]`;
					return `\t\t${m.configKey}: ${m.backendSymbol}({ contentTypes: ${contentTypes} }),`;
				}
				if (m.key === "comments") {
					return `\t\t${m.configKey}: ${m.backendSymbol}({ allowPosting: false }),`;
				}
				if (m.key === "media") {
					return `\t\t${m.configKey}: ${m.backendSymbol}({ storageAdapter: localAdapter() }),`;
				}
				if (m.key === "ui-builder") {
					return "";
				}
				return `\t\t${m.configKey}: ${m.backendSymbol}(),`;
			})
			.filter(Boolean)
			.join("\n"),
		clientEntries: [
			hasBetterAuthUi
				? "\t\t\tauth: authClientPlugin(),\n\t\t\taccount: accountClientPlugin(),"
				: "",
			clientMetas
				.map((m) => {
					if (m.key === "ai-chat") {
						return `\t\t\t${m.configKey}: ${m.clientSymbol}({ mode: "public" }),`;
					}
					return `\t\t\t${m.configKey}: ${m.clientSymbol}(),`;
				})
				.join("\n"),
		]
			.filter(Boolean)
			.join("\n"),
		clientApiEndpointEntries: clientMetas
			.filter((m) => m.backendSymbol && m.key !== "ui-builder")
			.map((m) => `\t\t\t\t${m.configKey}: crossOriginApiEndpoint,`)
			.join("\n"),
		pagesLayoutOverrides: [
			hasBetterAuthUi
				? `\t\t\t\t\tauth: {
\t\t\t\t\t\tauthClient,
\t\t\t\t\t\tredirectTo: "/pages/account/settings",
\t\t\t\t\t\tonSessionChange: () => ${
						framework === "nextjs"
							? "frameworkRouter.refresh()"
							: framework === "react-router"
								? "revalidator.revalidate()"
								: "frameworkRouter.invalidate()"
					},
\t\t\t\t\t},
\t\t\t\t\taccount: {
\t\t\t\t\t\taccount: true,
\t\t\t\t\t},`
				: "",
			embeddedOverrides,
		]
			.filter(Boolean)
			.join("\n"),
		embeddedOverrides,
		hasBetterAuthUi,
	};
}

function buildAdapterTemplateContext(
	adapter: Adapter,
	stackPath: string,
	selectedPlugins: PluginKey[],
) {
	const meta = ADAPTERS.find((item) => item.key === adapter);
	if (!meta) {
		throw new Error(`Unsupported adapter: ${adapter}`);
	}
	const hasFormBuilder = selectedPlugins.includes("form-builder");
	const hasMedia = selectedPlugins.includes("media");
	const hasAiChat = selectedPlugins.includes("ai-chat");
	const hasKanban = selectedPlugins.includes("kanban");
	const needsIsolatedTransactions =
		hasFormBuilder || hasMedia || hasAiChat || hasKanban;

	if (
		(hasFormBuilder && (adapter === "memory" || adapter === "mongodb")) ||
		(hasMedia && adapter === "mongodb")
	) {
		const plugins = [
			hasFormBuilder ? "Form Builder" : "",
			hasMedia ? "Media" : "",
		]
			.filter(Boolean)
			.join(" and ");
		const verb = hasFormBuilder && hasMedia ? "require" : "requires";
		throw new Error(
			`${plugins} ${verb} an adapter with isolated transaction support; ${adapter} is not supported by the generated configuration. Choose prisma, drizzle, or kysely.`,
		);
	}

	if (adapter === "memory") {
		return {
			adapterImport: `import { createMemoryAdapter } from "${meta.packageName}"`,
			adapterSetup: "",
			adapterStackLine: "adapter: (db) => createMemoryAdapter(db)({}),",
		};
	}

	if (adapter === "prisma") {
		const depth = stackPath.split("/").length - 1;
		const prismaClientPath = `${"../".repeat(depth)}generated/prisma/client`;
		return {
			adapterImport: `import { createPrismaAdapter } from "${meta.packageName}"
import { PrismaClient } from "${prismaClientPath}"
import { PrismaPg } from "@prisma/adapter-pg"`,
			adapterSetup: `const pgAdapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter: pgAdapter })

const provider = (process.env.BTST_PRISMA_PROVIDER ?? "postgresql") as "postgresql" | "sqlite" | "cockroachdb" | "mysql" | "sqlserver" | "mongodb"
`,
			adapterStackLine: `adapter: (db) => createPrismaAdapter(prisma, db, { provider${needsIsolatedTransactions ? ", transaction: true" : ""} })({}),`,
		};
	}

	if (adapter === "drizzle") {
		return {
			adapterImport: `import { createDrizzleAdapter } from "${meta.packageName}"`,
			adapterSetup: `// TODO: wire your Drizzle DB instance (drizzleDb)
const drizzleDb = {} as never
const drizzleProvider = (process.env.BTST_DRIZZLE_PROVIDER ?? "pg") as "pg" | "mysql" | "sqlite"
`,
			adapterStackLine: `adapter: (db) => createDrizzleAdapter(drizzleDb, db, { provider: drizzleProvider${needsIsolatedTransactions ? ", transaction: true" : ""} })({}),`,
		};
	}

	if (adapter === "kysely") {
		return {
			adapterImport: `import { createKyselyAdapter } from "${meta.packageName}"`,
			adapterSetup:
				"// TODO: wire your Kysely DB instance (kyselyDb)\nconst kyselyDb = {} as never\n",
			adapterStackLine: `adapter: (db) => createKyselyAdapter(kyselyDb, db, {${needsIsolatedTransactions ? " transaction: true " : ""}})({}),`,
		};
	}

	return {
		adapterImport: `import { createMongodbAdapter } from "${meta.packageName}"`,
		adapterSetup:
			"// TODO: wire your MongoDB database instance (mongoDb)\nconst mongoDb = {} as never\n",
		adapterStackLine: "adapter: (db) => createMongodbAdapter(mongoDb, db, {}),",
	};
}

export async function buildScaffoldPlan(
	input: BuildScaffoldPlanInput,
): Promise<ScaffoldPlan> {
	const frameworkPaths = getFrameworkPaths(input.framework, input.cssFile);
	const pluginContext = buildPluginTemplateContext(
		input.plugins,
		input.framework,
	);
	const adapterContext = buildAdapterTemplateContext(
		input.adapter,
		frameworkPaths.stackPath,
		input.plugins,
	);

	const sharedContext = {
		alias: input.alias,
		browserApiURLExpression: getBrowserApiURLExpression(input.framework),
		browserSiteURLExpression: getBrowserSiteURLExpression(input.framework),
		migrationBrowserBaseURLExpression: getMigrationBrowserBaseURLExpression(
			input.framework,
		),
		migrationServerBaseURLExpression: getMigrationServerBaseURLExpression(
			input.framework,
		),
		migrationBaseURLVar: getMigrationBaseURLVar(input.framework),
		publicApiURLVar: getPublicApiURLVar(input.framework),
		publicSiteURLVar: getPublicSiteURLVar(input.framework),
		useGlobalSingleton:
			input.framework === "nextjs" && input.adapter === "memory",
		...pluginContext,
		...adapterContext,
	};

	const files: FileWritePlanItem[] = [
		{
			path: frameworkPaths.stackPath,
			content: await renderTemplate("shared/lib/stack.ts.hbs", sharedContext),
			description: "BTST backend stack configuration",
		},
		...(input.adapter === "prisma"
			? [
					{
						path: "prisma/schema.prisma",
						content: `generator client {\n  provider = "prisma-client"\n  output   = "../generated/prisma"\n}\n\ndatasource db {\n  provider = "postgresql"\n}\n`,
						description: "Prisma schema with explicit client output path",
					},
					{
						path: "prisma.config.ts",
						content: `import { defineConfig } from 'prisma/config'\n\nexport default defineConfig({\n  schema: 'prisma/schema.prisma',\n  datasource: {\n    url: process.env.DATABASE_URL ?? '',\n  },\n})\n`,
						description: "Prisma configuration file",
					},
				]
			: []),
		{
			path: frameworkPaths.stackClientPath,
			content: await renderTemplate(
				"shared/lib/stack-client.tsx.hbs",
				sharedContext,
			),
			description: "BTST client stack configuration",
		},
		...(pluginContext.hasBetterAuthUi
			? [
					{
						path: frameworkPaths.authClientPath,
						content: await renderTemplate(
							"shared/lib/auth-client.ts.hbs",
							sharedContext,
						),
						description: "Better Auth browser client for an existing endpoint",
					},
				]
			: []),
		{
			path: frameworkPaths.stackClientServerPath,
			content: await renderTemplate(
				"shared/lib/stack-client.server.ts.hbs",
				sharedContext,
			),
			description: "BTST credentialed request stack configuration",
		},
		...(frameworkPaths.stackClientOriginsPath
			? [
					{
						path: frameworkPaths.stackClientOriginsPath,
						content: await renderTemplate(
							"tanstack/stack-client.origins.ts.hbs",
							sharedContext,
						),
						description: "BTST trusted client origin server function",
					},
				]
			: []),
		{
			path: frameworkPaths.queryClientPath,
			content: await renderTemplate(
				"shared/lib/query-client.ts.hbs",
				sharedContext,
			),
			description: "React Query client utility",
		},
		{
			path: frameworkPaths.apiRoutePath,
			content: await renderTemplate(
				`${input.framework}/api-route.ts.hbs`,
				sharedContext,
			),
			description: "BTST API route",
		},
		{
			path: frameworkPaths.pageRoutePath,
			content: await renderTemplate(
				`${input.framework}/pages-route.tsx.hbs`,
				sharedContext,
			),
			description: "BTST pages catch-all route",
		},
	];

	if (frameworkPaths.pagesLayoutPath) {
		files.push({
			path: frameworkPaths.pagesLayoutPath,
			content: await renderTemplate(
				`${input.framework}/pages-layout.tsx.hbs`,
				sharedContext,
			),
			description: "BTST pages layout wrapper",
		});
	}

	if (frameworkPaths.pagesStaticLayoutPath) {
		files.push({
			path: frameworkPaths.pagesStaticLayoutPath,
			content: await renderTemplate(
				"nextjs/pages-static-layout.tsx.hbs",
				sharedContext,
			),
			description: "BTST static pages layout wrapper",
		});
	}

	if (frameworkPaths.pagesClientLayoutPath) {
		files.push({
			path: frameworkPaths.pagesClientLayoutPath,
			content: await renderTemplate(
				"nextjs/pages-client-layout.tsx.hbs",
				sharedContext,
			),
			description: "BTST pages client provider",
		});
	}

	// ── Derived paths ─────────────────────────────────────────────────────────
	const prefix =
		input.framework === "nextjs" && input.cssFile.startsWith("src/")
			? "src/"
			: "";
	const componentDir =
		input.framework === "react-router"
			? "app/components/"
			: input.framework === "tanstack"
				? "src/components/"
				: `${prefix}components/`;

	// ── Navbar + mode toggle (always, all frameworks) ─────────────────────────
	files.push({
		path: `${componentDir}navbar.tsx`,
		content: await renderTemplate(
			`${input.framework}/components/navbar.tsx.hbs`,
			sharedContext,
		),
		description: "App navbar component",
	});
	files.push({
		path: `${componentDir}mode-toggle.tsx`,
		content: await renderTemplate(
			"shared/components/mode-toggle.tsx.hbs",
			sharedContext,
		),
		description: "Dark mode toggle component",
	});

	// ── Sitemap (blog / cms / kanban) ─────────────────────────────────────────
	if (pluginContext.hasSitemap) {
		const sitemapPath =
			input.framework === "react-router"
				? "app/routes/sitemap.xml.ts"
				: input.framework === "tanstack"
					? "src/routes/sitemap[.]xml.ts"
					: `${prefix}app/sitemap.ts`;
		const sitemapTemplate =
			input.framework === "nextjs"
				? "nextjs/sitemap.ts.hbs"
				: `${input.framework}/sitemap.xml.ts.hbs`;
		files.push({
			path: sitemapPath,
			content: await renderTemplate(sitemapTemplate, sharedContext),
			description: "Sitemap route",
		});
	}

	// ── Next.js config (ai-chat / media) ─────────────────────────────────────
	if (
		input.framework === "nextjs" &&
		(pluginContext.hasAiChat || pluginContext.hasMedia)
	) {
		files.push({
			path: "next.config.ts",
			content: await renderTemplate("nextjs/next-config.ts.hbs", sharedContext),
			description: "Next.js configuration with BTST-required fields",
		});
	}

	// ── SSG pages (Next.js only) ──────────────────────────────────────────────
	if (input.framework === "nextjs") {
		if (pluginContext.hasBlog) {
			files.push({
				path: `${prefix}app/(static)/pages/ssg-blog/page.tsx`,
				content: await renderTemplate(
					"nextjs/ssg-blog-list.tsx.hbs",
					sharedContext,
				),
				description: "SSG Blog list page",
			});
			files.push({
				path: `${prefix}app/(static)/pages/ssg-blog/[slug]/page.tsx`,
				content: await renderTemplate(
					"nextjs/ssg-blog-post.tsx.hbs",
					sharedContext,
				),
				description: "SSG Blog post page",
			});
		}
		if (pluginContext.hasCms) {
			files.push({
				path: `${prefix}app/(static)/pages/ssg-cms/[typeSlug]/page.tsx`,
				content: await renderTemplate("nextjs/ssg-cms.tsx.hbs", sharedContext),
				description: "SSG CMS content list page",
			});
		}
		if (pluginContext.hasFormBuilder) {
			files.push({
				path: `${prefix}app/(static)/pages/ssg-forms/page.tsx`,
				content: await renderTemplate(
					"nextjs/ssg-forms.tsx.hbs",
					sharedContext,
				),
				description: "SSG Forms list page",
			});
		}
		if (pluginContext.hasKanban) {
			files.push({
				path: `${prefix}app/(static)/pages/ssg-kanban/page.tsx`,
				content: await renderTemplate(
					"nextjs/ssg-kanban.tsx.hbs",
					sharedContext,
				),
				description: "SSG Kanban boards page",
			});
		}
	}

	// ── Public chat page (ai-chat, all frameworks) ────────────────────────────
	if (pluginContext.hasAiChat) {
		if (input.framework === "nextjs") {
			files.push({
				path: `${prefix}app/public-chat/page.tsx`,
				content: await renderTemplate(
					"nextjs/public-chat-page.tsx.hbs",
					sharedContext,
				),
				description: "Public AI chat page",
			});
			files.push({
				path: `${prefix}app/public-chat/client.tsx`,
				content: await renderTemplate(
					"nextjs/public-chat-client.tsx.hbs",
					sharedContext,
				),
				description: "Public AI chat client component",
			});
		} else if (input.framework === "react-router") {
			files.push({
				path: "app/routes/public-chat.tsx",
				content: await renderTemplate(
					"react-router/public-chat-route.tsx.hbs",
					sharedContext,
				),
				description: "Public AI chat route",
			});
		} else {
			files.push({
				path: "src/routes/public-chat.tsx",
				content: await renderTemplate(
					"tanstack/public-chat-route.tsx.hbs",
					sharedContext,
				),
				description: "Public AI chat route",
			});
		}
	}

	// ── Form demo page (form-builder, all frameworks) ─────────────────────────
	if (pluginContext.hasFormBuilder) {
		if (input.framework === "nextjs") {
			files.push({
				path: `${prefix}app/form-demo/[slug]/page.tsx`,
				content: await renderTemplate(
					"nextjs/form-demo-page.tsx.hbs",
					sharedContext,
				),
				description: "Public form demo page",
			});
			files.push({
				path: `${prefix}app/form-demo/[slug]/client.tsx`,
				content: await renderTemplate(
					"nextjs/form-demo-client.tsx.hbs",
					sharedContext,
				),
				description: "Public form demo client component",
			});
		} else if (input.framework === "react-router") {
			files.push({
				path: "app/routes/form-demo.tsx",
				content: await renderTemplate(
					"react-router/form-demo-route.tsx.hbs",
					sharedContext,
				),
				description: "Public form demo route",
			});
		} else {
			files.push({
				path: "src/routes/form-demo.$slug.tsx",
				content: await renderTemplate(
					"tanstack/form-demo-route.tsx.hbs",
					sharedContext,
				),
				description: "Public form demo route",
			});
		}
	}

	// ── Preview page / UI builder renderer (ui-builder, all frameworks) ───────
	if (pluginContext.hasUiBuilder) {
		if (input.framework === "nextjs") {
			files.push({
				path: `${prefix}app/preview/[slug]/page.tsx`,
				content: await renderTemplate(
					"nextjs/preview-page.tsx.hbs",
					sharedContext,
				),
				description: "UI Builder public page renderer (server wrapper)",
			});
			files.push({
				path: `${prefix}app/preview/[slug]/client.tsx`,
				content: await renderTemplate(
					"nextjs/preview-client.tsx.hbs",
					sharedContext,
				),
				description: "UI Builder public page renderer (client component)",
			});
		} else if (input.framework === "react-router") {
			files.push({
				path: "app/routes/preview.tsx",
				content: await renderTemplate(
					"react-router/preview-route.tsx.hbs",
					sharedContext,
				),
				description: "UI Builder public page renderer route",
			});
		} else {
			files.push({
				path: "src/routes/preview.$slug.tsx",
				content: await renderTemplate(
					"tanstack/preview-route.tsx.hbs",
					sharedContext,
				),
				description: "UI Builder public page renderer route",
			});
		}
	}

	const cssImports = PLUGINS.filter((p) => input.plugins.includes(p.key))
		.map((p) => p.cssImport)
		.filter((c): c is string => Boolean(c));

	const extraPackages = Array.from(
		new Set(
			PLUGINS.filter((p) => input.plugins.includes(p.key)).flatMap(
				(p) => p.extraPackages ?? [],
			),
		),
	);
	const extraPackageVersions = Object.fromEntries(
		PLUGINS.filter((plugin) => input.plugins.includes(plugin.key)).flatMap(
			(plugin) =>
				(plugin.extraInstallSpecs ?? []).map((spec) => {
					const versionSeparator = spec.lastIndexOf("@");
					return [
						spec.slice(0, versionSeparator),
						spec.slice(versionSeparator + 1),
					];
				}),
		),
	);

	return {
		files,
		layoutPatchTarget: frameworkPaths.layoutPatchTarget,
		cssPatchTarget: input.cssFile,
		pagesLayoutPath: frameworkPaths.pagesLayoutPath,
		cssImports,
		extraPackages,
		extraPackageVersions,
	};
}
