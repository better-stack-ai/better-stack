import type { Adapter, PluginKey } from "../types";
import { PLUGIN_DECISIONS, type PluginDecisionMeta } from "./plugin-decision";
import type { TESTED_INSTALLATION_SET } from "./installation-set";

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
	packageName?: keyof typeof TESTED_INSTALLATION_SET;
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
	/** Optional evaluator facts for released plugins with a decision surface. */
	decision?: PluginDecisionMeta;
}

export const ADAPTERS: readonly AdapterMeta[] = [
	{
		key: "memory",
		label: "Memory (local dev / testing)",
		packageName: "@btst/adapter-memory",
		installSpec: "@btst/adapter-memory@3.0.1",
	},
	{
		key: "prisma",
		label: "Prisma",
		packageName: "@btst/adapter-prisma",
		installSpec: "@btst/adapter-prisma@3.0.1",
		ormForGenerate: "prisma",
		extraPackages: ["@prisma/adapter-pg", "pg"],
		extraInstallSpecs: ["@prisma/adapter-pg@7.10.1", "pg@8.23.1"],
	},
	{
		key: "drizzle",
		label: "Drizzle",
		packageName: "@btst/adapter-drizzle",
		installSpec: "@btst/adapter-drizzle@3.0.1",
		ormForGenerate: "drizzle",
		extraPackages: ["drizzle-orm"],
		extraInstallSpecs: ["drizzle-orm@0.45.2"],
	},
	{
		key: "kysely",
		label: "Kysely",
		packageName: "@btst/adapter-kysely",
		installSpec: "@btst/adapter-kysely@3.0.1",
		ormForGenerate: "kysely",
	},
	{
		key: "mongodb",
		label: "MongoDB",
		packageName: "@btst/adapter-mongodb",
		installSpec: "@btst/adapter-mongodb@3.0.1",
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
		decision: PLUGIN_DECISIONS.blog,
	},
	{
		key: "ai-chat",
		packageName: "@btst/plugin-ai-chat",
		label: "AI Chat",
		cssImport: "@btst/plugin-ai-chat/css",
		backendImportPath: "@btst/plugin-ai-chat/api",
		backendSymbol: "aiChatBackendPlugin",
		clientImportPath: "@btst/plugin-ai-chat/client",
		clientSymbol: "aiChatClientPlugin",
		configKey: "aiChat",
		extraPackages: ["@ai-sdk/openai", "@ai-sdk/react", "ai"],
		extraInstallSpecs: [
			"@ai-sdk/openai@4.0.104",
			"@ai-sdk/react@4.0.159",
			"ai@7.0.155",
		],
		decision: PLUGIN_DECISIONS["ai-chat"],
	},
	{
		key: "cms",
		packageName: "@btst/plugin-cms",
		label: "CMS",
		cssImport: "@btst/plugin-cms/css",
		backendImportPath: "@btst/plugin-cms/api",
		backendSymbol: "cmsBackendPlugin",
		clientImportPath: "@btst/plugin-cms/client",
		clientSymbol: "cmsClientPlugin",
		configKey: "cms",
		hasSeedData: true,
		decision: PLUGIN_DECISIONS.cms,
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
		decision: PLUGIN_DECISIONS["form-builder"],
	},
	{
		key: "ui-builder",
		packageName: "@btst/plugin-ui-builder",
		label: "UI Builder (requires CMS — CMS will be added automatically)",
		cssImport: "@btst/plugin-ui-builder/css",
		backendImportPath: "@btst/plugin-ui-builder",
		backendSymbol: "UI_BUILDER_CONTENT_TYPE",
		clientImportPath: "@btst/plugin-ui-builder/client",
		clientSymbol: "uiBuilderClientPlugin",
		configKey: "uiBuilder",
		hasSeedData: true,
		decision: PLUGIN_DECISIONS["ui-builder"],
	},
	{
		key: "job-board",
		label: "Job Board (requires CMS)",
		cssImport: "@btst/stack/plugins/job-board/css",
		backendImportPath: "@btst/stack/plugins/job-board/api",
		backendSymbol: "jobBoardBackendPlugin",
		clientImportPath: "@btst/stack/plugins/job-board/client",
		clientSymbol: "jobBoardClientPlugin",
		configKey: "jobBoard",
		decision: PLUGIN_DECISIONS["job-board"],
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
		decision: PLUGIN_DECISIONS.kanban,
	},
	{
		key: "crm",
		label: "CRM (requires Kanban)",
		cssImport: "@btst/stack/plugins/crm/css",
		backendImportPath: "@btst/stack/plugins/crm/api",
		backendSymbol: "crmBackendPlugin",
		clientImportPath: "@btst/stack/plugins/crm/client",
		clientSymbol: "crmClientPlugin",
		configKey: "crm",
		decision: PLUGIN_DECISIONS.crm,
	},
	{
		key: "newsletter",
		label: "Newsletter",
		cssImport: "@btst/stack/plugins/newsletter/css",
		backendImportPath: "@btst/stack/plugins/newsletter/api",
		backendSymbol: "newsletterBackendPlugin",
		clientImportPath: "@btst/stack/plugins/newsletter/client",
		clientSymbol: "newsletterClientPlugin",
		configKey: "newsletter",
		decision: PLUGIN_DECISIONS.newsletter,
	},
	{
		key: "school",
		label: "School (requires CMS)",
		cssImport: "@btst/stack/plugins/school/css",
		backendImportPath: "@btst/stack/plugins/school/api",
		backendSymbol: "schoolBackendPlugin",
		clientImportPath: "@btst/stack/plugins/school/client",
		clientSymbol: "schoolClientPlugin",
		configKey: "school",
		hasSeedData: true,
		decision: PLUGIN_DECISIONS.school,
	},
	{
		key: "affiliate",
		label: "Affiliate",
		cssImport: "@btst/stack/plugins/affiliate/css",
		backendImportPath: "@btst/stack/plugins/affiliate/api",
		backendSymbol: "affiliateBackendPlugin",
		clientImportPath: "@btst/stack/plugins/affiliate/client",
		clientSymbol: "affiliateClientPlugin",
		configKey: "affiliate",
		decision: PLUGIN_DECISIONS.affiliate,
	},
	{
		key: "analytics",
		label: "Analytics",
		cssImport: "@btst/stack/plugins/analytics/css",
		backendImportPath: "@btst/stack/plugins/analytics/api",
		backendSymbol: "analyticsBackendPlugin",
		clientImportPath: "@btst/stack/plugins/analytics/client",
		clientSymbol: "analyticsClientPlugin",
		configKey: "analytics",
		decision: PLUGIN_DECISIONS.analytics,
	},
	{
		key: "ecommerce",
		label: "E-commerce",
		cssImport: "@btst/stack/plugins/ecommerce/css",
		backendImportPath: "@btst/stack/plugins/ecommerce/api",
		backendSymbol: "ecommerceBackendPlugin",
		clientImportPath: "@btst/stack/plugins/ecommerce/client",
		clientSymbol: "ecommerceClientPlugin",
		configKey: "ecommerce",
		decision: PLUGIN_DECISIONS.ecommerce,
	},
	{
		key: "feature-flags",
		label: "Feature Flags",
		cssImport: "@btst/stack/plugins/feature-flags/css",
		backendImportPath: "@btst/stack/plugins/feature-flags/api",
		backendSymbol: "featureFlagsBackendPlugin",
		clientImportPath: "@btst/stack/plugins/feature-flags/client",
		clientSymbol: "featureFlagsClientPlugin",
		configKey: "featureFlags",
		decision: PLUGIN_DECISIONS["feature-flags"],
	},
	{
		key: "calendar",
		label: "Calendar",
		cssImport: "@btst/stack/plugins/calendar/css",
		backendImportPath: "@btst/stack/plugins/calendar/api",
		backendSymbol: "calendarBackendPlugin",
		clientImportPath: "@btst/stack/plugins/calendar/client",
		clientSymbol: "calendarClientPlugin",
		configKey: "calendar",
		decision: PLUGIN_DECISIONS.calendar,
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
		decision: PLUGIN_DECISIONS.comments,
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
		decision: PLUGIN_DECISIONS.media,
	},
	{
		key: "route-docs",
		label: "Route Docs",
		cssImport: "@btst/stack/plugins/route-docs/css",
		clientImportPath: "@btst/stack/plugins/route-docs/client",
		clientSymbol: "routeDocsClientPlugin",
		configKey: "routeDocs",
		decision: PLUGIN_DECISIONS["route-docs"],
	},
	{
		key: "open-api",
		label: "OpenAPI",
		backendImportPath: "@btst/stack/plugins/open-api/api",
		backendSymbol: "openApiBackendPlugin",
		configKey: "openApi",
		decision: PLUGIN_DECISIONS["open-api"],
	},
	{
		key: "better-auth-ui",
		label:
			"Better Auth UI (auth + account; requires an existing Better Auth endpoint)",
		cssImport: "@btst/better-auth-ui/css",
		configKey: "auth",
		extraPackages: [
			"@btst/better-auth-ui",
			"@tanstack/query-core",
			"better-auth",
			"@better-auth/core",
			"@better-auth/utils",
			"@better-fetch/fetch",
			"better-call",
			// The companion exposes API-key/passkey types through its upstream AuthClient,
			// so these remain required declaration peers even when their runtime
			// features are not configured by the generated auth+account scaffold.
			"@better-auth/api-key",
			"@better-auth/passkey",
		],
		extraInstallSpecs: [
			"@btst/better-auth-ui@3.0.2",
			"@tanstack/query-core@5.105.0",
			"better-auth@1.7.14",
			"@better-auth/core@1.7.14",
			"@better-auth/utils@0.5.1",
			"@better-fetch/fetch@1.3.3",
			"better-call@1.4.4",
			"@better-auth/api-key@1.7.14",
			"@better-auth/passkey@1.7.14",
		],
		decision: PLUGIN_DECISIONS["better-auth-ui"],
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
	crm: [
		"/pages/crm/contacts",
		"/pages/crm/contacts/new",
		"/pages/crm/contacts/:id",
		"/pages/crm/contacts/:id/edit",
		"/pages/crm/companies",
		"/pages/crm/pipelines",
		"/pages/crm/pipeline/:pipelineId",
		"/pages/crm/deals/:id",
	],
	newsletter: [
		"/pages/newsletter/subscribers",
		"/pages/newsletter/campaigns",
		"/pages/newsletter/campaigns/new",
		"/pages/newsletter/campaigns/:id",
		"/pages/newsletter/campaigns/:id/stats",
	],
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
	"job-board": [
		"/pages/jobs",
		"/pages/jobs/department/:dept",
		"/pages/jobs/:slug",
	],
	kanban: ["/pages/kanban", "/pages/kanban/new", "/pages/kanban/:boardId"],
	school: [
		"/pages/learn",
		"/pages/learn/me",
		"/pages/learn/instructor",
		"/pages/learn/instructor/courses/:id",
		"/pages/learn/instructor/courses/:id/lessons/:lessonId",
		"/pages/learn/certificates/:certificateId",
		"/pages/learn/:slug",
		"/pages/learn/:slug/lessons/:lessonId",
		"/pages/learn/:slug/lessons/:lessonId/quiz",
	],
	affiliate: [
		"/pages/affiliate/admin/affiliates",
		"/pages/affiliate/admin/commissions",
		"/pages/affiliate/admin/payouts",
		"/pages/affiliate/apply",
		"/pages/affiliate/portal",
	],
	analytics: ["/pages/analytics"],
	ecommerce: [
		"/pages/shop",
		"/pages/shop/cart",
		"/pages/shop/checkout",
		"/pages/shop/orders",
		"/pages/shop/admin/orders",
	],
	"feature-flags": ["/pages/feature-flags", "/pages/feature-flags/new"],
	calendar: [
		"/pages/calendar",
		"/pages/calendar/events/new",
		"/pages/calendar/events/:id/edit",
		"/pages/calendar/book/:slug",
		"/pages/calendar/cancel/:token",
	],
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
		"/pages/auth/reset-link-sent",
		"/pages/auth/callback",
		"/pages/auth/error",
		"/pages/auth/redirect",
		"/pages/auth/sign-out",
		"/pages/auth/verify-email",
		"/pages/account/account",
		"/pages/account/security",
	],
};
