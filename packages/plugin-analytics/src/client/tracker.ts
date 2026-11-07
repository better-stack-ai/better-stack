/** Transport configuration for tracking outside a resolved BTST client stack. */
export interface AnalyticsTrackerOptions {
	/** API origin; omitted for same-origin collection. */
	apiBaseURL?: string;
	/** API mount path, matching createBackendStack(). Defaults to /api/data. */
	apiBasePath?: string;
	/** Explicit Fetch credentials policy. Uses Fetch instead of a beacon when set. */
	credentials?: RequestCredentials;
	/** Explicit browser-safe headers. Nonempty headers require Fetch instead of a beacon. */
	headers?: HeadersInit;
}

/** Cookie-free tracker with a session identifier held only in memory. */
export interface AnalyticsTracker {
	/** Anonymous, in-memory assignment key shared with exposure and conversion. Undefined during SSR or with Do Not Track. */
	getSessionId(): string | undefined;
	/** Record a page view, excluding query strings and fragments. */
	pageView(path?: string): Promise<boolean>;
	/** Record meaningful experiment exposure using the same anonymous session as track(). */
	expose(
		experimentKey: string,
		expectedConfigurationVersion: string,
		path?: string,
	): Promise<boolean>;
	/** Record a custom event. Properties should never contain personal data. Supply a safe source pathname to override the current URL; query strings and fragments are removed. */
	track(
		name: string,
		properties?: Record<string, string | number | boolean | null>,
		path?: string,
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
	const collectionHeaders = new Headers(options.headers);
	const credentials = options.credentials;
	const basePath = (options.apiBasePath ?? "/api/data").replace(
		/^\/+|\/+$/g,
		"",
	);
	const endpoint = `${(options.apiBaseURL ?? "").replace(/\/+$/, "")}${basePath ? `/${basePath}` : ""}/analytics`;

	function getSessionId(): string | undefined {
		if (
			typeof window === "undefined" ||
			typeof navigator === "undefined" ||
			navigator.doNotTrack === "1"
		)
			return undefined;
		const now = Date.now();
		if (!sessionId || now - lastActivity > SESSION_TIMEOUT) {
			sessionId = Array.from(
				globalThis.crypto.getRandomValues(new Uint8Array(16)),
				(byte) => byte.toString(16).padStart(2, "0"),
			).join("");
			lastActivity = now;
		}
		return sessionId;
	}

	async function send(
		kind: "pageviews" | "events" | "exposures",
		data: Record<string, unknown>,
	): Promise<boolean> {
		try {
			const currentSessionId = getSessionId();
			if (!currentSessionId) return false;
			lastActivity = Date.now();
			const body = JSON.stringify({ ...data, sessionId: currentSessionId });
			const headers = new Headers(collectionHeaders);
			const hasCustomHeaders = !headers.keys().next().done;
			headers.set("Content-Type", "application/json");
			if (
				kind !== "exposures" &&
				credentials === undefined &&
				!hasCustomHeaders &&
				navigator.sendBeacon?.(
					`${endpoint}/${kind}`,
					new Blob([body], { type: "application/json" }),
				)
			)
				return true;
			const response = await fetch(`${endpoint}/${kind}`, {
				method: "POST",
				headers,
				body,
				keepalive: true,
				credentials: credentials ?? "omit",
			});
			if (!response.ok) return false;
			return kind === "exposures"
				? (await response.json()).accepted === true
				: true;
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
		getSessionId,
		async expose(experimentKey, expectedConfigurationVersion, path) {
			if (typeof window === "undefined") return false;
			try {
				return await send("exposures", {
					experimentKey,
					expectedConfigurationVersion,
					path: pathname(path),
				});
			} catch {
				return false;
			}
		},
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
		async track(name, properties, path) {
			if (typeof window === "undefined") return false;
			return send("events", { name, path: pathname(path), properties });
		},
	};
}

let defaultTracker: AnalyticsTracker | undefined;
const configuredTrackers = new Map<string, AnalyticsTracker>();

/** @internal Share browser sessions across equivalent client stack resolutions. */
export function getConfiguredAnalyticsTracker(
	options: AnalyticsTrackerOptions,
): AnalyticsTracker {
	if (typeof window === "undefined") return createAnalyticsTracker(options);
	const key = JSON.stringify([
		options.apiBaseURL,
		options.apiBasePath,
		options.credentials,
		[...new Headers(options.headers)],
	]);
	let tracker = configuredTrackers.get(key);
	if (!tracker) {
		tracker = createAnalyticsTracker(options);
		configuredTrackers.set(key, tracker);
	}
	return tracker;
}

/** @internal Bind the browser's default track() helper to the resolved API endpoint. */
export function setDefaultAnalyticsTracker(tracker: AnalyticsTracker): void {
	if (typeof window !== "undefined") defaultTracker = tracker;
}

/** @internal Resolve the configured browser tracker lazily for lifecycle callbacks. */
export function getDefaultAnalyticsTracker(): AnalyticsTracker {
	defaultTracker ??= createAnalyticsTracker();
	return defaultTracker;
}

/** Track a custom event using the analytics plugin, or an explicit standalone endpoint. */
export function track(
	name: string,
	properties?: Record<string, string | number | boolean | null>,
	options?: AnalyticsTrackerOptions,
): Promise<boolean> {
	if (options) {
		return getConfiguredAnalyticsTracker(options).track(name, properties);
	}
	return getDefaultAnalyticsTracker().track(name, properties);
}

/** Record exposure only after the experiment experience is shown, separately from flag evaluation. */
export function expose(
	experimentKey: string,
	expectedConfigurationVersion: string,
	options?: AnalyticsTrackerOptions,
): Promise<boolean> {
	return (
		options
			? getConfiguredAnalyticsTracker(options)
			: getDefaultAnalyticsTracker()
	).expose(experimentKey, expectedConfigurationVersion);
}

/** Use this permitted anonymous key for flag evaluation before showing and exposing an experience. */
export function getAnalyticsSessionId(): string | undefined {
	return getDefaultAnalyticsTracker().getSessionId();
}
