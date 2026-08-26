import { z } from "zod";
import {
	defineAuthorization,
	definePermissions,
	permission,
} from "../authorization";
import { createClientAuth } from "../authorization/client";
import { createServerAuth } from "../authorization/server";
import { stack } from "../api";
import {
	createDbPlugin,
	type DeepReadonly,
	defineBackendPlugin,
	defineOperation,
} from "../plugins/api";
import { blogBackendPlugin, type BlogBackendHooks } from "../plugins/blog/api";
import { blogPermissions } from "../plugins/blog/permissions";
import type { StackIdentity } from "../shared/auth-types";
import type { DatabaseDefinition, DBAdapter } from "@btst/db";

type Equal<TLeft, TRight> = (<T>() => T extends TLeft ? 1 : 2) extends <
	T,
>() => T extends TRight ? 1 : 2
	? (<T>() => T extends TRight ? 1 : 2) extends <T>() => T extends TLeft ? 1 : 2
		? true
		: false
	: false;
type Expect<T extends true> = T;

const registered = definePermissions("registered", {
	article: {
		delete: permission(
			z.object({ id: z.string(), authorId: z.string().optional() }),
		),
	},
});

const unregistered = definePermissions("unregistered", {
	article: {
		delete: permission(z.object({ id: z.string() })),
	},
});

const authorization = defineAuthorization({
	identity: z.object({
		id: z.string(),
		role: z.enum(["user", "admin"]),
	}),
	permissions: [registered] as const,
	rules: ({ registered }) => [
		registered.article.delete.when(({ identity, facts }) => {
			const identityIsExact: Expect<
				Equal<typeof identity, { id: string; role: "user" | "admin" } | null>
			> = true;
			const factsAreExact: Expect<
				Equal<typeof facts, { id: string; authorId?: string }>
			> = true;
			void identityIsExact;
			void factsAreExact;
			return identity !== null && identity.id === facts.authorId;
		}),
	],
});

authorization.can(registered.article.delete({ id: "article-1" }), {
	id: "user-1",
	role: "user",
});

const clientAuth = createClientAuth({
	authorization,
	getIdentity: () => ({ id: "user-1", role: "user" as const }),
});

const clientResolverIsExact: Expect<
	Equal<
		ReturnType<typeof clientAuth.getIdentity>,
		Promise<{ id: string; role: "user" | "admin" } | null>
	>
> = true;
const clientHookIsExact: Expect<
	Equal<
		ReturnType<typeof clientAuth.useIdentity>["identity"],
		{ id: string; role: "user" | "admin" } | null
	>
> = true;
void clientResolverIsExact;
void clientHookIsExact;
clientAuth.useCan(registered.article.delete({ id: "article-1" }));
void clientAuth.CanAccess({
	permission: registered.article.delete({ id: "article-1" }),
});

const serverAuth = createServerAuth({
	authorization,
	getIdentity: () => ({ id: "user-1", role: "user" as const }),
});

const serverResolverIsExact: Expect<
	Equal<
		ReturnType<typeof serverAuth.getIdentity>,
		Promise<{ id: string; role: "user" | "admin" } | null>
	>
> = true;
void serverResolverIsExact;

// @ts-expect-error permission fact id must be a string
registered.article.delete({ id: 1 });

authorization.can(registered.article.delete({ id: "article-1" }), {
	id: "user-1",
	// @ts-expect-error the identity is inferred from the identity schema
	role: "owner",
});

// @ts-expect-error permissions outside the registered catalogs are rejected
authorization.can(unregistered.article.delete({ id: "article-1" }), {
	id: "user-1",
	role: "user",
});

// @ts-expect-error bound hooks reject permissions outside the registered catalogs
clientAuth.useCan(unregistered.article.delete({ id: "article-1" }));

void clientAuth.CanAccess({
	// @ts-expect-error bound components reject permissions outside the registered catalogs
	permission: unregistered.article.delete({ id: "article-1" }),
});

createServerAuth({
	authorization,
	// @ts-expect-error server identity resolver uses the same inferred identity contract
	getIdentity: () => ({ id: "user-1", role: "owner" }),
});

const operation = defineOperation({
	input: z.object({ id: z.string() }),
	permission: registered.article.delete,
	facts: ({ input }) => ({ id: input.id }),
	execute: ({ input }) => input.id,
});

const plainLifecyclePermissions = definePermissions("plain-lifecycle", {
	read: permission(),
});
defineOperation({
	// @ts-expect-error Date input cannot cross the immutable lifecycle boundary
	input: z.object({ at: z.date() }),
	permission: plainLifecyclePermissions.read,
	facts: () => undefined,
	execute: () => "ok",
});
defineOperation({
	// @ts-expect-error Map input cannot cross the immutable lifecycle boundary
	input: z.object({ values: z.map(z.string(), z.string()) }),
	permission: plainLifecyclePermissions.read,
	facts: () => undefined,
	execute: () => "ok",
});
defineOperation({
	// @ts-expect-error typed arrays cannot cross the immutable lifecycle boundary
	input: z.object({ bytes: z.instanceof(Uint8Array) }),
	permission: plainLifecyclePermissions.read,
	facts: () => undefined,
	execute: () => "ok",
});
defineOperation({
	input: z.object({ id: z.string() }),
	permission: plainLifecyclePermissions.read,
	facts: () => undefined,
	// @ts-expect-error operation results must also use plain immutable data
	execute: () => new Date(),
});

