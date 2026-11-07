import { beforeEach, describe, expect, it, vi } from "vitest";

const { execa } = vi.hoisted(() => ({ execa: vi.fn() }));

vi.mock("execa", () => ({ execa }));

import { installInitDependencies } from "../package-installer";

describe("installInitDependencies", () => {
	beforeEach(() => {
		execa.mockReset();
		execa.mockResolvedValue({});
	});

	it("installs Job Board's tested CMS and Form Builder code packages", async () => {
		await installInitDependencies({
			cwd: "/tmp/example",
			packageManager: "pnpm",
			adapter: "memory",
			plugins: ["cms", "job-board"],
		});
		const args = execa.mock.calls[0]?.[1] as string[];
		expect(args).toContain("@btst/plugin-cms@1.2.0-beta.0");
		expect(args).toContain("@btst/plugin-job-board@1.1.0-beta.0");
		expect(args).toContain("@btst/plugin-form-builder@1.2.0-beta.0");
	});

	it("installs Ecommerce's tested CMS and Media code packages without optional provider SDKs", async () => {
		await installInitDependencies({
			cwd: "/tmp/example",
			packageManager: "pnpm",
			adapter: "memory",
			plugins: ["cms", "ecommerce"],
		});
		const args = execa.mock.calls[0]?.[1] as string[];
		expect(args).toContain("@btst/plugin-cms@1.2.0-beta.0");
		expect(args).toContain("@btst/plugin-ecommerce@1.2.0-beta.0");
		expect(args).toContain("@btst/plugin-media@1.1.0-beta.0");
		expect(args.some((arg) => arg.startsWith("@vercel/blob"))).toBe(false);
		expect(args.some((arg) => arg.startsWith("@aws-sdk/"))).toBe(false);
	});

	it("installs the tested Media package without optional storage providers for local uploads", async () => {
		await installInitDependencies({
			cwd: "/tmp/example",
			packageManager: "pnpm",
			adapter: "memory",
			plugins: ["media"],
		});
		const args = execa.mock.calls[0]?.[1] as string[];
		expect(args).toContain("@btst/plugin-media@1.1.0-beta.0");
		expect(args.some((arg) => arg.startsWith("@vercel/blob"))).toBe(false);
		expect(args.some((arg) => arg.startsWith("@aws-sdk/"))).toBe(false);
	});

	it("installs the tested core and independently selected AI Chat versions", async () => {
		await installInitDependencies({
			cwd: "/tmp/example",
			packageManager: "pnpm",
			adapter: "memory",
			plugins: ["ai-chat"],
		});
		const args = execa.mock.calls[0]?.[1] as string[];
		expect(args).toContain("@btst/stack@6.2.0-beta.0");
		expect(args).toContain("@btst/plugin-ai-chat@1.1.0-beta.0");
		expect(args).toContain("lucide-react@0.475.0");
		expect(args).toContain("--save-exact");
		expect(args.some((arg) => arg.startsWith("@btst/plugin-blog"))).toBe(false);
	});

	it("installs the corrected Better Auth UI cohort only when selected", async () => {
		await installInitDependencies({
			cwd: "/tmp/example",
			packageManager: "pnpm",
			adapter: "drizzle",
			plugins: ["better-auth-ui"],
		});

		const installArguments = execa.mock.calls[0]?.[1] as string[];
		expect(installArguments).toContain("@btst/stack@6.2.0-beta.0");
		expect(installArguments).toContain("next-themes@0.4.6");
		expect(installArguments).toContain("@btst/adapter-drizzle@3.0.1");
		expect(installArguments).toContain("drizzle-orm@0.45.2");
		expect(installArguments).toContain("@btst/better-auth-ui@3.0.3");
		expect(installArguments).toContain("better-auth@1.7.14");
		expect(installArguments).toContain("@better-auth/core@1.7.14");
		expect(installArguments).toContain("@better-auth/utils@0.5.1");
		expect(installArguments).toContain("@better-fetch/fetch@1.3.3");
		expect(installArguments).toContain("better-call@1.4.4");
		expect(installArguments).toContain("@better-auth/api-key@1.7.14");
		expect(installArguments).toContain("@better-auth/passkey@1.7.14");
		expect(execa).toHaveBeenCalledTimes(1);
	});

	it("does not install Better Auth UI for the default scaffold", async () => {
		await installInitDependencies({
			cwd: "/tmp/example",
			packageManager: "pnpm",
			adapter: "memory",
			plugins: [],
		});

		const installArguments = execa.mock.calls[0]?.[1] as string[];
		expect(installArguments).toContain("next-themes@0.4.6");
		expect(installArguments).toContain("@tanstack/react-query@5.105.0");
		expect(installArguments).toContain("@tanstack/query-core@5.105.0");
		expect(installArguments.join(" ")).not.toContain("better-auth-ui");
		expect(installArguments.join(" ")).not.toContain("better-auth@");
	});

	it("installs stable Prisma and AI SDK cohorts instead of unqualified latest tags", async () => {
		await installInitDependencies({
			cwd: "/tmp/example",
			packageManager: "pnpm",
			adapter: "prisma",
			plugins: ["ai-chat"],
		});
		const args = execa.mock.calls[0]?.[1] as string[];
		expect(args).toContain("@prisma/adapter-pg@7.10.1");
		expect(args).not.toContain("@prisma/adapter-pg");
		expect(args).toContain("@ai-sdk/openai@4.0.104");
		expect(args).toContain("@ai-sdk/react@4.0.159");
		expect(args).toContain("ai@7.0.155");
	});

	it("saves npm runtime versions exactly", async () => {
		await installInitDependencies({
			cwd: "/tmp/example",
			packageManager: "npm",
			adapter: "memory",
			plugins: [],
		});

		expect(execa.mock.calls[0]?.[1]).toContain("--save-exact");
		expect(execa).toHaveBeenCalledTimes(1);
	});
});
