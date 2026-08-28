import type { DatabaseDefinition, DBAdapter } from "@btst/db";
import { z } from "zod";
import {
	createBackendStack,
	stack,
	type BackendLib,
	type BackendLibConfig,
	type BackendStack,
	type BackendStackConfig,
} from "@btst/stack/api";
import {
	defineAuthorization,
	definePermissions,
	permission,
} from "@btst/stack/authorization";
import { createServerAuth } from "@btst/stack/authorization/server";
import {
	createClientStack,
	createStackClient,
	type ClientLib,
	type ClientLibConfig,
	type ClientStack,
	type ClientStackConfig,
} from "@btst/stack/client";
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
	name: "consumerProbe",
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
const canonicalBackend = createBackendStack(backendConfig);
const temporaryBackend = stack(backendConfig);

type _BackendFactoriesMatch = Expect<
	Equal<typeof createBackendStack, typeof stack>
>;
type _BackendInferenceMatches = Expect<
	Equal<typeof canonicalBackend, typeof temporaryBackend>
>;
type _BackendRouteInference = Expect<
	Equal<keyof typeof canonicalBackend.router.endpoints, "consumerProbe_read">
>;
type _BackendConfigAliasMatches = Expect<
	Equal<
		BackendStackConfig<{ consumerProbe: typeof backendPlugin }, typeof auth>,
		BackendLibConfig<{ consumerProbe: typeof backendPlugin }, typeof auth>
	>
>;
type _BackendResultAliasMatches = Expect<
	Equal<
		BackendStack<
			ReturnType<typeof backendPlugin.routes>,
			Record<string, never>,
			typeof canonicalBackend.trusted
		>,
		BackendLib<
			ReturnType<typeof backendPlugin.routes>,
			Record<string, never>,
			typeof canonicalBackend.trusted
		>
	>
>;
canonicalBackend.router.endpoints.consumerProbe_read;
canonicalBackend.trusted.consumerProbe.read({ id: "record-1" });
canonicalBackend
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
	// @ts-expect-error public canonical constructor rejects incompatible catalogs
	auth: incompatibleAuth,
});
stack({
	...backendConfig,
	// @ts-expect-error public temporary constructor preserves catalog inference
	auth: incompatibleAuth,
});

const clientPlugin = defineClientPlugin({
	name: "consumerProbe",
	routes: () => ({
		read: createRoute("/consumer-probe/:id", ({ params }) => ({
			PageComponent: () => null,
			loader: async () => ({ recordId: params.id }),
		})),
	}),
});
const clientConfig = {
	plugins: { consumerProbe: clientPlugin },
} satisfies ClientStackConfig<{ consumerProbe: typeof clientPlugin }>;
const canonicalClient = createClientStack(clientConfig);
const temporaryClient = createStackClient(clientConfig);

type _ClientFactoriesMatch = Expect<
	Equal<typeof createClientStack, typeof createStackClient>
>;
type _ClientInferenceMatches = Expect<
	Equal<typeof canonicalClient, typeof temporaryClient>
>;
type _ClientConfigAliasMatches = Expect<
	Equal<
		ClientStackConfig<{ consumerProbe: typeof clientPlugin }>,
		ClientLibConfig<{ consumerProbe: typeof clientPlugin }>
	>
>;
type _ClientResultAliasMatches = Expect<
	Equal<
		ClientStack<ReturnType<typeof clientPlugin.routes>>,
		ClientLib<ReturnType<typeof clientPlugin.routes>>
	>
>;
canonicalClient.router.getRoute("/consumer-probe/record-1")?.loader?.();
