import { z } from "zod";
import {
	defineAuthorization,
	definePermissions,
	permission,
} from "../authorization";
import { createClientAuth } from "../authorization/client";
import { createServerAuth } from "../authorization/server";

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
