/**
 * Browser-safe subset of the @btst/codegen programmatic API.
 * Contains only pure data and functions with no Node.js built-in dependencies.
 * Use this entry point when importing in client-side or browser contexts.
 */
export { normalizePlugins } from "./utils/normalize-plugins";
export { PLUGINS, ADAPTERS, PLUGIN_ROUTES } from "./utils/constants";
export type {
	PluginKey,
	Adapter,
	Framework,
	FileWritePlanItem,
	ScaffoldPlan,
} from "./types";
export type { PluginMeta, AdapterMeta } from "./utils/constants";
export type { SeedRouteFile } from "./utils/seed-plan";
