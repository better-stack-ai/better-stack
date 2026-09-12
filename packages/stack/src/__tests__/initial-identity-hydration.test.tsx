// @vitest-environment jsdom
import { act, useEffect } from "react";
import { QueryClient } from "@tanstack/react-query";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
	defineAuthorization,
	definePermissions,
	permission,
} from "../authorization";
import { createClientAuth } from "../authorization/client";
import { createClientStack } from "../client";
import { StackProvider } from "../context";
import { blogPermissions } from "../plugins/blog/permissions";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const permissions = definePermissions("documents", {
	delete: permission(z.object({ id: z.string() })),
});

const authorization = defineAuthorization({
	identity: z.object({ id: z.string(), role: z.enum(["user", "admin"]) }),
	permissions: [permissions] as const,
	rules: ({ documents }) => [
		documents.delete.when(
			({ identity }) => identity !== null && identity.role === "admin",
		),
	],
});

const clientStack = createClientStack({
	api: { baseURL: "https://app.example.com", basePath: "/api/data" },
	site: { baseURL: "https://app.example.com", basePath: "/pages" },
	queryClient: new QueryClient(),
	plugins: {},
});

let container: HTMLDivElement;
let root: Root | undefined;

beforeEach(() => {
	container = document.createElement("div");
	document.body.appendChild(container);
});

afterEach(async () => {
	if (root) await act(async () => root?.unmount());
	root = undefined;
	container.remove();
	vi.restoreAllMocks();
});

describe("initial identity SSR hydration", () => {
	it.each([undefined, null])(
		"renders public blog content with a settled anonymous snapshot (%s)",
		async (initialIdentity) => {
			const publicAuthorization = defineAuthorization({
				identity: z.object({ id: z.string() }),
				permissions: [blogPermissions] as const,
				rules: ({ blog }) => [
					blog.post.read.when(({ facts }) => facts.scope === "published"),
					blog.post.create.when(({ identity }) => identity !== null),
				],
			});
			const getIdentity = vi.fn(() => ({ id: "browser-user" }));
			const clientAuth = createClientAuth({
				authorization: publicAuthorization,
				getIdentity,
			});
			function ResolveStaticIdentity() {
				const { refetch } = clientAuth.useIdentity();
				useEffect(() => {
					void refetch();
				}, [refetch]);
				return null;
			}
			const ui = (
				<StackProvider
					stack={clientStack}
					auth={clientAuth}
					initialIdentity={initialIdentity}
				>
					{initialIdentity === null && <ResolveStaticIdentity />}
					<clientAuth.CanAccess
						permission={blogPermissions.post.read({ scope: "published" })}
						loading={<span>Loading posts</span>}
					>
						<h1>Published posts</h1>
					</clientAuth.CanAccess>
					<clientAuth.CanAccess
						permission={blogPermissions.post.create({ publish: "draft" })}
					>
						<button type="button">Write a post</button>
					</clientAuth.CanAccess>
				</StackProvider>
			);

			const serverHtml = renderToString(ui);
			expect(serverHtml.includes("<h1>Published posts</h1>")).toBe(
				initialIdentity === null,
			);
			expect(serverHtml.includes("Loading posts")).toBe(
				initialIdentity === undefined,
			);
			expect(serverHtml).not.toContain("Write a post");
			expect(getIdentity).not.toHaveBeenCalled();

			container.innerHTML = serverHtml;
			const onRecoverableError = vi.fn();
			await act(async () => {
				root = hydrateRoot(container, ui, { onRecoverableError });
			});
			expect(container.querySelector("h1")?.textContent).toBe(
				"Published posts",
			);
			expect(container.querySelector("button")?.textContent).toBe(
				"Write a post",
			);
			expect(getIdentity).toHaveBeenCalledOnce();
			expect(onRecoverableError).not.toHaveBeenCalled();
		},
	);

	it("keeps an unsupplied snapshot pending while the browser resolver runs", async () => {
		const getIdentity = vi.fn(() => new Promise<never>(() => {}));
		const clientAuth = createClientAuth({ authorization, getIdentity });
		const ui = (
			<StackProvider stack={clientStack} auth={clientAuth}>
				<clientAuth.CanAccess
					permission={permissions.delete({ id: "document-1" })}
					loading={<span>Checking</span>}
					fallback={<span>No access</span>}
				>
					<button type="button">Delete</button>
				</clientAuth.CanAccess>
			</StackProvider>
		);

		const serverHtml = renderToString(ui);
		expect(serverHtml).toContain("Checking");
		expect(getIdentity).not.toHaveBeenCalled();

		container.innerHTML = serverHtml;
		await act(async () => {
			root = hydrateRoot(container, ui);
		});

		expect(container.textContent).toBe("Checking");
		expect(getIdentity).toHaveBeenCalledOnce();
	});

	it("keeps authenticated gated UI stable and skips a duplicate browser identity request", async () => {
		const getIdentity = vi.fn(() => ({
			id: "browser-user",
			role: "user" as const,
		}));
		const clientAuth = createClientAuth({ authorization, getIdentity });
		const ui = (
			<StackProvider
				stack={clientStack}
				auth={clientAuth}
				initialIdentity={{ id: "server-user", role: "admin" }}
			>
				<clientAuth.CanAccess
					permission={permissions.delete({ id: "document-1" })}
					loading={<span>Checking</span>}
					fallback={<span>No access</span>}
				>
					<button type="button">Delete</button>
				</clientAuth.CanAccess>
			</StackProvider>
		);

		const serverHtml = renderToString(ui);
		expect(serverHtml).toContain("Delete");
		expect(serverHtml).not.toContain("Checking");
		expect(getIdentity).not.toHaveBeenCalled();

		container.innerHTML = serverHtml;
		const consoleError = vi
			.spyOn(console, "error")
			.mockImplementation(() => {});
		await act(async () => {
			root = hydrateRoot(container, ui);
		});

		expect(container.textContent).toBe("Delete");
		expect(getIdentity).not.toHaveBeenCalled();
		expect(consoleError).not.toHaveBeenCalled();
	});

	it("keeps an anonymous server snapshot settled across hydration", async () => {
		const getIdentity = vi.fn(() => ({
			id: "browser-user",
			role: "admin" as const,
		}));
		const clientAuth = createClientAuth({ authorization, getIdentity });
		const ui = (
			<StackProvider
				stack={clientStack}
				auth={clientAuth}
				initialIdentity={null}
			>
				<clientAuth.CanAccess
					permission={permissions.delete({ id: "document-1" })}
					loading={<span>Checking</span>}
					fallback={<span>No access</span>}
				>
					<button type="button">Delete</button>
				</clientAuth.CanAccess>
			</StackProvider>
		);

		const serverHtml = renderToString(ui);
		expect(serverHtml).toContain("No access");
		container.innerHTML = serverHtml;
		await act(async () => {
			root = hydrateRoot(container, ui);
		});

		expect(container.textContent).toBe("No access");
		expect(getIdentity).not.toHaveBeenCalled();
	});
});
