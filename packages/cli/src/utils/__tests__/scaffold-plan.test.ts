import { describe, expect, it } from "vitest";
import { buildScaffoldPlan } from "../scaffold-plan";

describe("scaffold plan", () => {
	it("builds expected files for nextjs", async () => {
		const plan = await buildScaffoldPlan({
			framework: "nextjs",
			adapter: "memory",
			plugins: ["blog"],
			alias: "@/",
			cssFile: "app/globals.css",
		});

		expect(plan.files.map((file) => file.path)).toEqual([
			"lib/stack.ts",
			"lib/stack-client.tsx",
			"lib/query-client.ts",
			"app/api/data/[[...all]]/route.ts",
			"app/pages/[[...all]]/page.tsx",
			"app/pages/layout.tsx",
		]);
		expect(plan.files[0]?.content).toContain("blogBackendPlugin()");
		expect(plan.files[1]?.content).toContain("blogClientPlugin");
	});
});