// @ts-expect-error operation internals are only reachable through stack transports
operation.run({ id: "article-1" }, { internal: true });

const blogHooks: BlogBackendHooks = {
	onBeforeDeletePost: (_id, context) => {
		const identityIsHonest: Expect<
			Equal<typeof context.identity, DeepReadonly<StackIdentity> | null>
		> = true;
		const inputIsExact: Expect<
			Equal<typeof context.input, { readonly id: string }>
		> = true;
		const factsAreExact: Expect<
			Equal<
				typeof context.facts,
				{ readonly id: string; readonly authorId?: string }
			>
		> = true;
		const requestIsExact: Expect<
			Equal<typeof context.request, Request | undefined>
		> = true;
		void identityIsHonest;
		void inputIsExact;
		void factsAreExact;
		void requestIsExact;
		// @ts-expect-error authorized input cannot be changed after policy evaluation
		context.input.id = "another-post";
		if (context.identity) {
			// @ts-expect-error authorized identity cannot be changed by lifecycle hooks
			context.identity.id = "another-user";
		}
	},
	onPostDeleted: (_id, context) => {
		const resultIsExact: Expect<
			Equal<typeof context.result, { readonly success: true }>
		> = true;
		void resultIsExact;
	},
	onDeletePostError: (_error, context) => {
		const errorInputIsExact: Expect<
			Equal<typeof context.input, { readonly id: string }>
		> = true;
		const errorFactsAreExact: Expect<
			Equal<
				typeof context.facts,
				{ readonly id: string; readonly authorId?: string }
			>
		> = true;
		void errorInputIsExact;
		void errorFactsAreExact;
	},
};
void blogHooks;

type BlogRouteOperations = Parameters<
	ReturnType<typeof blogBackendPlugin>["routes"]
>[2];
const declaredRouteOperationsAreRequired: Expect<
	Equal<undefined extends BlogRouteOperations ? true : false, false>
> = true;
void declaredRouteOperationsAreRequired;

const fakeAdapter = (_db: DatabaseDefinition) => ({}) as DBAdapter;
const blogAuthorization = defineAuthorization({
	identity: z.object({ id: z.string(), role: z.enum(["user", "admin"]) }),
	permissions: [blogPermissions] as const,
	rules: ({ blog }) => [blog.post.delete.allow()],
});
const blogServerAuth = createServerAuth({
	authorization: blogAuthorization,
	getIdentity: () => ({ id: "user-1", role: "user" as const }),
});

stack({
	basePath: "/api",
	plugins: { blog: blogBackendPlugin() },
	adapter: fakeAdapter,
	auth: blogServerAuth,
});

const unregisteredAuthorization = defineAuthorization({
	identity: z.object({ id: z.string() }),
	permissions: [unregistered] as const,
	rules: () => [],
});
const unregisteredServerAuth = createServerAuth({
	authorization: unregisteredAuthorization,
	getIdentity: () => ({ id: "user-1" }),
});

stack({
	basePath: "/api",
	plugins: { blog: blogBackendPlugin() },
	adapter: fakeAdapter,
	// @ts-expect-error Blog operations require the Blog permission catalog
	auth: unregisteredServerAuth,
});

const operationPlugin = defineBackendPlugin({
	name: "operation-fixture",
	dbPlugin: createDbPlugin("operation-fixture", {}),
	operations: () => ({ deleteArticle: operation }),
	routes: () => ({}),
});

stack({
	basePath: "/api",
	plugins: { operationFixture: operationPlugin },
	adapter: fakeAdapter,
	auth: serverAuth,
});

const incompatibleRegistered = definePermissions("registered", {
	article: {
		delete: permission(
			z.object({ id: z.string(), authorId: z.number().optional() }),
		),
	},
});
const incompatibleAuthorization = defineAuthorization({
	identity: z.object({ id: z.string() }),
	permissions: [incompatibleRegistered] as const,
	rules: ({ registered }) => [registered.article.delete.allow()],
});
const incompatibleServerAuth = createServerAuth({
	authorization: incompatibleAuthorization,
	getIdentity: () => ({ id: "user-1" }),
});

stack({
	basePath: "/api",
	plugins: { operationFixture: operationPlugin },
	adapter: fakeAdapter,
	// @ts-expect-error matching ids with incompatible fact schemas are rejected
	auth: incompatibleServerAuth,
});
