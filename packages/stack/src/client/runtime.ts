import type {
	ClientLocation,
	ClientLocationOverride,
	ClientPluginEndpointOverride,
	ClientPluginRegistration,
	ClientProviderApi,
	ClientProviderPluginRuntime,
	ClientProviderProjection,
	ResolvedClientPluginRuntime,
	ResolvedClientStackConfig,
} from "../types";

type AnyPluginMap = Record<string, ClientPluginRegistration<any, any>>;

interface ResolvedClientRuntime<TPlugins extends AnyPluginMap> {
	pluginRuntimes: { [K in keyof TPlugins]: ResolvedClientPluginRuntime };
	provider: ClientProviderProjection<TPlugins>;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
	if (value === null || typeof value !== "object" || Array.isArray(value)) {
		return false;
	}
	const prototype = Object.getPrototypeOf(value);
	return prototype === Object.prototype || prototype === null;
}

function normalizeBaseURL(value: unknown, label: string): string {
	if (typeof value !== "string" || value.length === 0) {
		throw new Error(
			`[btst/client] ${label} must be an absolute HTTP(S) origin.`,
		);
	}

	let parsed: URL;
	try {
		parsed = new URL(value);
	} catch {
		throw new Error(
			`[btst/client] ${label} must be an absolute HTTP(S) origin.`,
		);
	}

	if (
		(parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
		parsed.username ||
		parsed.password ||
		parsed.search ||
		parsed.hash ||
		(parsed.pathname !== "/" && parsed.pathname !== "")
	) {
		throw new Error(
			`[btst/client] ${label} must be an absolute HTTP(S) origin without credentials, path, query, or hash. Put the mount path in basePath.`,
		);
	}

	return parsed.origin;
}

function normalizeBasePath(value: unknown, label: string): string {
	if (typeof value !== "string" || value.length === 0) {
		throw new Error(`[btst/client] ${label} is required.`);
	}
	if (
		value.includes("?") ||
		value.includes("#") ||
		value.startsWith("//") ||
		/^[a-z][a-z\d+.-]*:/i.test(value)
	) {
		throw new Error(
			`[btst/client] ${label} must be a path without an origin, query, or hash.`,
		);
	}

	const withLeadingSlash = value.startsWith("/") ? value : `/${value}`;
	return withLeadingSlash === "/"
		? withLeadingSlash
		: withLeadingSlash.replace(/\/+$/, "");
}

function normalizeLocation(
	value: ClientLocation,
	label: string,
): ClientLocation {
	if (!isPlainRecord(value)) {
		throw new Error(`[btst/client] ${label} endpoint is required.`);
	}
	return {
		baseURL: normalizeBaseURL(value.baseURL, `${label}.baseURL`),
		basePath: normalizeBasePath(value.basePath, `${label}.basePath`),
	};
}

function resolveLocationOverride(
	base: ClientLocation,
	override: ClientLocationOverride | undefined,
	label: string,
): ClientLocation {
	if (override === undefined) return { ...base };
	if (!isPlainRecord(override)) {
		throw new Error(`[btst/client] ${label} must be an endpoint object.`);
	}

	if ("baseURL" in override && override.baseURL !== undefined) {
		if (!("basePath" in override) || override.basePath === undefined) {
			throw new Error(
				`[btst/client] ${label}.basePath is required when replacing baseURL.`,
			);
		}
		return normalizeLocation(
			{ baseURL: override.baseURL, basePath: override.basePath },
			label,
		);
	}

	return {
		baseURL: base.baseURL,
		basePath: normalizeBasePath(override.basePath, `${label}.basePath`),
	};
}

function cloneHeaders(headers: HeadersInit | undefined): Headers | undefined {
	if (headers === undefined) return undefined;
	const copy = new Headers(headers);
	return copy.keys().next().done ? undefined : copy;
}

function mergeHeaders(
	inherited: Headers | undefined,
	explicit: HeadersInit | undefined,
): Headers | undefined {
	const merged = new Headers(inherited);
	if (explicit !== undefined) {
		for (const [name, value] of new Headers(explicit)) {
			merged.set(name, value);
		}
	}
	return merged.keys().next().done ? undefined : merged;
}

const SENSITIVE_BROWSER_HEADER_NAMES = new Set([
	"authorization",
	"cookie",
	"proxy-authorization",
	"set-cookie",
]);

function cloneBrowserHeaders(
	headers: HeadersInit | undefined,
	label: string,
): Headers | undefined {
	const copy = cloneHeaders(headers);
	if (!copy) return undefined;
	for (const name of copy.keys()) {
		if (SENSITIVE_BROWSER_HEADER_NAMES.has(name.toLowerCase())) {
			throw new Error(
				`[btst/client] ${label} cannot include sensitive header "${name}". Keep request credentials in server-only api.headers or use explicit browser credentials with a compatible endpoint.`,
			);
		}
	}
	return copy;
}

function resolveCredentials(
	value: unknown,
	label: string,
): RequestCredentials | undefined {
	if (value === undefined) return undefined;
	if (value === "omit" || value === "same-origin" || value === "include") {
		return value;
	}
	throw new Error(
		`[btst/client] ${label} must be "omit", "same-origin", or "include".`,
	);
}

function projectApi(
	location: ClientLocation,
	browserHeaders: Headers | undefined,
	credentials: RequestCredentials | undefined,
): ClientProviderApi {
	return {
		...location,
		...(browserHeaders ? { browserHeaders } : {}),
		...(credentials !== undefined ? { credentials } : {}),
	};
}

/** Resolves one request/browser runtime and its request-data-free provider view. */
export function resolveClientRuntime<TPlugins extends AnyPluginMap>(
	config: ResolvedClientStackConfig<TPlugins>,
): ResolvedClientRuntime<TPlugins> {
	const api = normalizeLocation(config.api, "api");
	const site = normalizeLocation(config.site, "site");
	if (
		config.queryClient === null ||
		typeof config.queryClient !== "object" ||
		typeof config.queryClient.getQueryCache !== "function"
	) {
		throw new Error(
			"[btst/client] queryClient must be one React Query QueryClient instance shared by the stack.",
		);
	}
	if (
		config.plugins === null ||
		typeof config.plugins !== "object" ||
		Array.isArray(config.plugins)
	) {
		throw new Error(`[btst/client] plugins must be a plugin registration map.`);
	}
	if (config.endpoints !== undefined && !isPlainRecord(config.endpoints)) {
		throw new Error(`[btst/client] endpoints must be a plugin endpoint map.`);
	}

	if (typeof window !== "undefined" && config.api.headers !== undefined) {
		throw new Error(
			"[btst/client] API request headers are server-only. Create the browser stack without api.headers and use per-plugin browserHeaders only for explicitly public values.",
		);
	}

	const requestHeaders = cloneHeaders(config.api.headers);
	const endpointKeys = Object.keys(config.endpoints ?? {});
	for (const pluginKey of endpointKeys) {
		if (!(pluginKey in config.plugins)) {
			throw new Error(
				`[btst/client] Endpoint replacement "${pluginKey}" has no registered client plugin.`,
			);
		}
	}

	const pluginRuntimes: Record<string, ResolvedClientPluginRuntime> = {};
	const providerPlugins: Record<string, ClientProviderPluginRuntime> = {};

	for (const pluginKey of Object.keys(config.plugins)) {
		const endpoint = config.endpoints?.[pluginKey];
		if (endpoint !== undefined && !isPlainRecord(endpoint)) {
			throw new Error(
				`[btst/client] Endpoint replacement "${pluginKey}" must be an object.`,
			);
		}
		const endpointConfig = endpoint as ClientPluginEndpointOverride | undefined;

		const pluginApi = resolveLocationOverride(
			api,
			endpointConfig?.api,
			`endpoints.${pluginKey}.api`,
		);
		const pluginSite = resolveLocationOverride(
			site,
			endpointConfig?.site,
			`endpoints.${pluginKey}.site`,
		);
		const sameApiOrigin = pluginApi.baseURL === api.baseURL;
		const browserHeaders = cloneBrowserHeaders(
			endpointConfig?.api?.browserHeaders,
			`endpoints.${pluginKey}.api.browserHeaders`,
		);
		const credentials = resolveCredentials(
			endpointConfig?.api?.credentials,
			`endpoints.${pluginKey}.api.credentials`,
		);
		const headers = mergeHeaders(
			sameApiOrigin ? requestHeaders : undefined,
			browserHeaders,
		);

		pluginRuntimes[pluginKey] = {
			api: {
				...pluginApi,
				...(headers ? { headers } : {}),
				...(credentials !== undefined ? { credentials } : {}),
			},
			site: pluginSite,
			queryClient: config.queryClient,
		};
		providerPlugins[pluginKey] = {
			api: projectApi(pluginApi, browserHeaders, credentials),
			site: pluginSite,
		};
	}

	return {
		pluginRuntimes: pluginRuntimes as {
			[K in keyof TPlugins]: ResolvedClientPluginRuntime;
		},
		provider: {
			api,
			site,
			queryClient: config.queryClient,
			plugins: providerPlugins as {
				[K in keyof TPlugins]: ClientProviderPluginRuntime;
			},
		},
	};
}
