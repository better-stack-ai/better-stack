import {
	analyticsClientPlugin,
	createAnalyticsTracker,
} from "@btst/plugin-analytics/client";
import { AnalyticsDashboardPageComponent } from "@btst/plugin-analytics/client/components";
import { analyticsPermissions } from "@btst/plugin-analytics/permissions";
import "@btst/plugin-analytics/css";
import { createClientStack } from "@btst/stack/client";
import { StackProvider } from "@btst/stack/context";
import { defineAuthorization } from "@btst/stack/authorization";
import { createClientAuth } from "@btst/stack/authorization/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import { z } from "zod";

const requests: Array<{
	url: string;
	method: string;
	headers: Record<string, string>;
	credentials: RequestCredentials;
	body: unknown;
}> = [];
Object.assign(window, { packedAnalyticsRequests: requests });
globalThis.fetch = async (input, init) => {
	const request =
		input instanceof Request ? input : new Request(String(input), init);
	const url = new URL(request.url);
	const body = request.method === "POST" ? await request.json() : undefined;
	requests.push({
		url: url.href,
		method: request.method,
		headers: Object.fromEntries(request.headers),
		credentials: request.credentials,
		body,
	});
	if (request.method === "POST") return Response.json({ accepted: true });
	if (url.pathname.endsWith("/export"))
		return new Response("type,path\npageview,/existing", {
			headers: { "content-type": "text/csv" },
		});
	if (url.pathname.endsWith("/realtime")) return Response.json({ visitors: 3 });
	if (url.pathname.endsWith("/dashboard"))
		return Response.json({
			uniqueVisitors: 12,
			pageViews: url.searchParams.get("range") === "today" ? 7 : 42,
			bounceRate: 25,
			sessionDuration: 90,
			series: [{ date: "2026-11-01", pageViews: 42, visitors: 12 }],
			topPages: [{ path: "/existing", views: 42, visitors: 12, trend: [42] }],
			topReferrers: [{ referrer: "search.test", views: 10, visitors: 8 }],
			topEvents: [{ name: "existing_signup", count: 6 }],
		});
	throw new Error(`Unexpected analytics request ${request.method} ${url}`);
};
const queryClient = new QueryClient({
	defaultOptions: { queries: { retry: false } },
});
const stack = createClientStack({
	api: { baseURL: "https://site.test", basePath: "/api" },
	site: { baseURL: "https://site.test", basePath: "/pages" },
	queryClient,
	plugins: { analytics: analyticsClientPlugin({ tracking: false }) },
	endpoints: {
		analytics: {
			api: {
				baseURL: "https://site.test",
				basePath: "/api",
				browserHeaders: { "x-public-client": "analytics-fixture" },
				credentials: "include",
			},
		},
	},
});
const authorization = defineAuthorization({
	identity: z.object({ id: z.string() }),
	permissions: [analyticsPermissions],
	rules: ({ analytics }) => [
		analytics.dashboard.read.allow(),
		analytics.dashboard.export.allow(),
	],
});
const tracker = createAnalyticsTracker({
	apiBaseURL: "https://site.test",
	apiBasePath: "/api",
	headers: { "x-public-client": "analytics-fixture" },
	credentials: "include",
});
Object.assign(window, { packedAnalyticsTracker: tracker });
createRoot(document.getElementById("root")!).render(
	<QueryClientProvider client={queryClient}>
		<StackProvider
			stack={stack}
			router={{ navigate: () => undefined }}
			auth={createClientAuth({
				authorization,
				getIdentity: () => ({ id: "admin" }),
			})}
			initialIdentity={{ id: "admin" }}
		>
			<AnalyticsDashboardPageComponent />
		</StackProvider>
	</QueryClientProvider>,
);
