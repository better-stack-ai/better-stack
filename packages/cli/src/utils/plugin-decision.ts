import type { PluginKey } from "../types";

/** Registration boundary of an installable BTST plugin. */
type PluginTopology = "Full-stack" | "Backend-only" | "Client-only";

/** Optional relationship to another BTST plugin or external system. */
type PluginRelationship = "Companion" | "Dependent";

/** Evidence-based release status shown on evaluator surfaces. */
type PluginReleaseStatus = "Stable" | "Preview";

/** Framework integrations covered by the maintained v3 integration paths. */
type MaintainedFramework =
	| "Next.js 15+ App Router"
	| "React Router v7"
	| "TanStack Start";

/**
 * Versioned technical facts used to evaluate an installable BTST plugin.
 * Audience copy, workflow wording, calls to action, and visual presentation are
 * owned by the surface that renders these facts.
 */
export interface PluginDecisionMeta {
	/** Boundary relative to the registered BTST backend and client stacks. */
	topology: PluginTopology;
	/** Relationship to another plugin or external system, when one exists. */
	relationship?: PluginRelationship;
	/** Evidence-based support status for the released plugin. */
	releaseStatus: PluginReleaseStatus;
	/** Concrete runtime, data, route, or UI capabilities shipped by BTST. */
	supplies: readonly string[];
	/** Application-specific infrastructure or policy the adopter provides. */
	adopterSupplies: readonly string[];
	/** Required BTST, database, or runtime dependencies. */
	dependencies: readonly string[];
	/** External services contacted by the plugin, including optional services. */
	externalServices: readonly string[];
	/** Maintained framework integration paths for this plugin. */
	supportedFrameworks: readonly MaintainedFramework[];
	/** Canonical documentation identifier. */
	docsPath: `/plugins/${string}`;
	/** Canonical working demo identifier, when one exists. */
	demoPath?: `https://${string}`;
	/** Canonical public source identifier. */
	sourcePath: `https://github.com/better-stack-ai/${string}`;
}

const MAINTAINED_FRAMEWORKS = [
	"Next.js 15+ App Router",
	"React Router v7",
	"TanStack Start",
] as const satisfies readonly MaintainedFramework[];

