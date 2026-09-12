// @vitest-environment jsdom
import * as React from "react";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { act } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import ts from "typescript";
import { z } from "zod";
import { defineAuthorization } from "../authorization";
import { createClientAuth } from "../authorization/client";
import { createClientStack } from "../client";
import { StackProvider, useIdentity } from "../context";
import { blogPermissions } from "../plugins/blog/permissions";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

// Execute the shipped templates. Only framework/application imports are injected;
// identity state, permission evaluation, SSR, effects and hydration are real.
function compile(source: string, modules: Record<string, unknown>) {
	const { outputText } = ts.transpileModule(source, {
		compilerOptions: {
			module: ts.ModuleKind.CommonJS,
			jsx: ts.JsxEmit.ReactJSX,
		},
	});
	const exports: Record<string, any> = {};
	new Function("require", "exports", outputText)((name: string) => {
		if (!(name in modules)) throw new Error(`Unexpected import: ${name}`);
		return modules[name];
	}, exports);
	return exports;
}

it("generated static Blog layout serves public HTML and resolves the browser session", async () => {
	const authorization = defineAuthorization({
		identity: z.object({ id: z.string() }),
		permissions: [blogPermissions] as const,
		rules: ({ blog }) => [
			blog.post.read.when(({ facts }) => facts.scope === "published"),
			blog.post.create.when(({ identity }) => identity !== null),
		],
	});
	const getIdentity = vi.fn(() => ({ id: "browser-user" }));
	const clientAuth = createClientAuth({ authorization, getIdentity });
	const queryClient = new QueryClient();
	const stack = createClientStack({
		api: { baseURL: "https://app.example", basePath: "/api/data" },
		site: { baseURL: "https://app.example", basePath: "/pages" },
		queryClient,
		plugins: {},
	});
	const jsxRuntime = await import("react/jsx-runtime");
	const { buildScaffoldPlan } = await import(
		pathToFileURL(resolve(process.cwd(), "../cli/dist/lib.mjs")).href
	);
	const plan = await buildScaffoldPlan({
		framework: "nextjs",
		adapter: "memory",
		plugins: ["blog"],
		alias: "@/",
		cssFile: "app/globals.css",
	});
	const generated = (path: string) =>
		plan.files.find((file: { path: string }) => file.path === path)
			.content as string;
	const modules = {
		react: React,
		"react/jsx-runtime": jsxRuntime,
		"@tanstack/react-query": { QueryClientProvider },
		"@btst/stack/context": {
			StackProvider: (props: React.ComponentProps<typeof StackProvider>) => (
				<StackProvider {...props} auth={clientAuth} />
			),
			useIdentity,
		},
		"@btst/stack/next": { nextRouter: () => undefined },
		"@/lib/query-client": { getOrCreateQueryClient: () => queryClient },
		"@/lib/stack-client": { getStackClient: () => stack },
	};
	const client = compile(generated("app/pages/client-layout.tsx"), modules);
	const { default: Layout } = compile(
		generated("app/(static)/pages/layout.tsx"),
		{
			"react/jsx-runtime": jsxRuntime,
			"../../pages/client-layout": client,
			"@/lib/stack-client.server": { getServerClientOrigins: () => ({}) },
		},
	);
	const ui = (
		<Layout>
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
		</Layout>
	);
	const html = renderToString(ui);
	expect(html).toContain("<h1>Published posts</h1>");
	expect(html).not.toContain("Loading posts");
	expect(html).not.toContain("Write a post");
	expect(getIdentity).not.toHaveBeenCalled();
	const container = document.createElement("div");
	container.innerHTML = html;
	const onRecoverableError = vi.fn();
	let root: ReturnType<typeof hydrateRoot> | undefined;
	try {
		await act(async () => {
			root = hydrateRoot(container, ui, { onRecoverableError });
		});
		expect(container.querySelector("h1")?.textContent).toBe("Published posts");
		expect(container.querySelector("button")?.textContent).toBe("Write a post");
		expect(getIdentity).toHaveBeenCalledOnce();
		expect(onRecoverableError).not.toHaveBeenCalled();
	} finally {
		await act(async () => root?.unmount());
		queryClient.clear();
	}
});
