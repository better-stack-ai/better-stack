import { expectTypeOf } from "vitest";
import { z } from "zod";
import {
	defineAuthorization,
	definePermissions,
	permission,
} from "../authorization";
import { createClientAuth } from "../authorization/client";
import { createServerAuth } from "../authorization/server";

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
		registered.article.delete.when(({ identity, params }) => {
			expectTypeOf(identity).toEqualTypeOf<{
				id: string;
				role: "user" | "admin";
			} | null>();
			expectTypeOf(params).toEqualTypeOf<{
				id: string;
				authorId?: string;
			}>();
			return identity?.id === params.authorId;
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

expectTypeOf(clientAuth.getIdentity()).toEqualTypeOf<
	Promise<{ id: string; role: "user" | "admin" } | null>
>();
expectTypeOf(clientAuth.useIdentity().identity).toEqualTypeOf<{
	id: string;
	role: "user" | "admin";
} | null>();
clientAuth.useCan(registered.article.delete({ id: "article-1" }));
void clientAuth.CanAccess({
	permission: registered.article.delete({ id: "article-1" }),
});

const serverAuth = createServerAuth({
	authorization,
	getIdentity: () => ({ id: "user-1", role: "user" as const }),
});

expectTypeOf(
	serverAuth.getIdentity(new Request("http://localhost")),
).toEqualTypeOf<Promise<{ id: string; role: "user" | "admin" } | null>>();

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
