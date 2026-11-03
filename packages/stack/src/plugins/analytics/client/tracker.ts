/** Transport configuration for tracking outside a resolved BTST client stack. */
export interface AnalyticsTrackerOptions {
	/** API origin; omitted for same-origin collection. */
	apiBaseURL?: string;
	/** API mount path, matching createBackendStack(). Defaults to /api/data. */
	apiBasePath?: string;
	/** Explicit Fetch credentials policy. Uses Fetch instead of a beacon when set. */
	credentials?: RequestCredentials;
}

/** Cookie-free tracker with a session identifier held only in memory. */
export interface AnalyticsTracker {
	/** Record a page view, excluding query strings and fragments. */
	pageView(path?: string): Promise<boolean>;
	/** Record a custom event. Properties should never contain personal data. */
	track(
		name: string,
		properties?: Record<string, string | number | boolean | null>,
	): Promise<boolean>;
}

const SESSION_TIMEOUT = 30 * 60 * 1000;

/** Create a tracker without React, cookies, localStorage, or third-party scripts. */
export function createAnalyticsTracker(
	options: AnalyticsTrackerOptions = {},
): AnalyticsTracker {
	let sessionId: string | undefined;
	let lastActivity = 0;
	let lastView: { path: string; at: number } | undefined;
	const basePath = (options.apiBasePath ?? "/api/data").replace(
		/^\/+|\/+$/g,
		"",
	);
	const endpoint = `${(options.apiBaseURL ?? "").replace(/\/+$/, "")}${basePath ? `/${basePath}` : ""}/analytics`;

	async function send(
		kind: "pageviews" | "events",
		data: Record<string, unknown>,
	): Promise<boolean> {
		if (typeof window === "undefined" || typeof navigator === "undefined")
			return false;
		if (navigator.doNotTrack === "1") return false;
		try {
			const now = Date.now();
			if (!sessionId || now - lastActivity > SESSION_TIMEOUT)
				sessionId = globalThis.crypto.randomUUID();
			lastActivity = now;
			const body = JSON.stringify({ ...data, sessionId });
			if (
				options.credentials === undefined &&
				navigator.sendBeacon?.(
					`${endpoint}/${kind}`,
					new Blob([body], { type: "application/json" }),
				)
			)
				return true;
			const response = await fetch(`${endpoint}/${kind}`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body,
				keepalive: true,
				credentials: options.credentials ?? "omit",
			});
			return response.ok;
		} catch {
			// Tracking must not interrupt navigation or the action being measured.
			return false;
		}
	}

	function pathname(path?: string): string {
		return new URL(path || window.location.href, window.location.origin)
			.pathname;
	}

	return {
		async pageView(path) {
			if (typeof window === "undefined") return false;
			let cleanPath: string;
			let referrer: string;
			try {
				cleanPath = pathname(path);
				const referrerOrigin = document.referrer
					? new URL(document.referrer).origin
					: "";
				referrer =
					referrerOrigin === window.location.origin ? "" : referrerOrigin;
			} catch {
				return false;
			}
			const now = Date.now();
			// Nested route boundaries and React Strict Mode can report the same render.
			if (lastView?.path === cleanPath && now - lastView.at < 1000)
				return false;
			lastView = { path: cleanPath, at: now };
			return send("pageviews", { path: cleanPath, referrer });
		},
		async track(name, properties) {
			if (typeof window === "undefined") return false;
			return send("events", { name, path: pathname(), properties });
		},
	};
}

let defaultTracker: AnalyticsTracker | undefined;
const configuredTrackers = new Map<string, AnalyticsTracker>();

/** @internal Bind the browser's default track() helper to the resolved API endpoint. */
export function setDefaultAnalyticsTracker(tracker: AnalyticsTracker): void {
	if (typeof window !== "undefined") defaultTracker = tracker;
}

/** Track a custom event using the analytics plugin, or an explicit standalone endpoint. */
export function track(
	name: string,
	properties?: Record<string, string | number | boolean | null>,
	options?: AnalyticsTrackerOptions,
): Promise<boolean> {
	if (options) {
		const key = JSON.stringify([
			options.apiBaseURL,
			options.apiBasePath,
			options.credentials,
		]);
		let tracker = configuredTrackers.get(key);
		if (!tracker) {
			tracker = createAnalyticsTracker(options);
			configuredTrackers.set(key, tracker);
		}
		return tracker.track(name, properties);
	}
	defaultTracker ??= createAnalyticsTracker();
	return defaultTracker.track(name, properties);
}
