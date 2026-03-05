import { createStackClient } from "@btst/stack/client";
import { cmsClientPlugin } from "@btst/stack/plugins/cms/client";
import { routeDocsClientPlugin } from "@btst/stack/plugins/route-docs/client";
import { QueryClient } from "@tanstack/react-query";

const getBaseURL = (headers?: Headers) => {
	if (typeof window !== "undefined") return window.location.origin;
	if (headers) {
		const host = headers.get("host");
		const proto = headers.get("x-forwarded-proto") ?? "http";
		if (host) return `${proto}://${host}`;
	}
	return process.env.BASE_URL ?? "http://localhost:3000";
};

export const getStackClient = (
	queryClient: QueryClient,
	opts?: { headers?: Headers },
) => {
	const baseURL = getBaseURL(opts?.headers);
	return createStackClient({
		plugins: {
			cms: cmsClientPlugin({
				queryClient,
				apiBaseURL: baseURL,
				apiBasePath: "/api/data",
				siteBaseURL: baseURL,
				siteBasePath: "/pages",
			}),
			routeDocs: routeDocsClientPlugin({
				queryClient,
				title: "Route Documentation",
				description: "All client routes in this demo",
				siteBasePath: "/pages",
			}),
		},
	});
};
