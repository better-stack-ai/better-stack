import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createClientStack } from "@btst/stack/client";
import { crmClientPlugin } from "../client/plugin";
import { createCrmQueryKeys } from "../query-keys";

const identity = { id: "staff-1" };
const owners = {
	items: [{ id: "staff-1", name: "Sales owner" }],
	currentUserId: "staff-1",
};
const keys = createCrmQueryKeys(vi.fn());
afterEach(() => vi.restoreAllMocks());

function setup(directoryStatus = 200) {
	const queryClient = new QueryClient();
	const onErrorLoad = vi.fn();
	const requests: Array<{ path: string; cookie: string | null }> = [];
	vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
		const request = input instanceof Request ? input : new Request(input, init);
		const path = new URL(request.url).pathname;
		requests.push({ path, cookie: request.headers.get("cookie") });
		const isDirectory = path.endsWith("/owners");
		const body = isDirectory
			? directoryStatus === 200
				? owners
				: { message: "Forbidden" }
			: path.endsWith("/deals/deal-1")
				? { id: "deal-1", pipelineId: "pipeline-1" }
				: { id: "record-1", items: [], total: 0 };
		return new Response(JSON.stringify(body), {
			status: isDirectory ? directoryStatus : 200,
			headers: { "content-type": "application/json" },
		});
	});
	const stack = createClientStack({
		api: {
			baseURL: "https://app.example.com",
			basePath: "/api/data",
			headers: { cookie: "session=staff-1" },
		},
		site: { baseURL: "https://app.example.com", basePath: "/pages" },
		queryClient,
		plugins: {
			crm: crmClientPlugin({
				identityPartition: identity,
				hooks: { onErrorLoad },
			}),
		},
	});
	return { stack, queryClient, requests, onErrorLoad };
}

describe("CRM ownership request loaders", () => {
	it.each([
		"/crm/contacts/contact-1",
		"/crm/pipeline/pipeline-1",
		"/crm/deals/deal-1",
	])("seeds the directory with request credentials for %s", async (path) => {
		const { stack, queryClient, requests, onErrorLoad } = setup();
		await stack.router.getRoute(path)?.loader?.();
		expect(
			queryClient.getQueryData(keys.crmOwners.list(identity).queryKey),
		).toEqual(owners);
		expect(
			requests.find((request) => request.path.endsWith("/owners"))?.cookie,
		).toBe("session=staff-1");
		expect(onErrorLoad).not.toHaveBeenCalled();
	});

	it("keeps authorized deal loading successful when the optional staff directory is denied", async () => {
		const { stack, queryClient, onErrorLoad } = setup(403);
		await stack.router.getRoute("/crm/deals/deal-1")?.loader?.();
		expect(
			queryClient.getQueryData(
				keys.crmDeals.detail("deal-1", identity).queryKey,
			),
		).toMatchObject({ id: "deal-1" });
		expect(
			queryClient.getQueryState(keys.crmOwners.list(identity).queryKey)?.status,
		).toBe("error");
		expect(onErrorLoad).not.toHaveBeenCalled();
	});

	it("uses the prefetched pipeline key for the default all-owners filter", async () => {
		const { stack, queryClient } = setup();
		await stack.router.getRoute("/crm/pipeline/pipeline-1")?.loader?.();
		expect(
			keys.crmPipelines.detail("pipeline-1", identity, {}).queryKey,
		).toEqual(keys.crmPipelines.detail("pipeline-1", identity).queryKey);
		expect(
			queryClient.getQueryData(
				keys.crmPipelines.detail("pipeline-1", identity, {}).queryKey,
			),
		).toBeDefined();
		expect(
			keys.crmPipelines.detail("pipeline-1", identity, { owner: "current" })
				.queryKey,
		).not.toEqual(keys.crmPipelines.detail("pipeline-1", identity).queryKey);
	});
});
