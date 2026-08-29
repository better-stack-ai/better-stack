import type { DatabaseDefinition, DBAdapter } from "@btst/db";
import { QueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { createBackendStack, type BackendStackConfig } from "@btst/stack/api";
import {
	defineAuthorization,
	definePermissions,
	permission,
} from "@btst/stack/authorization";
import { createServerAuth } from "@btst/stack/authorization/server";
import { createClientStack, type ClientStackConfig } from "@btst/stack/client";
import {
	createDbPlugin,
	createEndpoint,
	defineBackendPlugin,
	defineOperation,
} from "@btst/stack/plugins/api";
import { createRoute, defineClientPlugin } from "@btst/stack/plugins/client";

type Equal<TLeft, TRight> = (<T>() => T extends TLeft ? 1 : 2) extends <
	T,
>() => T extends TRight ? 1 : 2
	? true
	: false;
type Expect<T extends true> = T;

const permissions = definePermissions("consumerProbe", {
	read: permission(z.object({ id: z.string() })),
});
const authorization = defineAuthorization({
	identity: z.object({ id: z.string() }),
	permissions: [permissions] as const,
	rules: ({ consumerProbe }) => [consumerProbe.read.allow()],
});
const auth = createServerAuth({
	authorization,
	getIdentity: () => ({ id: "user-1" }),
});
const read = defineOperation({
	input: z.object({ id: z.string() }),
	permission: permissions.read,
	facts: ({ input }) => ({ id: input.id }),
	execute: ({ input }) => ({ id: input.id }),
});
const backendPlugin = defineBackendPlugin({
	id: "consumerProbe",
	dbPlugin: createDbPlugin("consumerProbe", {}),
	operations: () => ({ read }),
	routes: (_adapter, _context, operations) => ({
		read: createEndpoint(
			"/consumer-probe/:id",
			{ method: "GET", requireRequest: true },
			operations.read.route((context) => ({ id: context.params.id })),
		),
	}),
});
const backendConfig = {
	basePath: "/api",
	plugins: { consumerProbe: backendPlugin },
	adapter: (_db: DatabaseDefinition) => null as unknown as DBAdapter,
	auth,
} satisfies BackendStackConfig<
	{ consumerProbe: typeof backendPlugin },
	typeof auth
>;
const backend = createBackendStack(backendConfig);

type _BackendRouteInference = Expect<
	Equal<keyof typeof backend.router.endpoints, "consumerProbe_read">
>;
backend.router.endpoints.consumerProbe_read;
backend.trusted.consumerProbe.read({ id: "record-1" });
backend
	.forRequest(new Request("https://example.com/api"))
	.operations.consumerProbe.read({ id: "record-1" });

const unrelatedPermissions = definePermissions("unrelated", {
	read: permission(),
});
const incompatibleAuth = createServerAuth({
	authorization: defineAuthorization({
		identity: z.object({ id: z.string() }),
		permissions: [unrelatedPermissions] as const,
		rules: ({ unrelated }) => [unrelated.read.allow()],
	}),
	getIdentity: () => ({ id: "user-1" }),
});
createBackendStack({
	...backendConfig,
	// @ts-expect-error the public constructor rejects incompatible catalogs
	auth: incompatibleAuth,
});

const clientPlugin = defineClientPlugin({
	id: "consumerProbe",
	resolve: () => ({
		routes: () => ({
			read: createRoute("/consumer-probe/:id", ({ params }) => ({
				PageComponent: () => null,
				loader: async () => ({ recordId: params.id }),
			})),
		}),
	}),
});
const clientConfig = {
	api: { baseURL: "https://example.com", basePath: "/api" },
	site: { baseURL: "https://example.com", basePath: "/pages" },
	queryClient: new QueryClient(),
	plugins: { consumerProbe: clientPlugin },
} satisfies ClientStackConfig<{ consumerProbe: typeof clientPlugin }>;
const client = createClientStack(clientConfig);
client.router.getRoute("/consumer-probe/record-1")?.loader?.();
