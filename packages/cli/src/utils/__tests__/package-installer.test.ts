import { beforeEach, describe, expect, it, vi } from "vitest";

const { execa } = vi.hoisted(() => ({ execa: vi.fn() }));

vi.mock("execa", () => ({ execa }));

import { installInitDependencies } from "../package-installer";

describe("installInitDependencies", () => {
	beforeEach(() => {
		execa.mockReset();
		execa.mockResolvedValue({});
	});

	it("installs the corrected Better Auth UI cohort only when selected", async () => {
		await installInitDependencies({
			cwd: "/tmp/example",
			packageManager: "pnpm",
			adapter: "drizzle",
			plugins: ["better-auth-ui"],
		});

		const installArguments = execa.mock.calls[0]?.[1] as string[];
		expect(installArguments).toContain("@btst/stack@3.0.0");
		expect(installArguments).toContain("@btst/adapter-drizzle@2.2.3");
		expect(installArguments).toContain("drizzle-orm@0.45.2");
		expect(installArguments).toContain("@btst/better-auth-ui@2.0.0");
		expect(installArguments).toContain("better-auth@1.6.16");
		expect(installArguments).toContain("@better-auth/core@1.6.16");
		expect(installArguments).toContain("@better-auth/utils@0.4.1");
		expect(installArguments).toContain("@better-fetch/fetch@1.2.2");
		expect(installArguments).toContain("better-call@1.3.6");
		expect(installArguments).toContain("@better-auth/api-key@1.6.16");
		expect(installArguments).toContain("@better-auth/passkey@1.6.16");
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
		expect(installArguments.join(" ")).not.toContain("better-auth-ui");
		expect(installArguments.join(" ")).not.toContain("better-auth@");
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
