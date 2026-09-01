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
	sourcePath: `https://github.com/better-stack-ai/better-stack/${string}`;
}

type RepresentativePluginKey = Extract<
	PluginKey,
	"blog" | "form-builder" | "open-api"
>;

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
} as const satisfies Record<RepresentativePluginKey, PluginDecisionMeta>;
