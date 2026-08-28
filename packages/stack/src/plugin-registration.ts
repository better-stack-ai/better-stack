type PluginSide = "client" | "backend";

function isPlainRecord(value: unknown): value is Record<string, unknown> {
	if (value === null || typeof value !== "object" || Array.isArray(value)) {
		return false;
	}
	const prototype = Object.getPrototypeOf(value);
	return prototype === Object.prototype || prototype === null;
}

function isPluginObject(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Resolve the stable programmatic ID while retaining legacy `name` support. */
export function resolvePluginProgrammaticId(
	plugin: object,
	registrationId: string,
): string {
	if (Object.hasOwn(plugin, "id")) return registrationId;
	const legacyName = (plugin as { name?: unknown }).name;
	return typeof legacyName === "string" && legacyName.length > 0
		? legacyName
		: registrationId;
}

/**
 * Validates canonical plugin IDs before any plugin factory or adapter work.
 * Legacy plugins without an own `id` remain bound to their registration key.
 */
export function resolvePluginRegistrationIds(
	plugins: unknown,
	side: PluginSide,
): Record<string, string> {
	if (!isPlainRecord(plugins)) {
		throw new Error(
			`[btst/${side}] plugins must be a plugin registration map.`,
		);
	}

	const idsByKey: Record<string, string> = Object.create(null);
	const firstKeyById = new Map<string, string>();
	const canonical: Array<{ key: string; id: string }> = [];

	for (const [key, plugin] of Object.entries(plugins)) {
		if (!isPluginObject(plugin)) {
			throw new Error(
				`[btst/${side}] ${side === "client" ? "Client" : "Backend"} plugin registration "${key}" must be a plugin object.`,
			);
		}

		if (!Object.hasOwn(plugin, "id")) {
			idsByKey[key] = key;
			continue;
		}

		const id = plugin.id;
		if (typeof id !== "string" || id.length === 0) {
			throw new Error(
				`[btst/${side}] ${side === "client" ? "Client" : "Backend"} plugin registered as "${key}" has an invalid ID. IDs must be non-empty strings.`,
			);
		}

		const firstKey = firstKeyById.get(id);
		if (firstKey !== undefined) {
			throw new Error(
				`[btst/${side}] ${side === "client" ? "Client" : "Backend"} plugin ID "${id}" is duplicated by conflicting registration keys "${firstKey}" and "${key}". Multiple-instance aliases are not supported.`,
			);
		}
		firstKeyById.set(id, key);
		idsByKey[key] = id;
		canonical.push({ key, id });
	}

	for (const { key, id } of canonical) {
		if (key !== id) {
			throw new Error(
				`[btst/${side}] ${side === "client" ? "Client" : "Backend"} plugin registration key "${key}" conflicts with declared ID "${id}". Registration keys must match plugin IDs; aliases are not supported.`,
			);
		}
	}

	return idsByKey;
}
