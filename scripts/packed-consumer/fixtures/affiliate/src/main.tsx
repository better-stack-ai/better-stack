import { affiliateClientPlugin } from "@btst/plugin-affiliate/client";
import { AffiliateApplyPageComponent } from "@btst/plugin-affiliate/client/components";
import { affiliatePermissions } from "@btst/plugin-affiliate/permissions";
import { createAffiliateQueryKeys } from "@btst/plugin-affiliate/query-keys";
import type { Affiliate, AffiliatePortal } from "@btst/plugin-affiliate/types";
import type { useAffiliates } from "@btst/plugin-affiliate/client/hooks";
import "@btst/plugin-affiliate/css";
import { createClientStack } from "@btst/stack/client";
import { StackProvider } from "@btst/stack/context";
import { defineAuthorization } from "@btst/stack/authorization";
import { createClientAuth } from "@btst/stack/authorization/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import { z } from "zod";
export type { Affiliate, AffiliatePortal, useAffiliates };
export { createAffiliateQueryKeys };
globalThis.fetch = async (input, init) => {
	if (!new URL(String(input)).pathname.endsWith("/affiliate/apply"))
		throw new Error(`Unexpected Affiliate request ${input}`);
	const body = JSON.parse(String(init?.body));
	localStorage.setItem("packed-affiliate-application", JSON.stringify(body));
	return Response.json({
		...body,
		id: "application",
		userId: "jane",
		status: "pending",
	});
};
const queryClient = new QueryClient({
	defaultOptions: { queries: { retry: false } },
});
const stack = createClientStack({
	api: { baseURL: "https://example.test", basePath: "/api" },
	site: { baseURL: "https://example.test", basePath: "/pages" },
	queryClient,
	plugins: { affiliate: affiliateClientPlugin() },
});
const authorization = defineAuthorization({
	identity: z.object({ id: z.string(), name: z.string(), email: z.string() }),
	permissions: [affiliatePermissions],
	rules: ({ affiliate }) => [affiliate.application.create.allow()],
});
const identity = { id: "jane", name: "Jane", email: "jane@example.test" };
const root = document.getElementById("root");
if (!root) throw new Error("Missing root");
createRoot(root).render(
	<QueryClientProvider client={queryClient}>
		<StackProvider
			stack={stack}
			router={{ navigate: () => undefined }}
			auth={createClientAuth({ authorization, getIdentity: () => identity })}
			initialIdentity={identity}
		>
			<AffiliateApplyPageComponent />
		</StackProvider>
	</QueryClientProvider>,
);
