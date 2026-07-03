import { describe, it, expect } from "vitest";
import { defineClientPlugin } from "../plugins/client";
import type { ComponentType, ReactElement } from "react";
import { defineRoute, defineRoutes } from "@btst/yar";

/**
 * Default page components used by the mock plugin factory.
 * These stand in for the real plugin page components (e.g. HomePageComponent).
 */
const DefaultListComponent = () => <div>Default List</div>;
const DefaultDetailComponent: ComponentType<{ id: string }> = ({ id }) => (
	<div>Default Detail {id}</div>
);

/**
 * Renders a bound page component (context injected as props) and returns the
 * produced element for inspection, without needing a DOM.
 */
function renderBound(
	Component: ComponentType<Record<string, unknown>> | undefined,
): ReactElement<Record<string, unknown>> | null {
	if (!Component) return null;
	return (
		Component as (
			props: Record<string, unknown>,
		) => ReactElement<Record<string, unknown>>
	)({});
}

/**
 * Lightweight mock plugin factory that mirrors the real plugin pattern:
 * - Declares routes with defineRoute
 * - Applies the optional `pageComponents` config via defineRoutes' pages option
 */
function createTestPlugin(config: {
	pageComponents?: {
		list?: ComponentType;
		detail?: ComponentType<{ params: { id: string } }>;
	};
}) {
	return defineClientPlugin({
		name: "test",
		routes: () =>
			defineRoutes(
				{
					list: defineRoute("/items", { page: DefaultListComponent }),
					detail: defineRoute("/items/:id", {
						page: ({ params }) => <DefaultDetailComponent id={params.id} />,
					}),
				},
				{ pages: config.pageComponents },
			),
	});
}

describe("pageComponents overrides", () => {
	describe("default components used when no override provided", () => {
		it("uses the default component for a no-param route", () => {
			const plugin = createTestPlugin({});
			const routes = plugin.routes();
			const routeData = routes.list();

			const element = renderBound(routeData.PageComponent);
			expect(element?.type).toBe(DefaultListComponent);
		});

		it("uses the default component wrapper for a param route", () => {
			const plugin = createTestPlugin({});
			const routes = plugin.routes();
			const routeData = routes.detail({ params: { id: "42" } });

			expect(routeData.PageComponent).toBeDefined();
			expect(typeof routeData.PageComponent).toBe("function");

			// The default page receives the route context and forwards params.id
			const element = renderBound(routeData.PageComponent);
			expect(element?.props.params).toEqual({ id: "42" });
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

			const element = renderBound(routeData.PageComponent);
			expect(element?.type).toBe(CustomList);
			expect(element?.type).not.toBe(DefaultListComponent);
		});

		it("leaves other routes using their defaults when only one is overridden", () => {
			const CustomList: ComponentType = () => <div>Custom List</div>;

			const plugin = createTestPlugin({
				pageComponents: { list: CustomList },
			});
			const routes = plugin.routes();

			// list uses custom
			const listElement = renderBound(routes.list().PageComponent);
			expect(listElement?.type).toBe(CustomList);

			// detail still uses its default wrapper (no override)
			const detailData = routes.detail({ params: { id: "1" } });
			const detailElement = renderBound(detailData.PageComponent);
			expect(detailElement?.type).not.toBe(CustomList);
		});
	});

	describe("custom component replaces default (param route)", () => {
		it("passes the route context to the override as props", () => {
			const CustomDetail: ComponentType<{ params: { id: string } }> = ({
				params,
			}) => <div>Custom Detail {params.id}</div>;

			const plugin = createTestPlugin({
				pageComponents: { detail: CustomDetail },
			});
			const routes = plugin.routes();
			const routeData = routes.detail({ params: { id: "42" } });

			const element = renderBound(routeData.PageComponent);
			expect(element?.type).toBe(CustomDetail);
			expect(element?.props.params).toEqual({ id: "42" });
		});

		it("produces a different PageComponent than when no override is given", () => {
			const CustomDetail: ComponentType<{ params: { id: string } }> = ({
				params,
			}) => <div>Custom Detail {params.id}</div>;

			const defaultPlugin = createTestPlugin({});
			const overridePlugin = createTestPlugin({
				pageComponents: { detail: CustomDetail },
			});

			const defaultElement = renderBound(
				defaultPlugin.routes().detail({ params: { id: "1" } }).PageComponent,
			);
			const overrideElement = renderBound(
				overridePlugin.routes().detail({ params: { id: "1" } }).PageComponent,
			);

			expect(overrideElement?.type).toBe(CustomDetail);
			expect(defaultElement?.type).not.toBe(CustomDetail);
		});
	});
});
