import type { AffiliateOptions, ReferralClick } from "./types";

export const AFFILIATE_COOKIE_NAME = "btst_affiliate";

/** Only local absolute paths are accepted; URL parsing also catches encoded authority paths. */
export function safeLandingPath(value = "/"): string {
	let decoded: string;
	try {
		decoded = decodeURIComponent(value);
	} catch {
		throw new Error("Invalid landing path");
	}
	if (
		!decoded.startsWith("/") ||
		decoded.startsWith("//") ||
		/[\\\u0000-\u0020\u007f]/.test(decoded)
	) {
		throw new Error("Landing path must be a local absolute path");
	}
	const parsed = new URL(value, "https://affiliate.invalid");
	if (
		parsed.origin !== "https://affiliate.invalid" ||
		parsed.pathname.startsWith("//") ||
		decodeURIComponent(parsed.pathname).startsWith("//")
	)
		throw new Error("Invalid landing path");
	return parsed.pathname + parsed.search + parsed.hash;
}

export function referralCodeFromURL(
	url: string | URL,
	parameters = ["ref", "affiliate"],
): string | null {
	const parsed =
		typeof url === "string" ? new URL(url, "https://affiliate.invalid") : url;
	for (const name of parameters) {
		const value = parsed.searchParams.get(name);
		if (value) return value;
	}
	return null;
}

export function isClickWithinWindow(
	click: Pick<ReferralClick, "createdAt">,
	days = 30,
	now = new Date(),
): boolean {
	const age = now.getTime() - new Date(click.createdAt).getTime();
	return Number.isFinite(age) && age >= 0 && age < days * 86400000;
}

/** The caller must load the previous opaque cookie click ID from the database first. */
export function selectAttributionClick(
	previous: ReferralClick | null,
	current: ReferralClick,
	options: AffiliateOptions = {},
): ReferralClick {
	return options.attributionMode === "first_touch" &&
		previous &&
		isClickWithinWindow(previous, options.attributionWindowDays)
		? previous
		: current;
}

export function createReferralLink(
	baseURL: string,
	code: string,
	landingPath = "/",
): string {
	const base = new URL(baseURL);
	if (!["https:", "http:"].includes(base.protocol))
		throw new Error("Referral links require HTTP or HTTPS");
	const url = new URL(safeLandingPath(landingPath), base.origin);
	url.searchParams.set("ref", code);
	return url.href;
}

/** Checkout helpers resolve query codes or opaque click IDs; timestamps always come from the database. */
export function attributionFromRequest(
	request: Request,
): { code?: string; clickId?: string } | undefined {
	const code = referralCodeFromURL(request.url);
	if (code) return { code };
	for (const cookie of (request.headers.get("cookie") ?? "").split(";")) {
		const separator = cookie.indexOf("=");
		if (
			separator < 0 ||
			cookie.slice(0, separator).trim() !== AFFILIATE_COOKIE_NAME
		)
			continue;
		try {
			const clickId = decodeURIComponent(cookie.slice(separator + 1).trim());
			return clickId ? { clickId } : undefined;
		} catch {
			return undefined;
		}
	}
	return undefined;
}

export function createTrackingLink(
	apiBaseURL: string,
	code: string,
	landingPath = "/",
): string {
	if (
		!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(code) ||
		code.length < 3 ||
		code.length > 64
	)
		throw new Error("Invalid affiliate code");
	const base = new URL(apiBaseURL);
	if (!["http:", "https:"].includes(base.protocol))
		throw new Error("Tracking links require HTTP or HTTPS");
	const url = new URL(
		`${base.pathname.replace(/\/$/, "")}/affiliate/track/${encodeURIComponent(code)}`,
		base.origin,
	);
	url.searchParams.set("to", safeLandingPath(landingPath));
	return url.href;
}

/** Redirect query-param referrals through tracking once, then return to the landing page without referral params. */
export function getReferralRedirect(
	value: string | URL,
	apiBaseURL: string,
): string | null {
	const url = new URL(value);
	const code = referralCodeFromURL(url);
	if (!code) return null;
	url.searchParams.delete("ref");
	url.searchParams.delete("affiliate");
	return createTrackingLink(
		apiBaseURL,
		code,
		url.pathname + url.search + url.hash,
	);
}
