import { featureFlagsClientPlugin } from "@btst/plugin-feature-flags/client";
import {
	FlagsPageComponent,
	EditFlagPageComponent,
} from "@btst/plugin-feature-flags/client/components";
import { useFlag } from "@btst/plugin-feature-flags/client/hooks";
import { featureFlagsPermissions } from "@btst/plugin-feature-flags/permissions";
import { evaluateFlag } from "@btst/plugin-feature-flags/evaluate";
import type { FeatureFlag } from "@btst/plugin-feature-flags/types";
import "@btst/plugin-feature-flags/css";
import { createClientStack } from "@btst/stack/client";
import { StackProvider } from "@btst/stack/context";
import { defineAuthorization } from "@btst/stack/authorization";
import { createClientAuth } from "@btst/stack/authorization/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import { z } from "zod";
const definitions: FeatureFlag[] = [
	{
		id: "v5-flag",
		key: "checkout",
		name: "Existing checkout",
		description: "Preserved record",
		type: "boolean",
		enabled: true,
		rolloutPct: null,
		segments: [],
		variants: [],
		tags: ["beta"],
		archivedAt: null,
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z",
	},
];
const requests: unknown[] = [];
Object.assign(window, {
	packedFlagRequests: requests,
	packedFlagDefinitions: definitions,
	packedFlagNavigations: [],
});
globalThis.fetch = async (input, init) => {
	const request =
		input instanceof Request ? input : new Request(String(input), init);
	const url = new URL(request.url);
	const body = request.method !== "GET" ? await request.json() : undefined;
	requests.push({
		url: url.href,
		method: request.method,
		headers: Object.fromEntries(request.headers),
		credentials: request.credentials,
		body,
	});
	const prefix = "/api/feature-flags/";
	const path = url.pathname.slice(prefix.length);
	if (!url.pathname.startsWith(prefix))
		throw new Error(`Unexpected request ${url}`);
	if (path.startsWith("evaluate/")) {
		const context = JSON.parse(
			new TextDecoder().decode(
				Uint8Array.from(atob(url.searchParams.get("context") ?? "e30="), (c) =>
					c.charCodeAt(0),
				),
			),
		);
		return Response.json(
			evaluateFlag(definitions.find((f) => f.key === path.slice(9))!, context),
		);
	}
	if (path.endsWith("/toggle")) {
		const key = path.split("/")[1];
		const flag = definitions.find((f) => f.key === key)!;
		flag.enabled = body.enabled;
		return Response.json({ ...flag });
	}
	if (path === "flags" && request.method === "POST") {
		const flag = {
			...body,
			id: "new-flag",
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
			archivedAt: null,
		};
		definitions.push(flag);
		return Response.json(flag);
	}
	if (path === "flags")
		return Response.json(definitions.map((f) => ({ ...f })));
	throw new Error(`Unexpected flag request ${path}`);
};
const queryClient = new QueryClient({
	defaultOptions: { queries: { retry: false } },
});
const stack = createClientStack({
	api: { baseURL: "https://site.test", basePath: "/api" },
	site: { baseURL: "https://site.test", basePath: "/pages" },
	queryClient,
	plugins: { featureFlags: featureFlagsClientPlugin() },
	endpoints: {
		featureFlags: {
			api: {
				baseURL: "https://site.test",
				basePath: "/api",
				browserHeaders: { "x-public-client": "flag-fixture" },
				credentials: "include",
			},
		},
	},
});
const authorization = defineAuthorization({
	identity: z.object({ id: z.string() }),
	permissions: [featureFlagsPermissions],
	rules: ({ featureFlags: f }) => [
		f.flags.read.allow(),
		f.flags.create.allow(),
		f.flags.update.allow(),
		f.flags.toggle.allow(),
		f.flags.archive.allow(),
		f.evaluations.read.allow(),
	],
});
const identity = { id: "admin" };
function Value() {
	const result = useFlag("checkout", { userId: "Zoë", tags: ["bêta"] });
	return (
		<output data-testid="flag-value">
			{result.data === undefined ? "pending" : String(result.data)}
		</output>
	);
}
createRoot(document.getElementById("root")!).render(
	<QueryClientProvider client={queryClient}>
		<StackProvider
			stack={stack}
			router={{
				navigate: (path) => {
					(
						window as unknown as { packedFlagNavigations: string[] }
					).packedFlagNavigations.push(path);
				},
			}}
			auth={createClientAuth({ authorization, getIdentity: () => identity })}
			initialIdentity={identity}
		>
			<Value />
			<FlagsPageComponent />
			<EditFlagPageComponent />
		</StackProvider>
	</QueryClientProvider>,
);
