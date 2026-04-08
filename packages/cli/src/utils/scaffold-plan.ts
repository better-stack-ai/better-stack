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
			queryClientPath: `${prefix}lib/query-client.ts`,
			apiRoutePath: `${prefix}app/api/data/[[...all]]/route.ts`,
			pageRoutePath: `${prefix}app/pages/[[...all]]/page.tsx`,
			pagesLayoutPath: `${prefix}app/pages/layout.tsx`,
			layoutPatchTarget: `${prefix}app/layout.tsx`,
		};
	}

	if (framework === "react-router") {
		return {
			stackPath: "app/lib/stack.ts",
			stackClientPath: "app/lib/stack-client.tsx",
			queryClientPath: "app/lib/query-client.ts",
			apiRoutePath: "app/routes/api/data/$.ts",
			pageRoutePath: "app/routes/pages/$.tsx",
			pagesLayoutPath: "app/routes/pages/_layout.tsx",
			layoutPatchTarget: "app/root.tsx",
		};
	}

	return {
		stackPath: "src/lib/stack.ts",
		stackClientPath: "src/lib/stack-client.tsx",
		queryClientPath: "src/lib/query-client.ts",
		apiRoutePath: "src/routes/api/data/$.ts",
		pageRoutePath: "src/routes/pages/$.tsx",
		pagesLayoutPath: "src/routes/pages/route.tsx",
		layoutPatchTarget: "src/routes/__root.tsx",
	};
}

function getPublicSiteURLVar(framework: Framework) {
	if (framework === "nextjs") return "NEXT_PUBLIC_SITE_URL";
	if (framework === "react-router") return "PUBLIC_SITE_URL";
	return "VITE_PUBLIC_SITE_URL";
}

function getNavigateExpr(framework: Framework): string {
	if (framework === "nextjs") return "router.push(path)";
	if (framework === "react-router") return "navigate(path)";
	return "navigate({ to: path })";
}

function getReplaceExpr(framework: Framework): string {
	if (framework === "nextjs") return "router.replace(path)";
	if (framework === "react-router") return "navigate(path, { replace: true })";
	return "navigate({ to: path, replace: true })";
}

function getSessionChangeExpr(framework: Framework): string {
	if (framework === "nextjs") return "router.refresh()";
	return "window.location.reload()";
}

function getLinkJsx(framework: Framework): string {
	if (framework === "nextjs") return '<Link href={href || "#"} {...props} />';
	return '<RouterLink to={href || to || "#"} {...props} />';
}

