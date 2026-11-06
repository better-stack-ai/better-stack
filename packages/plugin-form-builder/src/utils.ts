import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import slug from "slug";

/**
 * Converts text to a URL-friendly slug
 */
export function slugify(text: string, locale: string = "en"): string {
	return slug(text, { lower: true, locale });
}

/**
 * Merges class names using clsx and tailwind-merge
 */
export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

/**
 * Safely parses JSON with a fallback
 */
export function safeJsonParse<T>(json: string, fallback: T): T {
	try {
		return JSON.parse(json) as T;
	} catch {
		return fallback;
	}
}

/**
 * Extracts client IP address from request headers
 * Handles common proxy headers
 */
export function extractIpAddress(headers?: Headers): string | undefined {
	if (!headers) return undefined;

	// Check common proxy headers in order of preference
	const forwardedFor = headers.get("x-forwarded-for");
	if (forwardedFor) {
		// x-forwarded-for can contain multiple IPs, take the first one
		return forwardedFor.split(",")[0]?.trim();
	}

	const realIp = headers.get("x-real-ip");
	if (realIp) {
		return realIp.trim();
	}

	const cfConnectingIp = headers.get("cf-connecting-ip");
	if (cfConnectingIp) {
		return cfConnectingIp.trim();
	}

	return undefined;
}

/**
 * Extracts user agent from request headers
 */
export function extractUserAgent(headers?: Headers): string | undefined {
	if (!headers) return undefined;
	return headers.get("user-agent") || undefined;
}
