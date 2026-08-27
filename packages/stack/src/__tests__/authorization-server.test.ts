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
		const getIdentity = vi.fn(
			({ headers, request }: { headers: Headers; request?: Request }) => ({
				id: headers.get("x-user-id") ?? "missing",
				role: "admin" as const,
				requestUrl: request?.url,
			}),
		);
		const serverAuth = createServerAuth({ authorization, getIdentity });
		const headers = new Headers({ "x-user-id": "server-user" });

		const first = serverAuth.getIdentity({ headers });
		const second = serverAuth.getIdentity({ headers });
		await expect(first).resolves.toEqual({
			id: "server-user",
			role: "admin",
		});
		await expect(second).resolves.toEqual({
			id: "server-user",
			role: "admin",
		});
		expect(getIdentity).toHaveBeenCalledOnce();
		expect(getIdentity).toHaveBeenCalledWith({ headers });
	});

	it("keeps layout identity schema failures observable", async () => {
		const serverAuth = createServerAuth({
			authorization,
			getIdentity: () => ({ id: "server-user", role: "owner" }) as never,
		});

		await expect(
			serverAuth.getIdentity({ headers: new Headers() }),
		).rejects.toBeInstanceOf(z.ZodError);
	});

	it("keeps layout identity resolver failures observable", async () => {
		const serverAuth = createServerAuth({
			authorization,
			getIdentity: () => {
				throw new Error("session store unavailable");
			},
		});

		await expect(
			serverAuth.getIdentity({ headers: new Headers() }),
		).rejects.toThrow("session store unavailable");
	});
});
