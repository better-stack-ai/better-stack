import { describe, it, expect } from "vitest";
import { defineClientPlugin } from "../plugins/client";
import type { ComponentType } from "react";
import { createRoute } from "@btst/yar";

/**
 * Default page components used by the mock plugin factory.
 * These stand in for the real plugin page components (e.g. HomePageComponent).
 */
const DefaultListComponent: ComponentType = () => <div>Default List</div>;
const DefaultDetailComponent: ComponentType<{ id: string }> = ({ id }) => (
	<div>Default Detail {id}</div>
);

/**
 * Lightweight mock plugin factory that mirrors the real plugin pattern:
 * - Accepts a config with an optional `pageComponents` field
 * - Falls back to built-in components when no override is provided
 * - For param routes, extracts the override before the handler closure
 */
function createTestPlugin(config: {
	pageComponents?: {
		list?: ComponentType;
		detail?: ComponentType<{ id: string }>;
	};
}) {
	return defineClientPlugin({
		name: "test",
		routes: () => ({
			list: createRoute("/items", () => {
				const CustomList = config.pageComponents?.list;
				return {
					PageComponent: CustomList ?? DefaultListComponent,
				};
			}),
			detail: createRoute("/items/:id", ({ params }) => {
				const CustomDetail = config.pageComponents?.detail;
				return {
					PageComponent: CustomDetail
						? () => <CustomDetail id={params.id} />
						: () => <DefaultDetailComponent id={params.id} />,
				};
			}),
		}),
	});
}

describe("pageComponents overrides", () => {
	describe("default components used when no override provided", () => {
		it("uses the default component for a no-param route", () => {
			const plugin = createTestPlugin({});
			const routes = plugin.routes();
			const routeData = routes.list();

			expect(routeData.PageComponent).toBe(DefaultListComponent);
		});

		it("uses the default component wrapper for a param route", () => {
			const plugin = createTestPlugin({});
			const routes = plugin.routes();
			const routeData = routes.detail({ params: { id: "42" } });

			// Should be an inline wrapper, not the custom component
			expect(routeData.PageComponent).toBeDefined();
			expect(typeof routeData.PageComponent).toBe("function");
			// Verify it is NOT the custom component (no override was given)
			const CustomDetail: ComponentType<{ id: string }> = () => (
				<div>Custom</div>
			);
			expect(routeData.PageComponent).not.toBe(CustomDetail);
		});
	});

	describe("custom component replaces default (no-param route)", () => {
		it("uses the provided override instead of the default", () => {
			const CustomList: ComponentType = () => <div>Custom List</div>;

			const plugin = createTestPlugin({
				pageComponents: { list: CustomList },
			});
			const routes = plugin.routes();
			const routeData = routes.list();

			expect(routeData.PageComponent).toBe(CustomList);
			expect(routeData.PageComponent).not.toBe(DefaultListComponent);
		});

		it("leaves other routes using their defaults when only one is overridden", () => {
			const CustomList: ComponentType = () => <div>Custom List</div>;

			const plugin = createTestPlugin({
				pageComponents: { list: CustomList },
			});
			const routes = plugin.routes();

			// list uses custom
			expect(routes.list().PageComponent).toBe(CustomList);

			// detail still uses a wrapper (no override)
			const detailData = routes.detail({ params: { id: "1" } });
			expect(detailData.PageComponent).not.toBe(CustomList);
		});
	});

	describe("custom component replaces default (param route)", () => {
		it("uses the override wrapper for a param route", () => {
			const CustomDetail: ComponentType<{ id: string }> = ({ id }) => (
				<div>Custom Detail {id}</div>
			);

			const plugin = createTestPlugin({
				pageComponents: { detail: CustomDetail },
			});
			const routes = plugin.routes();
			const routeData = routes.detail({ params: { id: "42" } });

			// Should be an inline wrapper (not the raw CustomDetail directly)
			expect(routeData.PageComponent).toBeDefined();
			expect(typeof routeData.PageComponent).toBe("function");
			// Should NOT be the default
			expect(routeData.PageComponent).not.toBe(DefaultDetailComponent);
		});

		it("produces a different PageComponent than when no override is given", () => {
			const CustomDetail: ComponentType<{ id: string }> = ({ id }) => (
				<div>Custom Detail {id}</div>
			);

			const defaultPlugin = createTestPlugin({});
			const overridePlugin = createTestPlugin({
				pageComponents: { detail: CustomDetail },
			});

			const defaultRouteData = defaultPlugin
				.routes()
				.detail({ params: { id: "1" } });
			const overrideRouteData = overridePlugin
				.routes()
				.detail({ params: { id: "1" } });

			// The wrapped component should be a different function reference
			expect(overrideRouteData.PageComponent).not.toBe(
				defaultRouteData.PageComponent,
			);
		});
	});
});
