import type { Adapter, PluginKey } from "../types";

export interface AdapterMeta {
	key: Adapter;
	label: string;
	packageName: string;
	ormForGenerate?: "prisma" | "drizzle" | "kysely";
}

export interface PluginMeta {
	key: PluginKey;
	label: string;
	cssImport?: string;
	backendImportPath?: string;
	backendSymbol?: string;
	clientImportPath?: string;
	clientSymbol?: string;
	configKey: string;
	/** Additional npm packages that must be installed when this plugin is selected. */
	extraPackages?: string[];
}

export const ADAPTERS: readonly AdapterMeta[] = [
	{
		key: "memory",
		label: "Memory (local dev / testing)",
		packageName: "@btst/adapter-memory",
	},
	{
		key: "prisma",
		label: "Prisma",
		packageName: "@btst/adapter-prisma",
		ormForGenerate: "prisma",
	},
	{
		key: "drizzle",
		label: "Drizzle",
		packageName: "@btst/adapter-drizzle",
		ormForGenerate: "drizzle",
	},
	{
		key: "kysely",
		label: "Kysely",
		packageName: "@btst/adapter-kysely",
		ormForGenerate: "kysely",
	},
	{
		key: "mongodb",
		label: "MongoDB",
		packageName: "@btst/adapter-mongodb",
	},
];

export const PLUGINS: readonly PluginMeta[] = [
	{
		key: "blog",
		label: "Blog",
		cssImport: "@btst/stack/plugins/blog/css",
		backendImportPath: "@btst/stack/plugins/blog/api",
		backendSymbol: "blogBackendPlugin",
		clientImportPath: "@btst/stack/plugins/blog/client",
		clientSymbol: "blogClientPlugin",
		configKey: "blog",
	},
	{
		key: "ai-chat",
		label: "AI Chat",
		cssImport: "@btst/stack/plugins/ai-chat/css",
		backendImportPath: "@btst/stack/plugins/ai-chat/api",
		backendSymbol: "aiChatBackendPlugin",
		clientImportPath: "@btst/stack/plugins/ai-chat/client",
		clientSymbol: "aiChatClientPlugin",
		configKey: "aiChat",
	},
	{
		key: "cms",
		label: "CMS",
		cssImport: "@btst/stack/plugins/cms/css",
		backendImportPath: "@btst/stack/plugins/cms/api",
		backendSymbol: "cmsBackendPlugin",
		clientImportPath: "@btst/stack/plugins/cms/client",
		clientSymbol: "cmsClientPlugin",
		configKey: "cms",
	},
	{
		key: "form-builder",
		label: "Form Builder",
		cssImport: "@btst/stack/plugins/form-builder/css",
		backendImportPath: "@btst/stack/plugins/form-builder/api",
		backendSymbol: "formBuilderBackendPlugin",
		clientImportPath: "@btst/stack/plugins/form-builder/client",
		clientSymbol: "formBuilderClientPlugin",
		configKey: "formBuilder",
	},
	{
		key: "ui-builder",
		label: "UI Builder (requires CMS — CMS will be added automatically)",
		cssImport: "@btst/stack/plugins/ui-builder/css",
		backendImportPath: "@btst/stack/plugins/ui-builder",
		backendSymbol: "UI_BUILDER_CONTENT_TYPE",
		clientImportPath: "@btst/stack/plugins/ui-builder/client",
		clientSymbol: "uiBuilderClientPlugin",
		configKey: "uiBuilder",
	},
	{
		key: "kanban",
		label: "Kanban",
		cssImport: "@btst/stack/plugins/kanban/css",
		backendImportPath: "@btst/stack/plugins/kanban/api",
		backendSymbol: "kanbanBackendPlugin",
		clientImportPath: "@btst/stack/plugins/kanban/client",
		clientSymbol: "kanbanClientPlugin",
		configKey: "kanban",
	},
	{
		key: "comments",
		label: "Comments",
		cssImport: "@btst/stack/plugins/comments/css",
		backendImportPath: "@btst/stack/plugins/comments/api",
		backendSymbol: "commentsBackendPlugin",
		clientImportPath: "@btst/stack/plugins/comments/client",
		clientSymbol: "commentsClientPlugin",
		configKey: "comments",
	},
	{
		key: "media",
		label: "Media",
		backendImportPath: "@btst/stack/plugins/media/api",
		backendSymbol: "mediaBackendPlugin",
		clientImportPath: "@btst/stack/plugins/media/client",
		clientSymbol: "mediaClientPlugin",
		configKey: "media",
	},
	{
		key: "better-auth-ui",
		label: "Better Auth UI",
		cssImport: "@btst/better-auth-ui/css",
		clientImportPath: "@btst/better-auth-ui/client",
		clientSymbol: "authClientPlugin",
		configKey: "auth",
		extraPackages: ["@btst/better-auth-ui", "better-auth"],
	},
	{
		key: "route-docs",
		label: "Route Docs",
		cssImport: "@btst/stack/plugins/route-docs/css",
		clientImportPath: "@btst/stack/plugins/route-docs/client",
		clientSymbol: "routeDocsClientPlugin",
		configKey: "routeDocs",
	},
	{
		key: "open-api",
		label: "OpenAPI",
		backendImportPath: "@btst/stack/plugins/open-api/api",
		backendSymbol: "openApiBackendPlugin",
		configKey: "openApi",
	},
];

export const DEFAULT_PLUGIN_SELECTION: PluginKey[] = [];

/**
 * Maps each plugin key to the list of /pages/* route paths it registers.
 * Paths are verified against each plugin's client/plugin.tsx createRoute() calls.
 * All page routes are prefixed with /pages (matching siteBasePath="/pages").
 * Non-page routes (API-only plugins) are listed separately.
 */
export const PLUGIN_ROUTES: Record<PluginKey, string[]> = {
	blog: [
		"/pages/blog",
		"/pages/blog/drafts",
		"/pages/blog/new",
		"/pages/blog/:slug/edit",
		"/pages/blog/tag/:tagSlug",
		"/pages/blog/:slug",
	],
	"ai-chat": ["/pages/chat", "/pages/chat/:id"],
	cms: [
		"/pages/cms",
		"/pages/cms/:typeSlug",
		"/pages/cms/:typeSlug/new",
		"/pages/cms/:typeSlug/:id",
	],
	"form-builder": [
		"/pages/forms",
		"/pages/forms/new",
		"/pages/forms/:id/edit",
		"/pages/forms/:id/submissions",
	],
	"ui-builder": [
		"/pages/ui-builder",
		"/pages/ui-builder/new",
		"/pages/ui-builder/:id/edit",
	],
	kanban: ["/pages/kanban", "/pages/kanban/new", "/pages/kanban/:boardId"],
	comments: ["/pages/comments/moderation", "/pages/comments"],
	media: ["/pages/media"],
	"route-docs": ["/pages/route-docs"],
	/** open-api registers an API route, not a page route */
	"open-api": ["/api/data/reference"],
	"better-auth-ui": ["/pages/auth", "/pages/account/settings", "/pages/org"],
};
