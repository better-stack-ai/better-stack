import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createClientStack } from "@btst/stack/client";
import { notificationsClientPlugin } from "../client/plugin";
import { createNotificationsQueryKeys } from "../query-keys";
import { createApiClient } from "@btst/stack/plugins/client";

afterEach(() => vi.restoreAllMocks());

function runtime(queryClient: QueryClient, hooks = {}) {
	return createClientStack({
		api: {
			baseURL: "https://app.test",
			basePath: "/api/data",
			headers: {
				cookie: "session=private",
				authorization: "Bearer server-token",
			},
		},
		site: { baseURL: "https://app.test", basePath: "/pages" },
		queryClient,
		plugins: {
			notifications: notificationsClientPlugin({
				identityPartition: { id: "alice" },
				hooks,
			}),
		},
		endpoints: { notifications: { api: { basePath: "/custom-api" } } },
	});
}

describe("notifications server route loaders", () => {
	it("prefetches inbox and preferences with request headers and browser-compatible identity keys", async () => {
		const seen: { url: URL; headers: Headers }[] = [];
		const inbox = { items: [], total: 0, unreadCount: 3 };
		const preferences = [{ category: "activity", inApp: true, email: false }];
		vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
			const url = new URL(input instanceof Request ? input.url : String(input));
			seen.push({ url, headers: new Headers(init?.headers) });
			return Response.json(
				url.pathname.endsWith("preferences") ? preferences : inbox,
			);
		});
		const queryClient = new QueryClient();
		const beforeLoad = vi.fn();
		const afterLoad = vi.fn();
		const stack = runtime(queryClient, { beforeLoad, afterLoad });
		await stack.router.getRoute("/notifications")?.loader?.();
		await stack.router.getRoute("/notifications/preferences")?.loader?.();
		expect(seen.map(({ url }) => url.pathname)).toEqual([
			"/custom-api/notifications",
			"/custom-api/notifications/preferences",
		]);
		expect(seen[0]?.url.searchParams.get("limit")).toBe("25");
		expect(seen[0]?.headers.get("cookie")).toBe("session=private");
		expect(seen[0]?.headers.get("authorization")).toBe("Bearer server-token");
		const keys = createNotificationsQueryKeys(
			createApiClient({ baseURL: "https://app.test", basePath: "/custom-api" }),
		);
		expect(
			queryClient.getQueryData(
				keys.notifications.list({ limit: 25, offset: 0 }, { id: "alice" })
					.queryKey,
			),
		).toEqual(inbox);
		expect(
			queryClient.getQueryData(
				keys.notificationPreferences.list({ id: "alice" }).queryKey,
			),
		).toEqual(preferences);
		expect(
			queryClient.getQueryData(
				keys.notificationPreferences.list({ id: "bob" }).queryKey,
			),
		).toBeUndefined();
		expect(beforeLoad).toHaveBeenCalledTimes(2);
		expect(afterLoad).toHaveBeenCalledTimes(2);
		queryClient.clear();
	});

	it("stores HTTP failures and reports once without rejecting the loader", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			Response.json({ message: "Unavailable" }, { status: 500 }),
		);
		const onErrorLoad = vi.fn(() => {
			throw new Error("Reporting failed");
		});
		const afterLoad = vi.fn();
		const queryClient = new QueryClient();
		const stack = runtime(queryClient, { onErrorLoad, afterLoad });
		await expect(
			stack.router.getRoute("/notifications")?.loader?.(),
		).resolves.toBeUndefined();
		expect(onErrorLoad).toHaveBeenCalledTimes(1);
		expect(afterLoad).not.toHaveBeenCalled();
		expect(queryClient.getQueryCache().getAll()[0]?.state.status).toBe("error");
		queryClient.clear();
	});

	it("sanitizes lifecycle hook failures in the query cache", async () => {
		const queryClient = new QueryClient();
		const onErrorLoad = vi.fn();
		const stack = runtime(queryClient, {
			beforeLoad: () => {
				throw new Error("Secret session token");
			},
			onErrorLoad,
		});
		await expect(
			stack.router.getRoute("/notifications/preferences")?.loader?.(),
		).resolves.toBeUndefined();
		expect(onErrorLoad).toHaveBeenCalledTimes(1);
		expect(
			queryClient.getQueryCache().getAll()[0]?.state.error?.message,
		).not.toContain("Secret session token");
		queryClient.clear();
	});
});
