import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
	defineAuthorization,
	definePermissions,
	permission,
} from "../authorization";
import { createServerAuth } from "../authorization/server";

const permissions = definePermissions("account", {
	read: permission(),
});

const authorization = defineAuthorization({
	identity: z.object({ id: z.string(), role: z.enum(["user", "admin"]) }),
	permissions: [permissions] as const,
	rules: ({ account }) => [account.read.allow()],
});

describe("createServerAuth identity hydration", () => {
	it("resolves and validates identity from headers when a framework layout has no Request", async () => {
		const getIdentityFromHeaders = vi.fn(
			({ headers }: { headers: Headers }) => ({
				id: headers.get("x-user-id") ?? "missing",
				role: "admin" as const,
			}),
		);
		const serverAuth = createServerAuth({
			authorization,
			getIdentityFromHeaders,
		});
		const headers = new Headers({ "x-user-id": "server-user" });

		const first = serverAuth.getIdentityFromHeaders({ headers });
		const second = serverAuth.getIdentityFromHeaders({ headers });
		await expect(first).resolves.toEqual({
			id: "server-user",
			role: "admin",
		});
		await expect(second).resolves.toEqual({
			id: "server-user",
			role: "admin",
		});
		expect(getIdentityFromHeaders).toHaveBeenCalledOnce();
		expect(getIdentityFromHeaders).toHaveBeenCalledWith({ headers });
	});

	it("keeps the existing request-aware adapter contract", async () => {
		const getIdentity = vi.fn(({ request }: { request: Request }) => ({
			id: new URL(request.url).pathname,
			role: "user" as const,
		}));
		const serverAuth = createServerAuth({ authorization, getIdentity });
		const request = new Request("https://example.test/account");

		await expect(serverAuth.getIdentity(request)).resolves.toEqual({
			id: "/account",
			role: "user",
		});
		expect(getIdentity).toHaveBeenCalledWith({
			headers: request.headers,
			request,
		});
	});

	it("keeps layout identity schema failures observable", async () => {
		const serverAuth = createServerAuth({
			authorization,
			getIdentityFromHeaders: () =>
				({ id: "server-user", role: "owner" }) as never,
		});

		await expect(
			serverAuth.getIdentityFromHeaders({ headers: new Headers() }),
		).rejects.toBeInstanceOf(z.ZodError);
	});

	it("keeps layout identity resolver failures observable", async () => {
		const serverAuth = createServerAuth({
			authorization,
			getIdentityFromHeaders: () => {
				throw new Error("session store unavailable");
			},
		});

		await expect(
			serverAuth.getIdentityFromHeaders({ headers: new Headers() }),
		).rejects.toThrow("session store unavailable");
	});
});
