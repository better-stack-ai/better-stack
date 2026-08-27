import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
	type AuthorizationContractIdentity,
	defineAuthorizationContract,
} from "../authorization";
import { createNextLayout } from "../next/server";
import { createReactRouterLayout } from "../react-router";
import { createTanStackLayout } from "../tanstack";
import { resolveTanStackInitialIdentity } from "../tanstack/server";

const nextHeaders = vi.hoisted(() =>
	vi.fn(async () => new Headers({ "x-user-id": "next-user" })),
);

vi.mock("next/headers", () => ({ headers: nextHeaders }));

const identityContract = defineAuthorizationContract({
	identity: z.object({ id: z.string(), role: z.enum(["user", "admin"]) }),
	permissions: [] as const,
});

type Identity = AuthorizationContractIdentity<typeof identityContract>;

const nonSerializableContract = {
	...identityContract,
	parseIdentity: (identity: unknown) => identity as Identity | null,
} satisfies typeof identityContract;

describe("framework identity layout helpers", () => {
	beforeEach(() => {
		nextHeaders.mockClear();
	});

	it("creates a request-aware Next.js server layout around the full client subtree", async () => {
		const getIdentity = vi.fn(({ headers }: { headers: Headers }) => ({
			id: headers.get("x-user-id") ?? "missing",
			role: "admin" as const,
		}));
		const layout = createNextLayout({
			auth: { contract: identityContract, getIdentityFromHeaders: getIdentity },
			ClientLayout: ({ initialIdentity, children }) => (
				<section data-user={initialIdentity?.id ?? "anonymous"}>
					{children}
				</section>
			),
		});

		const tree = await layout.Layout({ children: <span>sibling page</span> });
		const html = renderToString(tree);

		expect(html).toContain('data-user="next-user"');
		expect(html).toContain("sibling page");
		expect(nextHeaders).toHaveBeenCalledOnce();
		expect(getIdentity).toHaveBeenCalledOnce();
	});

	it("rejects invalid and non-serializable Next.js layout identities", async () => {
		const invalid = createNextLayout({
			auth: {
				contract: identityContract,
				getIdentityFromHeaders: () => ({ id: "next-user", role: "owner" }),
			},
			ClientLayout: () => null,
		});
		const nonSerializable = createNextLayout({
			auth: {
				contract: nonSerializableContract,
				getIdentityFromHeaders: () => ({
					id: "next-user",
					role: "admin",
					session: () => undefined,
				}),
			},
			ClientLayout: () => null,
		});

		await expect(invalid.Layout({})).rejects.toBeInstanceOf(z.ZodError);
		await expect(nonSerializable.Layout({})).rejects.toThrow(/JSON-safe/);
	});

	it("creates a React Router parent layout loader from the incoming request", async () => {
		const getIdentity = vi.fn((request: Request) => ({
			id: request.headers.get("x-user-id") ?? "missing",
			role: "admin" as const,
		}));
		const layout = createReactRouterLayout({
			auth: { contract: identityContract, getIdentity },
		});
		const request = new Request("http://test.local/pages/blog", {
			headers: { "x-user-id": "router-user" },
		});

		await expect(
			layout.loader({ request, params: {}, context: undefined }),
		).resolves.toEqual({
			initialIdentity: { id: "router-user", role: "admin" },
		});
		expect(getIdentity).toHaveBeenCalledWith(request);
	});

	it("rejects invalid and non-serializable React Router layout identities", async () => {
		const request = new Request("http://test.local/pages");
		const args = { request, params: {}, context: undefined };
		const invalid = createReactRouterLayout({
			auth: {
				contract: identityContract,
				getIdentity: () => ({ id: "router-user", role: "owner" }),
			},
		});
		const nonSerializable = createReactRouterLayout({
			auth: {
				contract: nonSerializableContract,
				getIdentity: () => ({
					id: "router-user",
					role: "admin",
					session: () => undefined,
				}),
			},
		});

		await expect(invalid.loader(args)).rejects.toBeInstanceOf(z.ZodError);
		await expect(nonSerializable.loader(args)).rejects.toThrow(/JSON-safe/);
	});

	it("creates a TanStack parent loader from a validated server snapshot", async () => {
		const request = new Request("http://test.local/pages", {
			headers: { "x-user-id": "tanstack-user" },
		});
		const getInitialIdentity = vi.fn(() =>
			resolveTanStackInitialIdentity({
				auth: {
					contract: identityContract,
					getIdentity: (currentRequest: Request) => ({
						id: currentRequest.headers.get("x-user-id") ?? "missing",
						role: "admin" as const,
					}),
				},
				request,
			}),
		);
		const layout = createTanStackLayout({ getInitialIdentity });

		await expect(layout.loader()).resolves.toEqual({
			initialIdentity: { id: "tanstack-user", role: "admin" },
		});
		expect(getInitialIdentity).toHaveBeenCalledOnce();
	});

	it("rejects invalid and non-serializable TanStack server identities", async () => {
		const request = new Request("http://test.local/pages");
		const invalid = resolveTanStackInitialIdentity({
			auth: {
				contract: identityContract,
				getIdentity: () => ({ id: "tanstack-user", role: "owner" }),
			},
			request,
		});
		const nonSerializable = resolveTanStackInitialIdentity({
			auth: {
				contract: nonSerializableContract,
				getIdentity: () => ({
					id: "tanstack-user",
					role: "admin",
					session: () => undefined,
				}),
			},
			request,
		});

		await expect(invalid).rejects.toBeInstanceOf(z.ZodError);
		await expect(nonSerializable).rejects.toThrow(/JSON-safe/);
	});

	it("does not accept an unvalidated TanStack server function", () => {
		const getInitialIdentity = async () => ({
			initialIdentity: { id: "unvalidated", role: "admin" as const },
		});

		createTanStackLayout({
			// @ts-expect-error snapshots must come from resolveTanStackInitialIdentity
			getInitialIdentity,
		});
	});
});
