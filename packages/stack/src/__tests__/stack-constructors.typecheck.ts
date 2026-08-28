import {
	createDbPlugin,
	type DatabaseDefinition,
	type DBAdapter,
} from "@btst/db";
import { createRoute } from "@btst/yar";
import { z } from "zod";
import {
	createBackendStack,
	stack,
	type BackendLib,
	type BackendLibConfig,
	type BackendStack,
	type BackendStackConfig,
} from "../api";
import {
	defineAuthorization,
	definePermissions,
	permission,
} from "../authorization";
import { createServerAuth } from "../authorization/server";
import {
	createClientStack,
	createStackClient,
	type ClientLib,
	type ClientLibConfig,
	type ClientStack,
	type ClientStackConfig,
} from "../client";
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
	name: "constructorProbe",
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

const canonicalBackend = createBackendStack(backendConfig);
const temporaryBackend = stack(backendConfig);
type _BackendFactoriesMatch = Expect<
	Equal<typeof createBackendStack, typeof stack>
>;
type _BackendInferenceMatches = Expect<
	Equal<typeof canonicalBackend, typeof temporaryBackend>
>;
const canonicalBackendConfig: BackendStackConfig = backendConfig;
const legacyBackendConfig: BackendLibConfig = canonicalBackendConfig;
const canonicalBackendResult: BackendStack = canonicalBackend;
const legacyBackendResult: BackendLib = canonicalBackendResult;
void legacyBackendConfig;
void legacyBackendResult;
canonicalBackend.internal.constructorProbe.read({ id: "record-1" });
canonicalBackend
	.forRequest(new Request("https://example.com/api"))
	.api.constructorProbe.read({ id: "record-1" });

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
stack({
	...backendConfig,
	// @ts-expect-error temporary alias preserves authorization compatibility inference
	auth: incompatibleAuth,
});

const clientPlugin = defineClientPlugin({
	name: "constructorProbe",
	routes: () => ({
		read: createRoute("/constructor-probe/:id", ({ params }) => ({
			PageComponent: () => null,
			loader: async () => ({ recordId: params.id }),
		})),
	}),
});
const clientConfig = {
	plugins: { constructorProbe: clientPlugin },
} satisfies ClientStackConfig<{ constructorProbe: typeof clientPlugin }>;
const canonicalClient = createClientStack(clientConfig);
const temporaryClient = createStackClient(clientConfig);
type _ClientFactoriesMatch = Expect<
	Equal<typeof createClientStack, typeof createStackClient>
>;
type _ClientInferenceMatches = Expect<
	Equal<typeof canonicalClient, typeof temporaryClient>
>;
const canonicalClientConfig: ClientStackConfig = clientConfig;
const legacyClientConfig: ClientLibConfig = canonicalClientConfig;
const canonicalClientResult: ClientStack<
	ReturnType<typeof clientPlugin.routes>
> = canonicalClient;
const legacyClientResult: ClientLib<ReturnType<typeof clientPlugin.routes>> =
	canonicalClientResult;
void legacyClientConfig;
void legacyClientResult;
canonicalClient.router.getRoute("/constructor-probe/record-1")?.loader?.();
