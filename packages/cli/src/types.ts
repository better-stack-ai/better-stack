export type Framework = "nextjs" | "react-router" | "tanstack";

export type Adapter = "memory" | "prisma" | "drizzle" | "kysely" | "mongodb";

export type PluginKey =
	| "blog"
	| "ai-chat"
	| "cms"
	| "form-builder"
	| "ui-builder"
	| "kanban"
	| "comments"
	| "media";

export type PackageManager = "pnpm" | "npm" | "yarn";

export type AliasPrefix = "@/" | "~/" | "./";

export interface InitOptions {
	cwd?: string;
	framework?: Framework;
	adapter?: Adapter;
	plugins?: PluginKey[];
	yes?: boolean;
	skipInstall?: boolean;
}

export interface FileWritePlanItem {
	path: string;
	content: string;
	description: string;
}

export interface ScaffoldPlan {
	files: FileWritePlanItem[];
	layoutPatchTarget: string;
	cssPatchTarget: string;
	pagesLayoutPath?: string;
}
