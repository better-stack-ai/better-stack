"use client";

import { Analytics, type BeforeSendEvent } from "@vercel/analytics/next";

function prepareEvent(event: BeforeSendEvent): BeforeSendEvent | null {
	const url = new URL(event.url);
	// The public proxy uses the main website's existing analytics project.
	// Exclude direct deployment/preview hosts, and never send URL parameters.
	if (url.origin !== "https://www.better-stack.ai") return null;
	url.pathname = "/playground";
	url.search = "";
	url.hash = "";
	return { ...event, url: url.toString() };
}

export function PlaygroundAnalytics() {
	return <Analytics beforeSend={prepareEvent} />;
}
