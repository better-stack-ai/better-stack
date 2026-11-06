import { QueryClient } from "@tanstack/react-query";
import { createClientStack } from "@btst/stack/client";
import {
	createApiClient,
	SSR_LOADER_ERROR_MESSAGE,
} from "@btst/stack/plugins/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { helpdeskClientPlugin } from "../client";
import { createHelpdeskQueryKeys } from "../query-keys";

const api = { baseURL: "https://support.example.test", basePath: "/api" };
const site = { baseURL: "https://support.example.test", basePath: "/pages" };
afterEach(() => vi.restoreAllMocks());

describe("Helpdesk protected client data", () => {
	it("keeps customer, agent and identity-specific conversations in separate caches", () => {
		const keys = createHelpdeskQueryKeys(vi.fn());
		const alice = { id: "alice" };
		const bob = { id: "bob" };
		const queries = new QueryClient();
		queries.setQueryData(
			keys.helpdeskAgentTickets.detail("ticket", alice).queryKey,
			{ messages: [{ body: "Internal note" }] },
		);
		expect(
			queries.getQueryData(
				keys.helpdeskCustomerTickets.detail("ticket", alice).queryKey,
			),
		).toBeUndefined();
		queries.setQueryData(
			keys.helpdeskCustomerTickets.detail("ticket", alice).queryKey,
			{ subject: "Alice's ticket" },
		);
		expect(
			queries.getQueryData(
				keys.helpdeskCustomerTickets.detail("ticket", bob).queryKey,
			),
		).toBeUndefined();
		expect(
			queries.getQueryData(
				keys.helpdeskAgentTickets.detail("ticket", bob).queryKey,
			),
		).toBeUndefined();
		queries.clear();
	});
	it("prefetches the matching agent identity and canned-reply page using request headers", async () => {
		const requests: Request[] = [];
		vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
			const request = new Request(input, init);
			requests.push(request);
			return new Response(
				JSON.stringify(
					request.url.includes("canned-replies")
						? { items: [], total: 26 }
						: { id: "ticket", messages: [] },
				),
				{ headers: { "content-type": "application/json" } },
			);
		});
		const identity = { id: "support" };
		const queryClient = new QueryClient();
		const stack = createClientStack({
			api: { ...api, headers: { cookie: "session=support" } },
			site,
			queryClient,
			plugins: {
				helpdesk: helpdeskClientPlugin({ identityPartition: identity }),
			},
		});
		await stack.router.getRoute("/helpdesk/inbox/ticket")?.loader?.();
		const keys = createHelpdeskQueryKeys(createApiClient(api));
		expect(
			queryClient.getQueryData(
				keys.helpdeskAgentTickets.detail("ticket", identity).queryKey,
			),
		).toEqual({ id: "ticket", messages: [] });
		expect(
			queryClient.getQueryData(
				keys.helpdeskCannedReplies.list({ limit: 25, offset: 0 }, identity)
					.queryKey,
			),
		).toEqual({ items: [], total: 26 });
		expect(requests).toHaveLength(2);
		expect(
			requests.every(
				(request) => request.headers.get("cookie") === "session=support",
			),
		).toBe(true);
		const canned = requests.find((request) =>
			request.url.includes("canned-replies"),
		);
		expect(new URL(canned!.url).searchParams.get("limit")).toBe("25");
		await keys.helpdeskCannedReplies
			.list({ limit: 25, offset: 25 }, identity)
			.queryFn();
		expect(new URL(requests.at(-1)!.url).searchParams.get("offset")).toBe("25");
		queryClient.clear();
	});
	it("keeps loader failures in the cache without serializing private hook errors", async () => {
		const queryClient = new QueryClient();
		const identity = { id: "alice" };
		const onErrorLoad = vi.fn();
		const stack = createClientStack({
			api,
			site,
			queryClient,
			plugins: {
				helpdesk: helpdeskClientPlugin({
					identityPartition: identity,
					hooks: {
						beforeLoad: () => {
							throw new Error("private server detail");
						},
						onErrorLoad,
					},
				}),
			},
		});
		await expect(
			stack.router.getRoute("/helpdesk")?.loader?.(),
		).resolves.toBeUndefined();
		const keys = createHelpdeskQueryKeys(vi.fn());
		const state = queryClient.getQueryState(
			keys.helpdeskCustomerTickets.list({ limit: 25, offset: 0 }, identity)
				.queryKey,
		);
		expect(state?.status).toBe("error");
		expect(state?.error?.message).toBe(SSR_LOADER_ERROR_MESSAGE);
		expect(onErrorLoad).toHaveBeenCalledOnce();
		queryClient.clear();
	});
});
