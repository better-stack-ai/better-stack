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
			pagesLayoutPath: undefined,
			layoutPatchTarget: "app/root.tsx",
		};
	}

	return {
		stackPath: "src/lib/stack.ts",
		stackClientPath: "src/lib/stack-client.tsx",
		queryClientPath: "src/lib/query-client.ts",
		apiRoutePath: "src/routes/api/data/$.ts",
		pageRoutePath: "src/routes/pages/$.tsx",
		pagesLayoutPath: undefined,
		layoutPatchTarget: "src/routes/__root.tsx",
	};
}

function getPublicSiteURLVar(framework: Framework) {
	if (framework === "nextjs") return "NEXT_PUBLIC_SITE_URL";
	if (framework === "react-router") return "PUBLIC_SITE_URL";
	return "VITE_PUBLIC_SITE_URL";
}

function buildPluginTemplateContext(selectedPlugins: PluginKey[]) {
	const metas = PLUGINS.filter((plugin) =>
		selectedPlugins.includes(plugin.key),
	);
	const hasUiBuilder = selectedPlugins.includes("ui-builder");

	const hasCms = selectedPlugins.includes("cms");

	return {
		backendImports: metas
			.filter((m) => m.key !== "ui-builder" || hasCms)
			.map((m) => `import { ${m.backendSymbol} } from "${m.backendImportPath}"`)
			.join("\n"),
		clientImports: metas
			.filter((m) => m.key !== "ui-builder" || hasCms)
			.map((m) => `import { ${m.clientSymbol} } from "${m.clientImportPath}"`)
			.join("\n"),
		backendEntries: metas
			.map((m) => {
				if (m.key === "ai-chat") {
					return `\t\t${m.configKey}: ${m.backendSymbol}({ model: undefined as any }),`;
				}
				if (m.key === "cms") {
					const contentTypes = hasUiBuilder
						? "[UI_BUILDER_CONTENT_TYPE]"
						: "[]";
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
		clientEntries: metas
			.filter((m) => m.key !== "ui-builder" || hasCms)
			.map((m) => {
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
		pagesLayoutOverrides: metas
			.filter((m) => m.key !== "ui-builder" || hasCms)
			.map((m) => {
				if (m.key === "comments") {
					return `\t\t\t\t\t${m.configKey}: {
\t\t\t\t\t\tapiBaseURL: baseURL,
\t\t\t\t\t\tapiBasePath: "/api/data",
\t\t\t\t\t},`;
				}
				if (m.key === "media") {
					return `\t\t\t\t\t${m.configKey}: {
\t\t\t\t\t\tapiBaseURL: baseURL,
\t\t\t\t\t\tapiBasePath: "/api/data",
\t\t\t\t\t\tqueryClient,
\t\t\t\t\t\tnavigate: (path: string) => router.push(path),
\t\t\t\t\t\tLink: ({ href, ...props }: any) => <Link href={href || "#"} {...props} />,
\t\t\t\t\t},`;
				}
				if (m.key === "blog") {
					return `\t\t\t\t\t${m.configKey}: {
\t\t\t\t\t\tapiBaseURL: baseURL,
\t\t\t\t\t\tapiBasePath: "/api/data",
\t\t\t\t\t\tnavigate: (path: string) => router.push(path),
\t\t\t\t\t\tLink: ({ href, ...props }: any) => <Link href={href || "#"} {...props} />,
\t\t\t\t\t\tuploadImage: async () => {
\t\t\t\t\t\t\tthrow new Error("TODO: implement blog.uploadImage override in app/pages/layout.tsx")
\t\t\t\t\t\t},
\t\t\t\t\t},`;
				}
				if (m.key === "kanban") {
					return `\t\t\t\t\t${m.configKey}: {
\t\t\t\t\t\tapiBaseURL: baseURL,
\t\t\t\t\t\tapiBasePath: "/api/data",
\t\t\t\t\t\tnavigate: (path: string) => router.push(path),
\t\t\t\t\t\tLink: ({ href, ...props }: any) => <Link href={href || "#"} {...props} />,
\t\t\t\t\t\tuploadImage: async () => {
\t\t\t\t\t\t\tthrow new Error("TODO: implement kanban.uploadImage override in app/pages/layout.tsx")
\t\t\t\t\t\t},
\t\t\t\t\t\tresolveUser: async () => null,
\t\t\t\t\t\tsearchUsers: async () => [],
\t\t\t\t\t},`;
				}
				if (m.key === "ai-chat") {
					return `\t\t\t\t\t${m.configKey}: {
\t\t\t\t\t\tapiBaseURL: baseURL,
\t\t\t\t\t\tapiBasePath: "/api/data",
\t\t\t\t\t\tnavigate: (path: string) => router.push(path),
\t\t\t\t\t\tLink: ({ href, ...props }: any) => <Link href={href || "#"} {...props} />,
\t\t\t\t\t},`;
				}
				return `\t\t\t\t\t${m.configKey}: {
\t\t\t\t\t\tapiBaseURL: baseURL,
\t\t\t\t\t\tapiBasePath: "/api/data",
\t\t\t\t\t\tnavigate: (path: string) => router.push(path),
\t\t\t\t\t\tLink: ({ href, ...props }: any) => <Link href={href || "#"} {...props} />,
\t\t\t\t\t},`;
			})
			.join("\n"),
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
	const pluginContext = buildPluginTemplateContext(input.plugins);
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

	if (frameworkPaths.pagesLayoutPath && input.framework === "nextjs") {
		files.push({
			path: frameworkPaths.pagesLayoutPath,
			content: await renderTemplate(
				"nextjs/pages-layout.tsx.hbs",
				sharedContext,
			),
			description: "BTST pages layout wrapper",
		});
	}

	return {
		files,
		layoutPatchTarget: frameworkPaths.layoutPatchTarget,
		cssPatchTarget: input.cssFile,
		pagesLayoutPath: frameworkPaths.pagesLayoutPath,
	};
}
