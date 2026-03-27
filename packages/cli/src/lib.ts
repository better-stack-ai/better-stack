/**
 * Programmatic API for @btst/codegen scaffold utilities.
 * Use this when consuming the CLI as a library (e.g. in the playground).
 */
export { buildScaffoldPlan } from "./utils/scaffold-plan";
export { PLUGINS, ADAPTERS } from "./utils/constants";
export { PLUGIN_ROUTES } from "./utils/plugin-routes";
export type {
	PluginKey,
	Adapter,
	Framework,
	FileWritePlanItem,
	ScaffoldPlan,
} from "./types";
export type { PluginMeta, AdapterMeta } from "./utils/constants";
