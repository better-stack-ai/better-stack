import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { createClientStack } from "../../../client";
import { defineClientPlugin, defineRoute } from "../../../plugins/client";
import { analyticsClientPlugin } from "../client/plugin";

describe("analytics client composition", () => {
	it("keeps the analytics route alongside another plugin's dashboard route", () => {
		const stack = createClientStack({
			api: { baseURL: "https://site.test", basePath: "/api/data" },
			site: { baseURL: "https://site.test", basePath: "/pages" },
			queryClient: new QueryClient(),
			plugins: {
				analytics: analyticsClientPlugin(),
				cms: defineClientPlugin({
					id: "cms",
					resolve: () => ({
						routes: () => ({
							dashboard: defineRoute("/cms", { page: () => null }),
						}),
					}),
				}),
			},
		});
		expect(stack.router.getRoute("/analytics")?.PageComponent).toBeDefined();
		expect(stack.router.getRoute("/cms")?.PageComponent).toBeDefined();
	});
});
