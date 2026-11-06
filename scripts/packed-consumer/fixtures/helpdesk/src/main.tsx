import { helpdeskClientPlugin } from "@btst/plugin-helpdesk/client";
import { PortalPageComponent } from "@btst/plugin-helpdesk/client/components";
import { helpdeskPermissions } from "@btst/plugin-helpdesk/permissions";
import type { CustomerTicket } from "@btst/plugin-helpdesk/types";
import "@btst/plugin-helpdesk/css";
import { createClientStack } from "@btst/stack/client";
import { StackProvider } from "@btst/stack/context";
import { defineAuthorization } from "@btst/stack/authorization";
import { createClientAuth } from "@btst/stack/authorization/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import { z } from "zod";

const ticket: CustomerTicket = {
	id: "packed-ticket",
	subject: "Packed support request",
	status: "open",
	priority: "high",
	resolvedAt: null,
	createdAt: "2026-01-01T00:00:00.000Z",
	updatedAt: "2026-01-01T00:00:00.000Z",
};
globalThis.fetch = async (input, init) => {
	const request =
		input instanceof Request ? input : new Request(String(input), init);
	const url = new URL(request.url);
	if (url.pathname === "/api/helpdesk/tickets" && request.method === "GET")
		return Response.json({ items: [ticket], total: 1 });
	throw new Error(
		`Unexpected Helpdesk browser request: ${request.method} ${url}`,
	);
};
const identity = { id: "customer" };
const queryClient = new QueryClient({
	defaultOptions: { queries: { retry: false } },
});
const stack = createClientStack({
	api: { baseURL: "https://example.test", basePath: "/api" },
	site: { baseURL: "https://example.test", basePath: "/pages" },
	queryClient,
	plugins: { helpdesk: helpdeskClientPlugin({ identityPartition: identity }) },
});
const authorization = defineAuthorization({
	identity: z.object({ id: z.string() }),
	permissions: [helpdeskPermissions],
	rules: ({ helpdesk }) => [
		helpdesk.customerTicket.list.allow(),
		helpdesk.customerTicket.create.allow(),
	],
});
const root = document.getElementById("root");
if (!root) throw new Error("Missing root");
createRoot(root).render(
	<QueryClientProvider client={queryClient}>
		<StackProvider
			stack={stack}
			auth={createClientAuth({ authorization, getIdentity: () => identity })}
			initialIdentity={identity}
		>
			<PortalPageComponent />
		</StackProvider>
	</QueryClientProvider>,
);