export const PLUGIN_DECISIONS = {
	blog: {
		topology: "Full-stack",
		releaseStatus: "Preview",
		supplies: [
			"Post and tag data models with typed CRUD APIs and lifecycle hooks",
			"SSR-aware list, draft, editor, tag, and post routes",
			"Published-page metadata and sitemap entries",
			"Customizable Blog pages, hooks, and editor UI",
		],
		adopterSupplies: [
			"A BTST database adapter",
			"An image upload implementation when editor uploads are enabled",
			"An authorization policy when protected authoring operations are enabled",
			"The application shell, public origin, and deployment",
		],
		dependencies: ["A BTST database adapter"],
		externalServices: [],
		supportedFrameworks: MAINTAINED_FRAMEWORKS,
		docsPath: "/plugins/blog",
		demoPath: "https://www.better-stack.ai/p/blog",
		sourcePath:
			"https://github.com/better-stack-ai/better-stack/tree/main/packages/stack/src/plugins/blog",
	},
	"ai-chat": {
		topology: "Full-stack",
		releaseStatus: "Preview",
		supplies: [
			"Streaming chat APIs with typed tool, attachment, and lifecycle boundaries",
			"Conversation and message models for authenticated history",
			"SSR-aware conversation list and chat routes",
			"Customizable chat pages, hooks, and prompt UI",
		],
		adopterSupplies: [
			"An AI SDK model provider, credentials, usage policy, and provider billing",
			"A database adapter with isolated transactions for authenticated history",
			"Authorization rules for authenticated access, tools, and attachments",
			"An upload implementation when file attachments are enabled",
		],
		dependencies: [
			"An AI SDK language model",
			"A database adapter with isolated transaction support for authenticated persistence",
		],
		externalServices: [
			"The adopter-selected AI model provider receives prompts and generates responses",
		],
		supportedFrameworks: MAINTAINED_FRAMEWORKS,
		docsPath: "/plugins/ai-chat",
		demoPath:
			"https://www.better-stack.ai/playground?plugins=ai-chat&view=preview",
		sourcePath:
			"https://github.com/better-stack-ai/better-stack/tree/main/packages/stack/src/plugins/ai-chat",
	},
	cms: {
		topology: "Full-stack",
		releaseStatus: "Preview",
		supplies: [
			"Content-type and content-item data models with typed CRUD APIs and lifecycle hooks",
			"Admin routes for content-type lists, entries, creation, and editing",
			"Schema-driven forms generated from adopter-defined Zod content types",
			"Client hooks plus customizable and ejectable admin pages",
		],
		adopterSupplies: [
			"Code-defined Zod content types and application-owned public rendering",
			"A BTST database adapter",
			"An image upload implementation when file fields are enabled",
			"Authorization rules when content operations are protected",
		],
		dependencies: ["A BTST database adapter", "Code-defined Zod content types"],
		externalServices: [],
		supportedFrameworks: MAINTAINED_FRAMEWORKS,
		docsPath: "/plugins/cms",
		demoPath: "https://www.better-stack.ai/playground?plugins=cms&view=preview",
		sourcePath:
			"https://github.com/better-stack-ai/better-stack/tree/main/packages/stack/src/plugins/cms",
	},
	"form-builder": {
		topology: "Full-stack",
		releaseStatus: "Preview",
		supplies: [
			"Drag-and-drop editor with live preview and JSON Schema output",
			"Form and submission data models with typed APIs and lifecycle hooks",
			"Admin routes for forms, editing, and submission review",
			"A FormRenderer component for adopter-owned public routes",
		],
		adopterSupplies: [
			"A database adapter with isolated transaction support",
			"The public application route that mounts FormRenderer",
			"Authorization rules for admin operations when authorization is enabled",
			"An explicit public-access or permission policy for form reads and submissions when authorization is enabled",
		],
		dependencies: ["A database adapter with isolated transaction support"],
		externalServices: [],
		supportedFrameworks: MAINTAINED_FRAMEWORKS,
		docsPath: "/plugins/form-builder",
		sourcePath:
			"https://github.com/better-stack-ai/better-stack/tree/main/packages/stack/src/plugins/form-builder",
	},
	"ui-builder": {
		topology: "Client-only",
		relationship: "Dependent",
		releaseStatus: "Preview",
		supplies: [
			"Visual page-list, creation, and editing routes",
			"A component registry, layer editor, variables, and reusable block support",
			"A PageRenderer for application-owned public routes",
			"A CMS content-type declaration for storing page layers and status",
		],
		adopterSupplies: [
			"The components and blocks editors may place on a page",
			"A public route that loads CMS page data and mounts PageRenderer",
			"CMS authorization rules for page records",
			"The application shell and deployment",
		],
		dependencies: ["The CMS plugin, added automatically by the CLI"],
		externalServices: [],
		supportedFrameworks: MAINTAINED_FRAMEWORKS,
		docsPath: "/plugins/ui-builder",
		demoPath:
			"https://www.better-stack.ai/playground?plugins=ui-builder&view=preview",
		sourcePath:
			"https://github.com/better-stack-ai/better-stack/tree/main/packages/stack/src/plugins/ui-builder",
	},
	kanban: {
		topology: "Full-stack",
		releaseStatus: "Preview",
		supplies: [
			"Board, column, task, and assignee data models with typed APIs and lifecycle hooks",
			"SSR-aware board list, creation, and detail routes",
			"Drag-and-drop column and task workflows with priority and assignee UI",
			"Customizable hooks and ejectable Kanban pages",
		],
		adopterSupplies: [
			"A database adapter with isolated transaction support for persistent writes",
			"Authorization rules plus user search and identity resolution when assignees are enabled",
			"Product-specific workflow rules through configuration and lifecycle hooks",
			"The application shell and deployment",
		],
		dependencies: ["A database adapter with isolated transaction support"],
		externalServices: [],
		supportedFrameworks: MAINTAINED_FRAMEWORKS,
		docsPath: "/plugins/kanban",
		demoPath:
			"https://www.better-stack.ai/playground?plugins=kanban&view=preview",
		sourcePath:
			"https://github.com/better-stack-ai/better-stack/tree/main/packages/stack/src/plugins/kanban",
	},
	comments: {
		topology: "Full-stack",
		releaseStatus: "Preview",
		supplies: [
			"Threaded comment and reaction data models with typed APIs and lifecycle hooks",
			"Embeddable CommentThread and CommentCount components",
			"A moderation route for pending, approved, and spam comments",
			"Customizable hooks and ejectable moderation UI",
		],
		adopterSupplies: [
			"A BTST database adapter",
			"The resource type and identifier that each thread belongs to",
			"Authorization rules and authoritative request identity when access is protected",
			"A user resolver when author names and avatars should be displayed",
		],
		dependencies: ["A BTST database adapter", "An adopter-owned host resource"],
		externalServices: [],
		supportedFrameworks: MAINTAINED_FRAMEWORKS,
		docsPath: "/plugins/comments",
		sourcePath:
			"https://github.com/better-stack-ai/better-stack/tree/main/packages/stack/src/plugins/comments",
	},
	media: {
		topology: "Full-stack",
		releaseStatus: "Preview",
		supplies: [
			"Asset and folder data models with typed upload, registration, and library APIs",
			"An SSR-aware media-library route with search, folders, and asset actions",
			"Embeddable MediaPicker and ImageInputField components",
			"Local, S3-compatible, and Vercel Blob storage adapter implementations",
		],
		adopterSupplies: [
			"A database adapter with isolated transaction support for persistent writes",
			"A configured storage adapter and its credentials or local upload directory",
			"Allowed MIME types, size limits, URL prefixes, and authorization policy",
			"The application routes and fields that embed the picker or image input",
		],
		dependencies: [
			"An isolating Prisma, Drizzle, or Kysely database adapter for persistent writes",
			"A configured media storage adapter",
		],
		externalServices: [
			"Optional S3-compatible storage or Vercel Blob when the adopter selects those adapters",
		],
		supportedFrameworks: MAINTAINED_FRAMEWORKS,
		docsPath: "/plugins/media",
		sourcePath:
			"https://github.com/better-stack-ai/better-stack/tree/main/packages/stack/src/plugins/media",
	},
	"route-docs": {
		topology: "Client-only",
		releaseStatus: "Preview",
		supplies: [
			"A generated route-reference page for registered BTST client plugins",
			"Route paths, path and query parameters, sitemap entries, and plugin context",
			"Parameter-aware navigation to routes in the adopter's application",
			"An ejectable Route Docs page over the packaged introspection runtime",
		],
		adopterSupplies: [
			"Registered BTST client plugins whose routes can be inspected",
			"A deployment-level access boundary when route details should be private",
			"Concrete parameter values before navigating to a dynamic route",
			"The application shell and resolved site location",
		],
		dependencies: ["Registered BTST client routes to inspect"],
		externalServices: [],
		supportedFrameworks: MAINTAINED_FRAMEWORKS,
		docsPath: "/plugins/route-docs",
		sourcePath:
			"https://github.com/better-stack-ai/better-stack/tree/main/packages/stack/src/plugins/route-docs",
	},
	"open-api": {
		topology: "Backend-only",
		releaseStatus: "Preview",
		supplies: [
			"Deterministic OpenAPI 3.1 generation from registered route metadata and Zod inputs",
			"A JSON schema endpoint at the configured API base path plus the fixed /open-api/schema suffix",
			"An optional Scalar HTML reference endpoint with theme and CSP nonce options",
			"Public or permission-ID access metadata for documented operations",
		],
		adopterSupplies: [
			"A registered BTST backend stack whose routes can be inspected",
			"A configured API base path; the schema suffix remains /open-api/schema",
			"Optional overrides for the API title, version, and reference path; defaults are BTST API, 1.0.0, and /reference",
			"A framework-level access policy if the documentation must be private",
		],
		dependencies: ["A registered BTST backend stack to inspect"],
		externalServices: [
			"The optional Scalar reference loads @scalar/api-reference from jsDelivr",
		],
		supportedFrameworks: MAINTAINED_FRAMEWORKS,
		docsPath: "/plugins/open-api",
		sourcePath:
			"https://github.com/better-stack-ai/better-stack/tree/main/packages/stack/src/plugins/open-api",
	},
	"better-auth-ui": {
		topology: "Client-only",
		relationship: "Companion",
		releaseStatus: "Preview",
		supplies: [
			"Auth and account route definitions backed by @btst/better-auth-ui",
			"Sign-in, sign-up, recovery, account, security, and settings UI",
			"A CLI scaffold that creates one browser client for the existing auth endpoint",
			"Framework-native session refresh wiring for the maintained integration paths",
		],
		adopterSupplies: [
			"An existing Better Auth server, schema, migrations, providers, and secrets",
			"A Better Auth browser client configured for the adopter-owned endpoint",
			"Any optional Better Auth server and client plugins used by the application",
			"Deployment, session policy, and separate BTST authorization mapping when needed",
		],
		dependencies: [
			"An existing Better Auth backend and browser client",
			"The supported @btst/better-auth-ui and Better Auth package cohort",
		],
		externalServices: [
			"The adopter's existing Better Auth endpoint; BTST does not host it",
		],
		supportedFrameworks: MAINTAINED_FRAMEWORKS,
		docsPath: "/plugins/better-auth-ui",
		sourcePath: "https://github.com/better-stack-ai/better-auth-ui",
	},
} as const satisfies Record<PluginKey, PluginDecisionMeta>;
