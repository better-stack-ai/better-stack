import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import type { ComponentType } from "react";
import { StackProvider, usePluginOverrides } from "../context";
import type { StackApiConfig, StackRouterConfig } from "../context";

/**
 * Renders StackProvider with a probe child that captures the resolved
 * overrides for the given plugin, without needing a DOM.
 */
function resolveOverrides({
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
}): any {
	let captured: any;

	function Probe() {
		captured = usePluginOverrides(pluginName, defaultValues);
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
const PluginLink: ComponentType<any> = () => null;

describe("top-level router/api override resolution", () => {
	it("behaves exactly as before when no router/api is provided", () => {
		const blogOverrides = { navigate: () => {}, apiBaseURL: "x" };
		const resolved = resolveOverrides({
			pluginName: "blog",
			overrides: { blog: blogOverrides },
		});

		// Without router/api or defaults, the plugin overrides object is
		// returned as-is (same reference), matching the previous behavior.
		expect(resolved).toBe(blogOverrides);
	});

	it("returns undefined for unconfigured plugins when no router/api is provided", () => {
		const resolved = resolveOverrides({
			pluginName: "blog",
			overrides: {},
		});
		expect(resolved).toBeUndefined();
	});

	it("applies top-level router fields to every plugin", () => {
		const navigate = () => {};
		const refresh = () => {};
		const resolved = resolveOverrides({
			pluginName: "blog",
			overrides: { blog: {} },
			router: { Link: RouterLink, navigate, refresh },
		});

		expect(resolved.Link).toBe(RouterLink);
		expect(resolved.navigate).toBe(navigate);
		expect(resolved.refresh).toBe(refresh);
	});

	it("applies router fields even to plugins with no overrides block", () => {
		const resolved = resolveOverrides({
			pluginName: "kanban",
			overrides: {},
			router: { Link: RouterLink },
		});

		expect(resolved.Link).toBe(RouterLink);
	});

	it("maps api config to apiBaseURL/apiBasePath", () => {
		const resolved = resolveOverrides({
			pluginName: "blog",
			overrides: { blog: {} },
			api: { baseURL: "https://example.com", basePath: "/api/data" },
		});

		expect(resolved.apiBaseURL).toBe("https://example.com");
		expect(resolved.apiBasePath).toBe("/api/data");
	});

	it("per-plugin overrides beat the top-level router and api", () => {
		const routerNavigate = () => {};
		const pluginNavigate = () => {};
		const resolved = resolveOverrides({
			pluginName: "blog",
			overrides: {
				blog: {
					Link: PluginLink,
					navigate: pluginNavigate,
					apiBaseURL: "https://plugin.example.com",
				},
			},
			router: { Link: RouterLink, navigate: routerNavigate },
			api: { baseURL: "https://example.com", basePath: "/api/data" },
		});

		expect(resolved.Link).toBe(PluginLink);
		expect(resolved.navigate).toBe(pluginNavigate);
		expect(resolved.apiBaseURL).toBe("https://plugin.example.com");
		// Fields not overridden per plugin still come from the top level
		expect(resolved.apiBasePath).toBe("/api/data");
	});

	it("top-level router/api beat hook defaultValues", () => {
		const routerNavigate = () => {};
		const defaultNavigate = () => {};
		const resolved = resolveOverrides({
			pluginName: "blog",
			overrides: { blog: {} },
			router: { navigate: routerNavigate },
			api: { baseURL: "https://example.com", basePath: "/api/data" },
			defaultValues: {
				navigate: defaultNavigate,
				apiBaseURL: "https://default.example.com",
				localization: { TITLE: "Default" },
			},
		});

		expect(resolved.navigate).toBe(routerNavigate);
		expect(resolved.apiBaseURL).toBe("https://example.com");
		// Defaults not managed by router/api survive
		expect(resolved.localization).toEqual({ TITLE: "Default" });
	});

	it("undefined router fields do not clobber hook defaults", () => {
		const defaultNavigate = () => {};
		const resolved = resolveOverrides({
			pluginName: "blog",
			overrides: { blog: {} },
			router: { Link: RouterLink, navigate: undefined },
			defaultValues: { navigate: defaultNavigate },
		});

		expect(resolved.Link).toBe(RouterLink);
		expect(resolved.navigate).toBe(defaultNavigate);
	});

	it("evaluates the preset useRouter hook and merges its result over static fields", () => {
		const staticNavigate = () => {};
		const hookNavigate = () => {};
		const hookRefresh = () => {};
		const resolved = resolveOverrides({
			pluginName: "blog",
			overrides: { blog: {} },
			router: {
				Link: RouterLink,
				navigate: staticNavigate,
				useRouter: () => ({ navigate: hookNavigate, refresh: hookRefresh }),
			},
		});

		// Hook result wins over the static preset field
		expect(resolved.navigate).toBe(hookNavigate);
		expect(resolved.refresh).toBe(hookRefresh);
		// Static fields not returned by the hook survive
		expect(resolved.Link).toBe(RouterLink);
	});

	it("works without an overrides prop at all", () => {
		const navigate = () => {};
		const resolved = resolveOverrides({
			pluginName: "blog",
			router: { navigate },
			api: { baseURL: "https://example.com", basePath: "/api/data" },
		});

		expect(resolved.navigate).toBe(navigate);
		expect(resolved.apiBaseURL).toBe("https://example.com");
	});
});
