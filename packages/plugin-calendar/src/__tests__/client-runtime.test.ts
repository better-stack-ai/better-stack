import { QueryClient } from "@tanstack/react-query";
import { createClientStack } from "@btst/stack/client";
import { createApiClient } from "@btst/stack/plugins/client";
import { afterEach, expect, it, vi } from "vitest";
import { calendarClientPlugin } from "../client/plugin";
import { createCalendarQueryKeys } from "../query-keys";

afterEach(() => vi.restoreAllMocks());

it("prefetches the dashboard waitlist using the request identity and credentials", async () => {
	const api = {
		baseURL: "https://calendar.example.test",
		basePath: "/api/data",
	};
	const identity = { id: "host" };
	const entries = [
		{ id: "waiting-entry", eventName: "Group workshop", status: "waiting" },
	];
	const requests: Request[] = [];
	vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
		const request = new Request(input, init);
		requests.push(request);
		return new Response(
			JSON.stringify(request.url.endsWith("/waitlist") ? entries : []),
			{
				headers: { "content-type": "application/json" },
			},
		);
	});
	const queryClient = new QueryClient();
	try {
		const stack = createClientStack({
			api: { ...api, headers: { cookie: "session=host" } },
			site: { baseURL: api.baseURL, basePath: "/pages" },
			queryClient,
			plugins: {
				calendar: calendarClientPlugin({ identityPartition: identity }),
			},
		});
		await stack.router.getRoute("/calendar")?.loader?.();
		const keys = createCalendarQueryKeys(createApiClient(api));
		expect(
			queryClient.getQueryData(keys.calendarWaitlist.list(identity).queryKey),
		).toEqual(entries);
		expect(
			queryClient.getQueryData(keys.calendarWaitlist.list().queryKey),
		).toBeUndefined();
		const waitlistRequests = requests.filter((request) =>
			request.url.endsWith("/waitlist"),
		);
		expect(waitlistRequests).toHaveLength(1);
		expect(waitlistRequests[0]?.headers.get("cookie")).toBe("session=host");
	} finally {
		queryClient.clear();
	}
});
