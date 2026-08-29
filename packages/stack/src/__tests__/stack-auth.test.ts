import { createMemoryAdapter } from "@btst/adapter-memory";
import { createDbPlugin, type DatabaseDefinition } from "@btst/db";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createBackendStack } from "../api";
import {
	defineAuthorization,
	definePermissions,
	permission,
} from "../authorization";
import { createServerAuth, type ServerAuth } from "../authorization/server";
import { defineBackendPlugin } from "../plugins/api";

const testAdapter = (db: DatabaseDefinition) => createMemoryAdapter(db)({});
const permissions = definePermissions("probe", { read: permission() });
const authorization = defineAuthorization({
	identity: z.object({ id: z.string() }),
	permissions: [permissions] as const,
	rules: ({ probe }) => [probe.read.allow()],
});

describe("createBackendStack() server authorization boundary", () => {
	it("exposes only a createServerAuth adapter to plugin composition", () => {
		const auth = createServerAuth({
			authorization,
			getIdentity: () => null,
		});
		let seenAuth: ServerAuth<typeof authorization> | undefined;
		const probePlugin = defineBackendPlugin({
			id: "probe",
			dbPlugin: createDbPlugin("probe", {}),
			routes: (_adapter, context) => {
				seenAuth = context?.auth as ServerAuth<typeof authorization>;
				return {};
			},
		});

		createBackendStack({
			basePath: "/api",
			plugins: { probe: probePlugin },
			adapter: testAdapter,
			auth,
		});

		expect(seenAuth).toBe(auth);
	});

	it("rejects the removed structural provider shape at runtime", () => {
		const plugin = defineBackendPlugin({
			id: "probe",
			dbPlugin: createDbPlugin("probe", {}),
			routes: () => ({}),
		});

		expect(() =>
			createBackendStack({
				basePath: "/api",
				plugins: { probe: plugin },
				adapter: testAdapter,
				auth: { getIdentity: () => null } as never,
			}),
		).toThrow("requires an adapter created by createServerAuth");
	});
});
