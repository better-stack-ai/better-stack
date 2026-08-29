/** Security policy used to resolve one deployment-trusted server origin. */
export interface TrustedServerOriginOptions {
	/** Deployment-controlled origin. This always wins when present. */
	configuredOrigin?: string;
	/** Request-derived origin used only for loopback development. */
	requestOrigin?: string;
	/** Whether missing deployment configuration must fail closed. */
	isProduction: boolean;
	/** Loopback-only origin used when development has no request origin. */
	developmentFallback?: string;
	/** Human-readable configuration name included in validation errors. */
	label?: string;
}

/** Browser-safe API and site origins resolved from server-owned configuration. */
export interface TrustedClientOrigins {
	/** Trusted destination for client-stack API requests. */
	apiOrigin: string;
	/** Trusted public origin used to build page and asset URLs. */
	siteOrigin: string;
}

/** Security policy used to resolve one API/site origin snapshot. */
export interface TrustedClientOriginsOptions {
	/** Deployment-controlled managed or same-origin API destination. */
	configuredApiOrigin?: string;
	/** Deployment-controlled public site origin. */
	configuredSiteOrigin?: string;
	/** Request-derived origin used only for loopback development. */
	requestOrigin?: string;
	/** Whether missing deployment configuration must fail closed. */
	isProduction: boolean;
	/** Loopback-only origin used when development has no request origin. */
	developmentFallback?: string;
	/** Human-readable API configuration name included in validation errors. */
	apiLabel?: string;
	/** Human-readable site configuration name included in validation errors. */
	siteLabel?: string;
}

const ROUTING_AND_HOP_BY_HOP_HEADERS = [
	"connection",
	"content-length",
	"forwarded",
	"host",
	"keep-alive",
	"proxy-authenticate",
	"proxy-authorization",
	"proxy-connection",
	"te",
	"trailer",
	"transfer-encoding",
	"upgrade",
	"x-forwarded-for",
	"x-forwarded-host",
	"x-forwarded-port",
	"x-forwarded-proto",
	"x-real-ip",
] as const;

/** Keeps identity headers while removing inbound routing and hop-by-hop state. */
export function filterCredentialForwardingHeaders(
	requestHeaders: HeadersInit,
): Headers {
	const headers = new Headers(requestHeaders);
	const connectionHeaders = headers
		.get("connection")
		?.split(",")
		.map((name) => name.trim())
		.filter(Boolean);
	for (const name of ROUTING_AND_HOP_BY_HOP_HEADERS) headers.delete(name);
	for (const name of connectionHeaders ?? []) headers.delete(name);
	return headers;
}

function normalizeHttpOrigin(value: string, label: string): string {
	let parsed: URL;
	try {
		parsed = new URL(value);
	} catch {
		throw new Error(`${label} must be an absolute HTTP(S) origin.`);
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
			`${label} must be an absolute HTTP(S) origin without credentials, path, query, or hash.`,
		);
	}

	return parsed.origin;
}

function isLoopbackOrigin(origin: string): boolean {
	const hostname = new URL(origin).hostname;
	return (
		hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]"
	);
}

/**
 * Resolves a server transport origin without trusting production Host headers.
 *
 * A deployment-controlled origin always wins, which supports managed and
 * cross-origin APIs. Production fails closed without one. Local development may
 * infer only a loopback request origin.
 */
export function resolveTrustedServerOrigin(
	options: TrustedServerOriginOptions,
): string {
	const label = options.label ?? "server origin";
	if (options.configuredOrigin) {
		return normalizeHttpOrigin(options.configuredOrigin, label);
	}

	if (options.isProduction) {
		throw new Error(`${label} must be configured in production.`);
	}

	if (options.requestOrigin) {
		const requestOrigin = normalizeHttpOrigin(
			options.requestOrigin,
			"request origin",
		);
		if (!isLoopbackOrigin(requestOrigin)) {
			throw new Error(
				`${label} without configuration is limited to loopback development origins.`,
			);
		}
		return requestOrigin;
	}

	const fallback = normalizeHttpOrigin(
		options.developmentFallback ?? "http://localhost:3000",
		"development fallback",
	);
	if (!isLoopbackOrigin(fallback)) {
		throw new Error("development fallback must use a loopback origin.");
	}
	return fallback;
}

/**
 * Resolves the API and public site origins once on the server.
 *
 * A separately configured managed API remains distinct. Without one, the API
 * safely defaults to the already-trusted site origin.
 */
export function resolveTrustedClientOrigins(
	options: TrustedClientOriginsOptions,
): TrustedClientOrigins {
	const siteOrigin = resolveTrustedServerOrigin({
		configuredOrigin: options.configuredSiteOrigin,
		requestOrigin: options.requestOrigin,
		isProduction: options.isProduction,
		developmentFallback: options.developmentFallback,
		label: options.siteLabel ?? "site origin",
	});
	const apiOrigin = resolveTrustedServerOrigin({
		configuredOrigin: options.configuredApiOrigin ?? siteOrigin,
		requestOrigin: options.requestOrigin,
		isProduction: options.isProduction,
		developmentFallback: options.developmentFallback,
		label: options.apiLabel ?? "API origin",
	});

	return { apiOrigin, siteOrigin };
}
