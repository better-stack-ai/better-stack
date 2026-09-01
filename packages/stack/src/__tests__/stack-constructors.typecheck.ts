import {
	createDbPlugin,
	type DatabaseDefinition,
	type DBAdapter,
} from "@btst/db";
import { QueryClient } from "@tanstack/react-query";
import { createRoute } from "@btst/yar";
import { z } from "zod";
import { createBackendStack, type BackendStackConfig } from "../api";
import {
	defineAuthorization,
	definePermissions,
	permission,
} from "../authorization";
import { createServerAuth } from "../authorization/server";
import { createClientStack, type ClientStackConfig } from "../client";
import {
	createEndpoint,
	defineBackendPlugin,
	defineOperation,
} from "../plugins/api";
import { defineClientPlugin } from "../plugins/client";

type Equal<TLeft, TRight> = (<T>() => T extends TLeft ? 1 : 2) extends <
	T,
>() => T extends TRight ? 1 : 2
	? true
	: false;
type Expect<T extends true> = T;

const permissions = definePermissions("constructorProbe", {
	read: permission(z.object({ id: z.string() })),
});
const authorization = defineAuthorization({
	identity: z.object({ id: z.string() }),
	permissions: [permissions] as const,
	rules: ({ constructorProbe }) => [constructorProbe.read.allow()],
});
const serverAuth = createServerAuth({
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
	id: "constructorProbe",
	dbPlugin: createDbPlugin("constructorProbe", {}),
	operations: () => ({ read }),
	routes: (_adapter, _context, operations) => ({
		read: createEndpoint(
			"/constructor-probe/:id",
			{ method: "GET", requireRequest: true },
			operations.read.route((context) => ({ id: context.params.id })),
		),
	}),
});
const backendConfig = {
	basePath: "/api",
	plugins: { constructorProbe: backendPlugin },
	adapter: (_db: DatabaseDefinition) => null as unknown as DBAdapter,
	auth: serverAuth,
} satisfies BackendStackConfig<
	{ constructorProbe: typeof backendPlugin },
	typeof serverAuth
>;

const backend = createBackendStack(backendConfig);
type _BackendRouteKeys = Expect<
	Equal<keyof typeof backend.router.endpoints, "constructorProbe_read">
>;
backend.trusted.constructorProbe.read({ id: "record-1" });
backend
	.forRequest(new Request("https://example.com/api"))
	.operations.constructorProbe.read({ id: "record-1" });

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
	// @ts-expect-error canonical constructor rejects incompatible authorization catalogs
	auth: incompatibleAuth,
});

const clientPlugin = defineClientPlugin({
	id: "constructorProbe",
	resolve: () => ({
		routes: () => ({
			read: createRoute("/constructor-probe/:id", ({ params }) => ({
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
	plugins: { constructorProbe: clientPlugin },
} satisfies ClientStackConfig<{ constructorProbe: typeof clientPlugin }>;
const client = createClientStack(clientConfig);
client.router.getRoute("/constructor-probe/record-1")?.loader?.();
