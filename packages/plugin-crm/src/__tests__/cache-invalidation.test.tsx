// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createClientStack } from "@btst/stack/client";
import { StackProvider } from "@btst/stack/context";
import { defineClientPlugin } from "@btst/stack/plugins/client";
import { createResource } from "@btst/stack/plugins/client/hooks";
import { createCrmQueryKeys, crmResources } from "../query-keys";

(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
const crm = createResource({ plugin: "crm", resources: crmResources });
const keys = createCrmQueryKeys(vi.fn());
const cachedQueries = {
	contacts: keys.crmContacts.list({}).queryKey,
	contact: keys.crmContacts.detail("contact").queryKey,
	contactDuplicates: keys.crmContacts.duplicates("contact").queryKey,
	companies: keys.crmCompanies.list({}).queryKey,
	company: keys.crmCompanies.detail("company").queryKey,
	companyDuplicates: keys.crmCompanies.duplicates("company").queryKey,
	deals: keys.crmDeals.list({}).queryKey,
	deal: keys.crmDeals.detail("deal").queryKey,
	activities: keys.crmActivities.list({ dealId: "deal" }).queryKey,
	pipelines: keys.crmPipelines.list({}).queryKey,
	pipeline: keys.crmPipelines.detail("pipeline").queryKey,
};
type CachedQuery = keyof typeof cachedQueries;

describe("CRM dependent cache invalidation", () => {
	let root: Root;
	let container: HTMLDivElement;
	let queryClient: QueryClient;
	beforeEach(() => {
		queryClient = new QueryClient();
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		vi.spyOn(globalThis, "fetch").mockImplementation(
			async () =>
				new Response(JSON.stringify({ success: true }), {
					headers: { "content-type": "application/json" },
				}),
		);
		for (const key of Object.values(cachedQueries))
			queryClient.setQueryData(key, { id: "linked-record" });
	});
	afterEach(async () => {
		await act(async () => root.unmount());
		container.remove();
		queryClient.clear();
		vi.restoreAllMocks();
	});
	async function mutate(
		useMutation: () => { mutateAsync: (input: string) => Promise<unknown> },
	) {
		const stack = createClientStack({
			api: { baseURL: "https://example.test", basePath: "/api/data" },
			site: { baseURL: "https://example.test", basePath: "/pages" },
			queryClient,
			plugins: {
				crm: defineClientPlugin({
					id: "crm",
					resolve: () => ({ routes: () => ({}) }),
				}),
			},
		});
		let mutation!: ReturnType<typeof useMutation>;
		function Probe() {
			mutation = useMutation();
			return null;
		}
		await act(async () =>
			root.render(
				<StackProvider stack={stack} router={{}}>
					<Probe />
				</StackProvider>,
			),
		);
		await act(async () => {
			await mutation.mutateAsync("deleted-record");
		});
	}
	it.each<{
		resource: "crmCompanies" | "crmContacts" | "crmDeals";
		stale: CachedQuery[];
	}>([
		{
			resource: "crmCompanies",
			stale: [
				"companies",
				"company",
				"companyDuplicates",
				"contacts",
				"contact",
				"contactDuplicates",
				"deals",
				"deal",
				"pipelines",
				"pipeline",
			],
		},
		{
			resource: "crmContacts",
			stale: [
				"contacts",
				"contact",
				"contactDuplicates",
				"deals",
				"deal",
				"activities",
				"pipelines",
				"pipeline",
			],
		},
		{
			resource: "crmDeals",
			stale: ["deals", "deal", "activities", "pipelines", "pipeline"],
		},
	])(
		"refreshes dependent cached records after deleting $resource",
		async ({ resource, stale }) => {
			await mutate(() => crm[resource].delete.use());
			for (const [name, key] of Object.entries(cachedQueries))
				expect(queryClient.getQueryState(key)?.isInvalidated, name).toBe(
					stale.includes(name as CachedQuery),
				);
		},
	);
	it.each(["crmContacts", "crmCompanies"] as const)(
		"refreshes linked records and suggestions after merging %s",
		async (resource) => {
			await mutate(() => {
				const mutation = crm[resource].merge.use();
				return {
					mutateAsync: (id: string) =>
						mutation.mutateAsync({
							survivorId: "survivor",
							sourceId: id,
							versions: {
								survivor: "survivor-version",
								source: "source-version",
							},
							choices: { phone: "source" },
						}),
				};
			});
			for (const [name, key] of Object.entries(cachedQueries))
				expect(queryClient.getQueryState(key)?.isInvalidated, name).toBe(true);
		},
	);

	it("refreshes contact search membership when a linked company is renamed", async () => {
		await mutate(() => {
			const mutation = crm.crmCompanies.update.use();
			return {
				mutateAsync: (id: string) =>
					mutation.mutateAsync({ id, data: { name: "Renamed company" } }),
			};
		});
		expect(
			queryClient.getQueryState(cachedQueries.contacts)?.isInvalidated,
		).toBe(true);
		expect(
			queryClient.getQueryState(cachedQueries.contact)?.isInvalidated,
		).toBe(false);
		expect(
			queryClient.getQueryState(cachedQueries.activities)?.isInvalidated,
		).toBe(false);
	});
});
