import { z } from "zod";
import {
	defineAuthorization,
	definePermissions,
	permission,
} from "../authorization";
import { createClientAuth } from "../authorization/client";
import { createServerAuth } from "../authorization/server";
import { stack } from "../api";
import { defineOperation } from "../plugins/api";
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

// @ts-expect-error operation internals are only reachable through stack transports
operation.run({ id: "article-1" }, { internal: true });

const blogHooks: BlogBackendHooks = {
	onBeforeDeletePost: (_id, context) => {
		const identityIsHonest: Expect<
			Equal<typeof context.identity, StackIdentity | null>
		> = true;
		const inputIsExact: Expect<Equal<typeof context.input, { id: string }>> =
			true;
		const factsAreExact: Expect<
			Equal<typeof context.facts, { id: string; authorId?: string }>
		> = true;
		const requestIsExact: Expect<
			Equal<typeof context.request, Request | undefined>
		> = true;
		void identityIsHonest;
		void inputIsExact;
		void factsAreExact;
		void requestIsExact;
	},
	onPostDeleted: (_id, context) => {
		const resultIsExact: Expect<
			Equal<typeof context.result, { readonly success: true }>
		> = true;
		void resultIsExact;
	},
	onDeletePostError: (_error, context) => {
		const errorInputIsExact: Expect<
			Equal<typeof context.input, { id: string }>
		> = true;
		const errorFactsAreExact: Expect<
			Equal<typeof context.facts, { id: string; authorId?: string }>
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
