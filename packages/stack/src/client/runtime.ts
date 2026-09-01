import type {
	ClientLocation,
	ClientPluginEndpointOverride,
	ClientPluginRegistration,
	ClientProviderApi,
	ClientProviderPluginRuntime,
	ClientProviderProjection,
	ResolvedClientPluginRuntime,
	ResolvedClientStackConfig,
} from "../types";

type AnyPluginMap = Record<
	string,
	ClientPluginRegistration<any, any, any, any, any>
>;

interface ResolvedPluginApi {
	runtime: ResolvedClientPluginRuntime["api"];
	provider: ClientProviderApi;
}

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

function ownValue(value: object | undefined, key: PropertyKey): unknown {
	return value !== undefined && Object.hasOwn(value, key)
		? (value as Record<PropertyKey, unknown>)[key]
		: undefined;
}

function nullRecord<T extends object>(value: T): T {
	return Object.assign(Object.create(null), value) as T;
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

function normalizeLocation(value: unknown, label: string): ClientLocation {
	if (!isPlainRecord(value)) {
		throw new Error(`[btst/client] ${label} endpoint is required.`);
	}
	return nullRecord({
		baseURL: normalizeBaseURL(ownValue(value, "baseURL"), `${label}.baseURL`),
		basePath: normalizeBasePath(
			ownValue(value, "basePath"),
			`${label}.basePath`,
		),
	});
}

function resolveLocationOverride(
	base: ClientLocation,
	override: unknown,
	label: string,
): ClientLocation {
	if (override === undefined) return nullRecord({ ...base });
	if (!isPlainRecord(override)) {
		throw new Error(`[btst/client] ${label} must be an endpoint object.`);
	}

	const overrideBaseURL = ownValue(override, "baseURL");
	const overrideBasePath = ownValue(override, "basePath");
	if (overrideBaseURL !== undefined) {
		if (overrideBasePath === undefined) {
			throw new Error(
				`[btst/client] ${label}.basePath is required when replacing baseURL.`,
			);
		}
		return normalizeLocation(
			{ baseURL: overrideBaseURL, basePath: overrideBasePath },
			label,
		);
	}

	return nullRecord({
		baseURL: base.baseURL,
		basePath: normalizeBasePath(overrideBasePath, `${label}.basePath`),
	});
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
	return nullRecord({
		...location,
		...(browserHeaders ? { browserHeaders } : {}),
		...(credentials !== undefined ? { credentials } : {}),
	});
}

/** Resolves one request/browser runtime and its request-data-free provider view. */
export function resolveClientRuntime<TPlugins extends AnyPluginMap>(
	config: ResolvedClientStackConfig<TPlugins>,
	registrationIds: Readonly<Record<string, string>>,
): ResolvedClientRuntime<TPlugins> {
	for (const removedField of ["baseURL", "basePath"] as const) {
		if (Object.hasOwn(config, removedField)) {
			throw new Error(
				`[btst/client] Top-level ${removedField} was removed. Configure it under api or site.`,
			);
		}
	}
	const apiConfig = ownValue(config, "api");
	const siteConfig = ownValue(config, "site");
	const queryClient = ownValue(config, "queryClient") as
		| ResolvedClientStackConfig<TPlugins>["queryClient"]
		| undefined;
	const plugins = ownValue(config, "plugins");
	const endpoints = ownValue(config, "endpoints");
	const api = normalizeLocation(apiConfig, "api");
	const site = normalizeLocation(siteConfig, "site");
	if (
		queryClient === null ||
		typeof queryClient !== "object" ||
		typeof queryClient.getQueryCache !== "function"
	) {
		throw new Error(
			"[btst/client] queryClient must be one React Query QueryClient instance shared by the stack.",
		);
	}
	if (!isPlainRecord(plugins)) {
		throw new Error(`[btst/client] plugins must be a plugin registration map.`);
	}
	if (endpoints !== undefined && !isPlainRecord(endpoints)) {
		throw new Error(`[btst/client] endpoints must be a plugin endpoint map.`);
	}

	const requestHeaderInput = isPlainRecord(apiConfig)
		? ownValue(apiConfig, "headers")
		: undefined;
	if (typeof window !== "undefined" && requestHeaderInput !== undefined) {
		throw new Error(
			"[btst/client] API request headers are server-only. Create the browser stack without api.headers and use per-plugin browserHeaders only for explicitly public values.",
		);
	}

	const requestHeaders = cloneHeaders(
		requestHeaderInput as HeadersInit | undefined,
	);
	const endpointKeys = Object.keys(endpoints ?? {});
	for (const pluginKey of endpointKeys) {
		if (!Object.hasOwn(plugins, pluginKey)) {
			throw new Error(
				`[btst/client] Endpoint replacement "${pluginKey}" has no registered client plugin.`,
			);
		}
	}

	const pluginRuntimes: Record<string, ResolvedClientPluginRuntime> =
		Object.create(null);
	const providerPlugins: Record<string, ClientProviderPluginRuntime> =
		Object.create(null);
	const resolvedApis: Record<string, ResolvedPluginApi> = Object.create(null);
	const resolvingApis = new Set<string>();

	const endpointConfigFor = (
		pluginKey: string,
	): ClientPluginEndpointOverride | undefined => {
		const endpoint =
			endpoints && Object.hasOwn(endpoints, pluginKey)
				? endpoints[pluginKey]
				: undefined;
		if (endpoint !== undefined && !isPlainRecord(endpoint)) {
			throw new Error(
				`[btst/client] Endpoint replacement "${pluginKey}" must be an object.`,
			);
		}
		return endpoint as ClientPluginEndpointOverride | undefined;
	};

	const resolvePluginApi = (pluginKey: string): ResolvedPluginApi => {
		if (resolvedApis[pluginKey]) return resolvedApis[pluginKey];
		if (resolvingApis.has(pluginKey)) {
			throw new Error(
				`[btst/client] Client plugin "${pluginKey}" has a circular API runtime dependency.`,
			);
		}
		resolvingApis.add(pluginKey);

		const registration = plugins[pluginKey];
		const registrationRecord = isPlainRecord(registration)
			? registration
			: undefined;
		const endpointConfig = endpointConfigFor(pluginKey);
		const endpointApi = endpointConfig
			? ownValue(endpointConfig, "api")
			: undefined;
		const apiRuntimeFrom = ownValue(registrationRecord, "apiRuntimeFrom");

		if (apiRuntimeFrom !== undefined) {
			if (typeof apiRuntimeFrom !== "string" || apiRuntimeFrom.length === 0) {
				throw new Error(
					`[btst/client] Client plugin "${pluginKey}" must declare apiRuntimeFrom as a programmatic plugin ID.`,
				);
			}
			if (endpointApi !== undefined) {
				throw new Error(
					`[btst/client] Client plugin "${pluginKey}" inherits the "${apiRuntimeFrom}" API runtime. Configure endpoints.${apiRuntimeFrom}.api instead of endpoints.${pluginKey}.api.`,
				);
			}
			const sourceKey = Object.keys(plugins).find(
				(key) => registrationIds[key] === apiRuntimeFrom,
			);
			if (sourceKey) {
				const inherited: ResolvedPluginApi = resolvePluginApi(sourceKey);
				resolvedApis[pluginKey] = inherited;
				resolvingApis.delete(pluginKey);
				return inherited;
			}
		}

		const pluginApi = resolveLocationOverride(
			api,
			endpointApi,
			`endpoints.${pluginKey}.api`,
		);
		const sameApiOrigin = pluginApi.baseURL === api.baseURL;
		const endpointApiConfig = isPlainRecord(endpointApi)
			? endpointApi
			: undefined;
		const browserHeaders = cloneBrowserHeaders(
			ownValue(endpointApiConfig, "browserHeaders") as HeadersInit | undefined,
			`endpoints.${pluginKey}.api.browserHeaders`,
		);
		const credentials = resolveCredentials(
			ownValue(endpointApiConfig, "credentials"),
			`endpoints.${pluginKey}.api.credentials`,
		);
		const headers = mergeHeaders(
			sameApiOrigin ? requestHeaders : undefined,
			browserHeaders,
		);
		const resolved = {
			runtime: nullRecord({
				...pluginApi,
				...(headers ? { headers } : {}),
				...(credentials !== undefined ? { credentials } : {}),
			}),
			provider: projectApi(pluginApi, browserHeaders, credentials),
		};
		resolvedApis[pluginKey] = resolved;
		resolvingApis.delete(pluginKey);
		return resolved;
	};

	for (const pluginKey of Object.keys(plugins)) {
		const registration = plugins[pluginKey];
		const registrationRecord = isPlainRecord(registration)
			? registration
			: undefined;
		const providerConfig = ownValue(registrationRecord, "providerConfig");
		if (providerConfig !== undefined && !isPlainRecord(providerConfig)) {
			throw new Error(
				`[btst/client] Client plugin "${pluginKey}" providerConfig must be a browser-safe object.`,
			);
		}
		const id = registrationIds[pluginKey]!;
		const endpointConfig = endpointConfigFor(pluginKey);
		const endpointSite = endpointConfig
			? ownValue(endpointConfig, "site")
			: undefined;
		const pluginSite = resolveLocationOverride(
			site,
			endpointSite,
			`endpoints.${pluginKey}.site`,
		);
		const resolvedApi = resolvePluginApi(pluginKey);

		pluginRuntimes[pluginKey] = nullRecord({
			id,
			api: resolvedApi.runtime,
			site: pluginSite,
			queryClient,
		});
		providerPlugins[pluginKey] = nullRecord({
			id,
			api: resolvedApi.provider,
			site: pluginSite,
			...(registrationRecord &&
			Object.hasOwn(registrationRecord, "providerConfig")
				? { config: providerConfig }
				: {}),
		});
	}

	return nullRecord({
		pluginRuntimes: pluginRuntimes as {
			[K in keyof TPlugins]: ResolvedClientPluginRuntime;
		},
		provider: nullRecord({
			api,
			site,
			queryClient,
			plugins: providerPlugins as ClientProviderProjection<TPlugins>["plugins"],
		}),
	});
}
