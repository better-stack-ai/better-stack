import { describe, expect, it } from "vitest";
import { PLUGINS } from "../constants";
import type { PluginKey } from "../../types";

const maintainedFrameworks = [
	"Next.js 15+ App Router",
	"React Router v7",
	"TanStack Start",
] as const;

const releasedPluginKeys = [
	"blog",
	"ai-chat",
	"cms",
	"form-builder",
	"ui-builder",
	"kanban",
	"comments",
	"media",
	"route-docs",
	"open-api",
	"better-auth-ui",
] as const satisfies readonly PluginKey[];

function releasedPlugin(key: PluginKey) {
	const plugin = PLUGINS.find((candidate) => candidate.key === key);
	if (!plugin) throw new Error(`Missing plugin metadata for ${key}`);
	if (!plugin.decision) throw new Error(`Missing decision metadata for ${key}`);
	return { plugin, decision: plugin.decision };
}

describe("released plugin decision metadata", () => {
	it.each(releasedPluginKeys)(
		"publishes the shared evaluator contract for %s",
		(key) => {
			const { decision } = releasedPlugin(key);

			expect(decision.releaseStatus).toBe("Preview");
			expect(decision.supportedFrameworks).toEqual(maintainedFrameworks);
			expect(decision.docsPath).toBe(`/plugins/${key}`);
			expect(decision.sourcePath).toMatch(
				/^https:\/\/github\.com\/better-stack-ai\//,
			);
			expect(decision.supplies.length).toBeGreaterThan(0);
			expect(decision.adopterSupplies.length).toBeGreaterThan(0);
			expect(decision).not.toHaveProperty("audience");
			expect(decision).not.toHaveProperty("ownership");
			expect(decision).not.toHaveProperty("workflow");
			expect(decision).not.toHaveProperty("actions");
		},
	);

	it("covers the released CLI inventory without roadmap records", () => {
		expect(PLUGINS.map((plugin) => plugin.key)).toEqual(releasedPluginKeys);
		expect(
			PLUGINS.filter((plugin) => plugin.decision).map((plugin) => plugin.key),
		).toEqual(releasedPluginKeys);
	});

	it("describes Blog as the complete feature proof with a working live result", () => {
		const { plugin, decision } = releasedPlugin("blog");

		expect(decision.topology).toBe("Full-stack");
		expect(plugin.backendImportPath).toBeDefined();
		expect(plugin.clientImportPath).toBeDefined();
		expect(decision.demoPath).toBe("https://www.better-stack.ai/p/blog");
		expect(decision.adopterSupplies).toContain(
			"An authorization policy when protected authoring operations are enabled",
		);
	});

	it("states the complete Form Builder data workflow without inventing a demo", () => {
		const { plugin, decision } = releasedPlugin("form-builder");

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
		const { plugin, decision } = releasedPlugin("open-api");

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

	it("states the AI Chat model, persistence, and ownership boundaries", () => {
		const { plugin, decision } = releasedPlugin("ai-chat");

		expect(decision.topology).toBe("Full-stack");
		expect(plugin.backendImportPath).toBeDefined();
		expect(plugin.clientImportPath).toBeDefined();
		expect(decision.demoPath).toBe(
			"https://www.better-stack.ai/playground?plugins=ai-chat&view=preview",
		);
		expect(decision.dependencies).toContain(
			"A database adapter with isolated transaction support for authenticated persistence",
		);
		expect(decision.adopterSupplies).toContain(
			"An AI SDK model provider, credentials, usage policy, and provider billing",
		);
	});

	it("separates CMS content modeling from application-owned public rendering", () => {
		const { decision } = releasedPlugin("cms");

		expect(decision.topology).toBe("Full-stack");
		expect(decision.demoPath).toBe(
			"https://www.better-stack.ai/playground?plugins=cms&view=preview",
		);
		expect(decision.adopterSupplies).toContain(
			"Code-defined Zod content types and application-owned public rendering",
		);
	});

	it("keeps UI Builder client-only and dependent on CMS", () => {
		const { plugin, decision } = releasedPlugin("ui-builder");

		expect(decision.topology).toBe("Client-only");
		expect(decision.relationship).toBe("Dependent");
		expect(plugin.clientImportPath).toBeDefined();
		expect(decision.dependencies).toContain(
			"The CMS plugin, added automatically by the CLI",
		);
		expect(decision.demoPath).toBe(
			"https://www.better-stack.ai/playground?plugins=ui-builder&view=preview",
		);
	});

	it("keeps Kanban full-stack while leaving identities and policy to the app", () => {
		const { decision } = releasedPlugin("kanban");

		expect(decision.topology).toBe("Full-stack");
		expect(decision.demoPath).toBe(
			"https://www.better-stack.ai/playground?plugins=kanban&view=preview",
		);
		expect(decision.adopterSupplies).toContain(
			"Authorization rules plus user search and identity resolution when assignees are enabled",
		);
	});

	it("does not invent standalone demos for embedded or infrastructure plugins", () => {
		for (const key of ["comments", "media", "route-docs"] as const) {
			expect(releasedPlugin(key).decision.demoPath).toBeUndefined();
		}
		expect(releasedPlugin("comments").decision.topology).toBe("Full-stack");
		expect(releasedPlugin("media").decision.topology).toBe("Full-stack");
		expect(releasedPlugin("route-docs").decision.topology).toBe("Client-only");
	});

	it("describes Better Auth UI as a client-only companion, not an auth backend", () => {
		const { plugin, decision } = releasedPlugin("better-auth-ui");

		expect(decision.topology).toBe("Client-only");
		expect(decision.relationship).toBe("Companion");
		expect(plugin.backendImportPath).toBeUndefined();
		expect(decision.dependencies).toContain(
			"An existing Better Auth backend and browser client",
		);
		expect(decision.demoPath).toBeUndefined();
	});
});