function getPagesLayoutFilePath(framework: Framework): string {
	if (framework === "nextjs") return "app/pages/layout.tsx";
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
	const hasBetterAuthUi = selectedPlugins.includes("better-auth-ui");
	const hasAiChat = selectedPlugins.includes("ai-chat");
	const hasMedia = selectedPlugins.includes("media");
	const hasFormBuilder = selectedPlugins.includes("form-builder");
	const hasBlog = selectedPlugins.includes("blog");
	const hasKanban = selectedPlugins.includes("kanban");
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
		]
			.filter(Boolean)
			.join("\n"),
		clientImports: clientMetas
			.map((m) => {
				if (m.key === "better-auth-ui") {
					return `import { authClientPlugin, accountClientPlugin, organizationClientPlugin } from "${m.clientImportPath}"`;
				}
				return `import { ${m.clientSymbol} } from "${m.clientImportPath}"`;
			})
			.join("\n"),
		backendEntries: metas
			.map((m) => {
				if (!m.backendSymbol) {
					return "";
				}
				if (m.key === "better-auth-ui") {
					return "";
				}
				if (m.key === "ai-chat") {
					return `\t\t${m.configKey}: ${m.backendSymbol}({ model: openai("gpt-4o-mini"), mode: "public" as const }),`;
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
					return `\t\t${m.configKey}: ${m.backendSymbol}({ storageAdapter: undefined as any }),`;
				}
				if (m.key === "ui-builder") {
					return "";
				}
				return `\t\t${m.configKey}: ${m.backendSymbol}(),`;
			})
			.filter(Boolean)
			.join("\n"),
		clientEntries: clientMetas
			.map((m) => {
				if (m.key === "route-docs") {
					return `\t\t\t${m.configKey}: ${m.clientSymbol}({\n\t\t\t\tqueryClient,\n\t\t\t\tsiteBasePath: "/pages",\n\t\t\t}),`;
				}
				if (m.key === "better-auth-ui") {
					const siteBase = "/pages";
					return `\t\t\tauth: authClientPlugin({
\t\t\t\tsiteBaseURL: baseURL,
\t\t\t\tsiteBasePath: "${siteBase}",
\t\t\t}),
\t\t\taccount: accountClientPlugin({
\t\t\t\tsiteBaseURL: baseURL,
\t\t\t\tsiteBasePath: "${siteBase}",
\t\t\t}),
\t\t\torganization: organizationClientPlugin({
\t\t\t\tsiteBaseURL: baseURL,
\t\t\t\tsiteBasePath: "${siteBase}",
\t\t\t}),`;
				}
				const siteBase = "/pages";
				return `\t\t\t${m.configKey}: ${m.clientSymbol}({
\t\t\t\tapiBaseURL: baseURL,
\t\t\t\tapiBasePath: "/api/data",
\t\t\t\tsiteBaseURL: baseURL,
\t\t\t\tsiteBasePath: "${siteBase}",
\t\t\t\tqueryClient,
\t\t\t}),`;
			})
			.join("\n"),
		pagesLayoutOverrides: clientMetas
			.map((m) => {
				if (m.key === "route-docs") {
					return "";
				}
				const nav = getNavigateExpr(framework);
				const rep = getReplaceExpr(framework);
				const ses = getSessionChangeExpr(framework);
				const link = getLinkJsx(framework);
				const layoutFile = getPagesLayoutFilePath(framework);
				const linkPropDestructure =
					framework === "nextjs"
						? "{ href, ...props }"
						: "{ href, to, ...props }";
				if (m.key === "better-auth-ui") {
					return `\t\t\t\t\tauth: {
\t\t\t\t\t\tauthClient: undefined as any,
\t\t\t\t\t\tnavigate: (path: string) => ${nav},
\t\t\t\t\t\treplace: (path: string) => ${rep},
\t\t\t\t\t\tonSessionChange: () => ${ses},
\t\t\t\t\t\tLink: (${linkPropDestructure}: any) => ${link},
\t\t\t\t\t\tbasePath: "/pages/auth",
\t\t\t\t\t\tredirectTo: "/pages/account/settings",
\t\t\t\t\t},
\t\t\t\t\taccount: {
\t\t\t\t\t\tauthClient: undefined as any,
\t\t\t\t\t\tnavigate: (path: string) => ${nav},
\t\t\t\t\t\treplace: (path: string) => ${rep},
\t\t\t\t\t\tonSessionChange: () => ${ses},
\t\t\t\t\t\tLink: (${linkPropDestructure}: any) => ${link},
\t\t\t\t\t\tbasePath: "/pages/account",
\t\t\t\t\t\taccount: { fields: ["image", "name"] },
\t\t\t\t\t},
\t\t\t\t\torganization: {
\t\t\t\t\t\tauthClient: undefined as any,
\t\t\t\t\t\tnavigate: (path: string) => ${nav},
\t\t\t\t\t\treplace: (path: string) => ${rep},
\t\t\t\t\t\tonSessionChange: () => ${ses},
\t\t\t\t\t\tLink: (${linkPropDestructure}: any) => ${link},
\t\t\t\t\t\tbasePath: "/pages/org",
\t\t\t\t\t\torganization: { basePath: "/pages/org" },
\t\t\t\t\t},`;
				}
				if (m.key === "comments") {
					return `\t\t\t\t\t"${m.key}": {
\t\t\t\t\t\tapiBaseURL: baseURL,
\t\t\t\t\t\tapiBasePath: "/api/data",
\t\t\t\t\t},`;
				}
				if (m.key === "media") {
					return `\t\t\t\t\t"${m.key}": {
\t\t\t\t\t\tapiBaseURL: baseURL,
\t\t\t\t\t\tapiBasePath: "/api/data",
\t\t\t\t\t\tqueryClient,
\t\t\t\t\t\tnavigate: (path: string) => ${nav},
\t\t\t\t\t\tLink: (${linkPropDestructure}: any) => ${link},
\t\t\t\t\t},`;
				}
				if (m.key === "blog") {
					return `\t\t\t\t\t"${m.key}": {
\t\t\t\t\t\tapiBaseURL: baseURL,
\t\t\t\t\t\tapiBasePath: "/api/data",
\t\t\t\t\t\tnavigate: (path: string) => ${nav},
\t\t\t\t\t\tLink: (${linkPropDestructure}: any) => ${link},
\t\t\t\t\t\tuploadImage: async () => {
\t\t\t\t\t\t\tthrow new Error("TODO: implement blog.uploadImage override in ${layoutFile}")
\t\t\t\t\t\t},
\t\t\t\t\t},`;
				}
				if (m.key === "kanban") {
					return `\t\t\t\t\t"${m.key}": {
\t\t\t\t\t\tapiBaseURL: baseURL,
\t\t\t\t\t\tapiBasePath: "/api/data",
\t\t\t\t\t\tnavigate: (path: string) => ${nav},
\t\t\t\t\t\tLink: (${linkPropDestructure}: any) => ${link},
\t\t\t\t\t\tuploadImage: async () => {
\t\t\t\t\t\t\tthrow new Error("TODO: implement kanban.uploadImage override in ${layoutFile}")
\t\t\t\t\t\t},
\t\t\t\t\t\tresolveUser: async () => null,
\t\t\t\t\t\tsearchUsers: async () => [],
\t\t\t\t\t},`;
				}
				if (m.key === "ai-chat") {
					return `\t\t\t\t\t"${m.key}": {
\t\t\t\t\t\tapiBaseURL: baseURL,
\t\t\t\t\t\tapiBasePath: "/api/data",
\t\t\t\t\t\tmode: "public" as const,
\t\t\t\t\t\tnavigate: (path: string) => ${nav},
\t\t\t\t\t\tLink: (${linkPropDestructure}: any) => ${link},
\t\t\t\t\t},`;
				}
				return `\t\t\t\t\t"${m.key}": {
\t\t\t\t\t\tapiBaseURL: baseURL,
\t\t\t\t\t\tapiBasePath: "/api/data",
\t\t\t\t\t\tnavigate: (path: string) => ${nav},
\t\t\t\t\t\tLink: (${linkPropDestructure}: any) => ${link},
\t\t\t\t\t},`;
			})
			.filter(Boolean)
			.join("\n"),
		hasBetterAuthUi,
	};
}

