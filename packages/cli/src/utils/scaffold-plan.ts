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
			apiRoutePath: "app/routes/api/data/route.ts",
			pageRoutePath: "app/routes/pages/index.tsx",
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

function buildPluginTemplateContext(selectedPlugins: PluginKey[]) {
	const metas = PLUGINS.filter((plugin) =>
		selectedPlugins.includes(plugin.key),
	);

	return {
		backendImports: metas
			.map((m) => `import { ${m.backendSymbol} } from "${m.backendImportPath}"`)
			.join("\n"),
		clientImports: metas
			.map((m) => `import { ${m.clientSymbol} } from "${m.clientImportPath}"`)
			.join("\n"),
		backendEntries: metas
			.map((m) => {
				if (m.key === "ai-chat") {
					return `\t\t${m.configKey}: ${m.backendSymbol}({ model: undefined as any }),`;
				}
				if (m.key === "ui-builder") {
					return `\t\t${m.configKey}: ${m.backendSymbol},`;
				}
				return `\t\t${m.configKey}: ${m.backendSymbol}(),`;
			})
			.join("\n"),
		clientEntries: metas
			.map((m) => {
				const siteBase = "/pages";
				return `\t\t\t${JSON.stringify(m.key)}: ${m.clientSymbol}({
\t\t\t\tapiBaseURL: baseURL,
\t\t\t\tapiBasePath: "/api/data",
\t\t\t\tsiteBaseURL: baseURL,
\t\t\t\tsiteBasePath: "${siteBase}",
\t\t\t\tqueryClient,
\t\t\t}),`;
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
		...pluginContext,
		...adapterContext,
	};

	const files: FileWritePlanItem[] = [
		{
			path: frameworkPaths.stackPath,
			content: await renderTemplate(
				`${input.framework}/stack.ts.hbs`,
				sharedContext,
			),
			description: "BTST backend stack configuration",
		},
		{
			path: frameworkPaths.stackClientPath,
			content: await renderTemplate(
				`${input.framework}/stack-client.tsx.hbs`,
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
