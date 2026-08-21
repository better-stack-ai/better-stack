import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import type { ComponentType } from "react";
import { StackProvider, usePluginOverrides, useStack } from "../context";
import type { StackApiConfig, StackRouterConfig } from "../context";

function resolveProvider({
	pluginName,
	overrides,
	router,
	api,
	defaultValues,
}: {
	pluginName: string;
	overrides?: Record<string, any>;
	router?: StackRouterConfig;
	api?: StackApiConfig;
	defaultValues?: Record<string, any>;
}) {
	let captured: any;

	function Probe() {
		captured = {
			stack: useStack(),
			overrides: usePluginOverrides(pluginName, defaultValues),
		};
		return null;
	}

	renderToString(
		<StackProvider
			basePath="/pages"
			overrides={overrides}
			router={router}
			api={api}
		>
			<Probe />
		</StackProvider>,
	);

	return captured;
}

const RouterLink: ComponentType<any> = () => null;

describe("top-level router/api context", () => {
	it("keeps plugin overrides plugin-specific", () => {
		const blogOverrides = { uploadImage: () => Promise.resolve("image") };
		const resolved = resolveProvider({
			pluginName: "blog",
			overrides: { blog: blogOverrides },
			router: { Link: RouterLink, navigate: () => {} },
			api: { baseURL: "https://example.com", basePath: "/api/data" },
		});

		expect(resolved.overrides).toBe(blogOverrides);
		expect(resolved.overrides).not.toHaveProperty("Link");
		expect(resolved.overrides).not.toHaveProperty("apiBaseURL");
	});

	it("returns an empty override object for an unconfigured plugin", () => {
		const resolved = resolveProvider({ pluginName: "blog" });
		expect(resolved.overrides).toEqual({});
	});

	it("exposes router and API config only at the top level", () => {
		const navigate = () => {};
		const refresh = () => {};
		const api = { baseURL: "https://example.com", basePath: "/api/data" };
		const resolved = resolveProvider({
			pluginName: "blog",
			router: { Link: RouterLink, navigate, refresh },
			api,
		});

		expect(resolved.stack.router).toMatchObject({
			Link: RouterLink,
			navigate,
			refresh,
		});
		expect(resolved.stack.api).toBe(api);
		expect(resolved.overrides).toEqual({});
	});

	it("merges plugin defaults with plugin overrides", () => {
		const resolved = resolveProvider({
			pluginName: "blog",
			overrides: { blog: { showAttribution: false } },
			defaultValues: {
				showAttribution: true,
				localization: { TITLE: "Default" },
			},
		});

		expect(resolved.overrides).toEqual({
			showAttribution: false,
			localization: { TITLE: "Default" },
		});
	});

	it("evaluates the preset useRouter hook over static fields", () => {
		const staticNavigate = () => {};
		const hookNavigate = () => {};
		const hookRefresh = () => {};
		const resolved = resolveProvider({
			pluginName: "blog",
			router: {
				Link: RouterLink,
				navigate: staticNavigate,
				useRouter: () => ({ navigate: hookNavigate, refresh: hookRefresh }),
			},
		});

		expect(resolved.stack.router.navigate).toBe(hookNavigate);
		expect(resolved.stack.router.refresh).toBe(hookRefresh);
		expect(resolved.stack.router.Link).toBe(RouterLink);
	});
});