function buildAdapterTemplateContext(adapter: Adapter) {
	const meta = ADAPTERS.find((item) => item.key === adapter);
	if (!meta) {
		throw new Error(`Unsupported adapter: ${adapter}`);
	}

	if (adapter === "memory") {
		return {
			adapterImport: `import { createMemoryAdapter } from "${meta.packageName}"`,
			adapterSetup: "",
			adapterStackLine: "adapter: (db) => createMemoryAdapter(db)({}),",
		};
	}

	if (adapter === "prisma") {
		return {
			adapterImport: `import { createPrismaAdapter } from "${meta.packageName}"
import { PrismaClient } from "@prisma/client"`,
			adapterSetup: `const prisma = new PrismaClient()

const provider = process.env.BTST_PRISMA_PROVIDER ?? "postgresql"
`,
			adapterStackLine:
				"adapter: (db) => createPrismaAdapter(prisma, db, { provider }),",
		};
	}

	if (adapter === "drizzle") {
		return {
			adapterImport: `import { createDrizzleAdapter } from "${meta.packageName}"`,
			adapterSetup:
				"// TODO: wire your Drizzle DB instance (drizzleDb)\nconst drizzleDb = {} as never\n",
			adapterStackLine:
				"adapter: (db) => createDrizzleAdapter(drizzleDb, db, {}),",
		};
	}

	if (adapter === "kysely") {
		return {
			adapterImport: `import { createKyselyAdapter } from "${meta.packageName}"`,
			adapterSetup:
				"// TODO: wire your Kysely DB instance (kyselyDb)\nconst kyselyDb = {} as never\n",
			adapterStackLine:
				"adapter: (db) => createKyselyAdapter(kyselyDb, db, {}),",
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
	const adapterContext = buildAdapterTemplateContext(input.adapter);

	const sharedContext = {
		alias: input.alias,
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
		{
			path: frameworkPaths.stackClientPath,
			content: await renderTemplate(
				"shared/lib/stack-client.tsx.hbs",
				sharedContext,
			),
			description: "BTST client stack configuration",
		},
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
				path: `${prefix}app/pages/ssg-blog/page.tsx`,
				content: await renderTemplate(
					"nextjs/ssg-blog-list.tsx.hbs",
					sharedContext,
				),
				description: "SSG Blog list page",
			});
			files.push({
				path: `${prefix}app/pages/ssg-blog/[slug]/page.tsx`,
				content: await renderTemplate(
					"nextjs/ssg-blog-post.tsx.hbs",
					sharedContext,
				),
				description: "SSG Blog post page",
			});
		}
		if (pluginContext.hasCms) {
			files.push({
				path: `${prefix}app/pages/ssg-cms/[typeSlug]/page.tsx`,
				content: await renderTemplate("nextjs/ssg-cms.tsx.hbs", sharedContext),
				description: "SSG CMS content list page",
			});
		}
		if (pluginContext.hasFormBuilder) {
			files.push({
				path: `${prefix}app/pages/ssg-forms/page.tsx`,
				content: await renderTemplate(
					"nextjs/ssg-forms.tsx.hbs",
					sharedContext,
				),
				description: "SSG Forms list page",
			});
		}
		if (pluginContext.hasKanban) {
			files.push({
				path: `${prefix}app/pages/ssg-kanban/page.tsx`,
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

	return {
		files,
		layoutPatchTarget: frameworkPaths.layoutPatchTarget,
		cssPatchTarget: input.cssFile,
		pagesLayoutPath: frameworkPaths.pagesLayoutPath,
		cssImports,
		extraPackages,
	};
}
