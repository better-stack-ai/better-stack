export interface TrustedServerOriginOptions {
	/** Deployment-controlled origin. This always wins when present. */
	configuredOrigin?: string;
	/** Request-derived origin used only for loopback development. */
	requestOrigin?: string;
	isProduction: boolean;
	developmentFallback?: string;
	label?: string;
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
