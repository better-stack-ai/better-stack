import { normalizePlugins } from "@btst/codegen/meta";
import type { PluginKey } from "@btst/codegen/meta";

/** Plugins that cannot run honestly in the browser-only playground runtime. */
export const PLAYGROUND_UNSUPPORTED_PLUGINS: Partial<
	Record<PluginKey, string>
> = {
	"form-builder":
		"Requires a database adapter with isolated transactions, which the browser playground does not provide.",
};

/**
 * Applies auto-inclusion rules to a raw plugin selection:
 * - `ui-builder` requires `cms` (delegated to normalizePlugins)
 * - `route-docs` is always included
 *
 * Used by both the server action (generateProject) and the client-side
 * route preview so the two stay in sync.
 */
export function getEffectivePlugins(selected: PluginKey[]): PluginKey[] {
	const supported = selected.filter(
		(key) => !PLAYGROUND_UNSUPPORTED_PLUGINS[key],
	);
	const normalized = normalizePlugins(supported);
	return normalized.includes("route-docs")
		? normalized
		: ([...normalized, "route-docs"] as PluginKey[]);
}
