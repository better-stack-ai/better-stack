import { describe, expect, it } from "vitest";
import { PLUGINS } from "../constants";

const maintainedFrameworks = [
	"Next.js 15+ App Router",
	"React Router v7",
	"TanStack Start",
] as const;

function representativePlugin(key: "blog" | "form-builder" | "open-api") {
	const plugin = PLUGINS.find((candidate) => candidate.key === key);
	if (!plugin) throw new Error(`Missing plugin metadata for ${key}`);
	if (!plugin.decision) throw new Error(`Missing decision metadata for ${key}`);
	return { plugin, decision: plugin.decision };
}

describe("representative plugin decision metadata", () => {
	it.each(["blog", "form-builder", "open-api"] as const)(
		"publishes the shared evaluator contract for %s",
		(key) => {
			const { decision } = representativePlugin(key);

			expect(decision.releaseStatus).toBe("Preview");
			expect(decision.supportedFrameworks).toEqual(maintainedFrameworks);
			expect(decision.docsPath).toBe(`/plugins/${key}`);
			expect(decision.sourcePath).toContain(`/plugins/${key}`);
			expect(decision.supplies.length).toBeGreaterThan(0);
			expect(decision.adopterSupplies.length).toBeGreaterThan(0);
			expect(decision).not.toHaveProperty("audience");
			expect(decision).not.toHaveProperty("ownership");
			expect(decision).not.toHaveProperty("workflow");
			expect(decision).not.toHaveProperty("actions");
		},
	);

	it("describes Blog as the complete feature proof with a working live result", () => {
		const { plugin, decision } = representativePlugin("blog");

		expect(decision.topology).toBe("Full-stack");
		expect(plugin.backendImportPath).toBeDefined();
		expect(plugin.clientImportPath).toBeDefined();
		expect(decision.demoPath).toBe("https://www.better-stack.ai/p/blog");
		expect(decision.adopterSupplies).toContain(
			"An authorization policy when protected authoring operations are enabled",
		);
	});

	it("states the complete Form Builder data workflow without inventing a demo", () => {
		const { plugin, decision } = representativePlugin("form-builder");

		expect(decision.topology).toBe("Full-stack");
		expect(plugin.backendImportPath).toBeDefined();
		expect(plugin.clientImportPath).toBeDefined();
		expect(decision.demoPath).toBeUndefined();
		expect(decision.dependencies).toContain(
			"A database adapter with isolated transaction support",
		);
		expect(decision.adopterSupplies).toContain(
			"The public application route that mounts FormRenderer",
		);
		expect(decision.adopterSupplies).toContain(
			"An explicit public-access or permission policy for form reads and submissions when authorization is enabled",
		);
	});

	it("keeps OpenAPI backend-only and Scalar optional", () => {
		const { plugin, decision } = representativePlugin("open-api");

		expect(decision.topology).toBe("Backend-only");
		expect(plugin.backendImportPath).toBeDefined();
		expect(plugin.clientImportPath).toBeUndefined();
		expect(decision.demoPath).toBeUndefined();
		expect(decision.supplies).toContain(
			"A JSON schema endpoint at the configured API base path plus the fixed /open-api/schema suffix",
		);
		expect(decision.adopterSupplies).toContain(
			"Optional overrides for the API title, version, and reference path; defaults are BTST API, 1.0.0, and /reference",
		);
		expect(decision.externalServices).toEqual([
			"The optional Scalar reference loads @scalar/api-reference from jsDelivr",
		]);
	});
});
