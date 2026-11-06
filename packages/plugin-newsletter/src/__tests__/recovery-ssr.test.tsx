import { renderToString } from "react-dom/server";
import { QueryClient } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { createClientStack } from "@btst/stack/client";
import { StackProvider } from "@btst/stack/context";
import { createApiClient } from "@btst/stack/plugins/client";
import { CampaignRecovery } from "../client/components/campaign-recovery";
import { newsletterClientPlugin } from "../client/plugin";
import { createNewsletterQueryKeys } from "../query-keys";

afterEach(() => vi.unstubAllGlobals());

it("renders recovery during SSR without unauthenticated transport and preserves its identity cache partition", () => {
	const fetch = vi.fn(async () =>
		Response.json({ message: "Authentication required" }, { status: 401 }),
	);
	vi.stubGlobal("fetch", fetch);
	const identity = { id: "manager" };
	const queryClient = new QueryClient();
	const api = { baseURL: "https://example.test", basePath: "/api/data" };
	const stack = createClientStack({
		api,
		site: { baseURL: "https://example.test", basePath: "/pages" },
		queryClient,
		plugins: { newsletter: newsletterClientPlugin() },
	});
	try {
		const html = renderToString(
			<StackProvider
				stack={stack}
				initialIdentity={identity}
				auth={{
					mode: "one-rule",
					contract: { parseIdentity: () => identity },
					getIdentity: () => identity,
					usePermission: () => ({ can: true, isPending: false }),
				}}
			>
				<CampaignRecovery id="campaign-1" status="sending" />
			</StackProvider>,
		);
		expect(html).toContain("Loading delivery recovery");
		expect(fetch).not.toHaveBeenCalled();
		const expected = createNewsletterQueryKeys(
			createApiClient(api),
		).newsletterCampaigns.recovery("campaign-1", identity);
		expect(queryClient.getQueryState(expected.queryKey)?.fetchStatus).toBe(
			"idle",
		);
	} finally {
		queryClient.clear();
	}
});
