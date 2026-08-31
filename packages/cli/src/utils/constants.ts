import type { Adapter, PluginKey } from "../types";

export interface AdapterMeta {
	key: Adapter;
	label: string;
	packageName: string;
	installSpec?: string;
	ormForGenerate?: "prisma" | "drizzle" | "kysely";
	/** Additional package names required when this adapter is selected. */
	extraPackages?: string[];
	/** Version-qualified forms of extraPackages used by the installer. */
	extraInstallSpecs?: string[];
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
	/** Additional package names required when this plugin is selected. */
	extraPackages?: string[];
	/** Version-qualified forms of extraPackages used by the installer. */
	extraInstallSpecs?: string[];
	/** Whether this plugin has sample seed data available for the playground. */
	hasSeedData?: boolean;
}

export const ADAPTERS: readonly AdapterMeta[] = [
	{
		key: "memory",
		label: "Memory (local dev / testing)",
		packageName: "@btst/adapter-memory",
		installSpec: "@btst/adapter-memory@2.2.3",
	},
	{
		key: "prisma",
		label: "Prisma",
		packageName: "@btst/adapter-prisma",
		installSpec: "@btst/adapter-prisma@2.2.3",
		ormForGenerate: "prisma",
		extraPackages: ["@prisma/adapter-pg", "pg"],
	},
	{
		key: "drizzle",
		label: "Drizzle",
		packageName: "@btst/adapter-drizzle",
		installSpec: "@btst/adapter-drizzle@2.2.3",
		ormForGenerate: "drizzle",
		extraPackages: ["drizzle-orm"],
		extraInstallSpecs: ["drizzle-orm@0.45.2"],
	},
	{
		key: "kysely",
		label: "Kysely",
		packageName: "@btst/adapter-kysely",
		installSpec: "@btst/adapter-kysely@2.2.3",
		ormForGenerate: "kysely",
	},
	{
		key: "mongodb",
		label: "MongoDB",
		packageName: "@btst/adapter-mongodb",
		installSpec: "@btst/adapter-mongodb@2.2.3",
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
		hasSeedData: true,
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
		extraPackages: ["@ai-sdk/openai", "ai"],
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
		hasSeedData: true,
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
		hasSeedData: true,
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
		hasSeedData: true,
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
		hasSeedData: true,
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
		// @vercel/blob is needed at runtime for the vercel-blob upload mode.
		// Without it installed, Next.js/webpack fails to resolve the dynamic import
		// even though the code path is never reached when using other storage adapters.
		extraPackages: ["@vercel/blob"],
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
	{
		key: "better-auth-ui",
		label:
			"Better Auth UI (auth + account; requires an existing Better Auth endpoint)",
		cssImport: "@btst/better-auth-ui/css",
		configKey: "auth",
		extraPackages: [
			"@btst/better-auth-ui",
			"better-auth",
			"@better-auth/core",
			"@better-auth/utils",
			"@better-fetch/fetch",
			"better-call",
			// RC4 exposes API-key/passkey types from its synthetic full AuthClient,
			// so these remain required declaration peers even when their runtime
			// features are not configured by the generated auth+account scaffold.
			"@better-auth/api-key",
			"@better-auth/passkey",
		],
		extraInstallSpecs: [
			"@btst/better-auth-ui@2.0.0-rc.4",
			"better-auth@1.6.16",
			"@better-auth/core@1.6.16",
			"@better-auth/utils@0.4.1",
			"@better-fetch/fetch@1.2.2",
			"better-call@1.3.6",
			"@better-auth/api-key@1.6.16",
			"@better-auth/passkey@1.6.16",
		],
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
	"better-auth-ui": [
		"/pages/auth/sign-in",
		"/pages/auth/sign-up",
		"/pages/auth/forgot-password",
		"/pages/auth/reset-password",
		"/pages/auth/magic-link",
		"/pages/auth/email-otp",
		"/pages/auth/two-factor",
		"/pages/auth/recover-account",
		"/pages/auth/callback",
		"/pages/auth/sign-out",
		"/pages/auth/accept-invitation",
		"/pages/auth/email-verification",
		"/pages/account/settings",
		"/pages/account/security",
		"/pages/account/api-keys",
		"/pages/account/organizations",
		"/pages/account/teams",
	],
};
