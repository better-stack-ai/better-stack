import { createDbPlugin } from "@btst/db";
import type { DBAdapter as Adapter, DatabaseDefinition } from "@btst/db";
import { createMemoryAdapter } from "@btst/adapter-memory";
import { describe, expect, it, vi } from "vitest";
import { getRequestIdentity, stack } from "../api";
import { createEndpoint, defineBackendPlugin } from "../plugins/api";
import type { StackServerAuthProvider } from "../types";

const testAdapter = (db: DatabaseDefinition): Adapter =>
	createMemoryAdapter(db)({});

/**
 * Minimal plugin whose route reads the request identity the way plugin
 * lifecycle hooks are expected to: via getRequestIdentity(ctx.headers).
 * It calls it twice to verify per-request memoization.
 */
const whoamiPlugin = defineBackendPlugin({
	name: "whoami",
	dbPlugin: createDbPlugin("whoami", {}),
	routes: () => ({
		whoami: createEndpoint("/whoami", { method: "GET" }, async (ctx) => {
			const first = await getRequestIdentity(ctx.headers);
			const second = await getRequestIdentity(ctx.headers);
			return { first, second };
		}),
	}),
});

function makeStack(auth?: StackServerAuthProvider) {
	return stack({
		basePath: "/api",
		plugins: { whoami: whoamiPlugin },
		adapter: testAdapter,
		auth,
	});
}

async function callWhoami(backend: { handler: (r: Request) => any }) {
	const res = await backend.handler(
		new Request("http://localhost/api/whoami", {
			headers: { "x-user-id": "user-1" },
		}),
	);
	return res.json();
}

describe("stack() server-side identity resolution", () => {
	it("resolves identity from the auth provider and memoizes it per request", async () => {
		const getIdentity = vi.fn(({ headers }: { headers: Headers }) => ({
			id: headers.get("x-user-id")!,
		}));
		const backend = makeStack({ getIdentity });

		const body = await callWhoami(backend);

		expect(body.first).toEqual({ id: "user-1" });
		expect(body.second).toEqual({ id: "user-1" });
		// Two getRequestIdentity calls, one provider invocation.
		expect(getIdentity).toHaveBeenCalledTimes(1);
	});

	it("resolves identity again for each new request", async () => {
		const getIdentity = vi.fn(() => ({ id: "user-1" }));
		const backend = makeStack({ getIdentity });

		await callWhoami(backend);
		await callWhoami(backend);

		expect(getIdentity).toHaveBeenCalledTimes(2);
	});

	it("treats getIdentity failures as unauthenticated instead of rejecting", async () => {
		const consoleError = vi
			.spyOn(console, "error")
			.mockImplementation(() => {});
		const backend = makeStack({
			getIdentity: () => Promise.reject(new Error("session lookup failed")),
		});

		const body = await callWhoami(backend);

		expect(body.first).toBeNull();
		expect(body.second).toBeNull();
		expect(consoleError).toHaveBeenCalledOnce();
		consoleError.mockRestore();
	});

	it("treats synchronously throwing getIdentity as unauthenticated", async () => {
		const consoleError = vi
			.spyOn(console, "error")
			.mockImplementation(() => {});
		const backend = makeStack({
			getIdentity: () => {
				throw new Error("boom");
			},
		});

		const body = await callWhoami(backend);
		expect(body.first).toBeNull();
		consoleError.mockRestore();
	});

	it("normalizes undefined identities to null", async () => {
		const backend = makeStack({
			getIdentity: () => undefined as any,
		});

		const body = await callWhoami(backend);
		expect(body.first).toBeNull();
	});

	it("passes headers and request to getIdentity", async () => {
		const getIdentity = vi.fn(
			(_ctx: { headers: Headers; request: Request }) => null,
		);
		const backend = makeStack({ getIdentity });

		await callWhoami(backend);

		const ctx = getIdentity.mock.calls[0]![0];
		expect(ctx.headers.get("x-user-id")).toBe("user-1");
		expect(ctx.request.url).toBe("http://localhost/api/whoami");
	});

	it("returns null without an auth provider (handler untouched)", async () => {
		const backend = makeStack();

		const body = await callWhoami(backend);
		expect(body.first).toBeNull();
		expect(body.second).toBeNull();
	});

	it("returns null for headers outside any handled request", async () => {
		const identity = await getRequestIdentity(new Headers());
		expect(identity).toBeNull();
	});

	it("exposes the auth provider on the plugin StackContext", () => {
		const auth: StackServerAuthProvider = { getIdentity: () => null };
		let seenAuth: StackServerAuthProvider | undefined;

		const probePlugin = defineBackendPlugin({
			name: "probe",
			dbPlugin: createDbPlugin("probe", {}),
			routes: (_adapter, context) => {
				seenAuth = context?.auth;
				return {};
			},
		});

		stack({
			basePath: "/api",
			plugins: { probe: probePlugin },
			adapter: testAdapter,
			auth,
		});

		expect(seenAuth).toBe(auth);
	});
});
