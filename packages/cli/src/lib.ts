/**
 * Programmatic API for @btst/codegen scaffold utilities.
 * Use this when consuming the CLI as a library (e.g. in the playground).
 */
export { buildScaffoldPlan } from "./utils/scaffold-plan";
export { PLUGINS, ADAPTERS, PLUGIN_ROUTES } from "./utils/constants";
export type {
	PluginKey,
	Adapter,
	Framework,
	FileWritePlanItem,
	ScaffoldPlan,
} from "./types";
export type { PluginMeta, AdapterMeta } from "./utils/constants";
