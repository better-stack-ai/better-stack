import { beforeEach, describe, expect, it, vi } from "vitest";

const { execa } = vi.hoisted(() => ({ execa: vi.fn() }));

vi.mock("execa", () => ({ execa }));

import { installInitDependencies } from "../package-installer";

describe("installInitDependencies", () => {
	beforeEach(() => {
		execa.mockReset();
		execa.mockResolvedValue({});
	});

	it("installs the coherent v3 auth and Drizzle release cohort", async () => {
		await installInitDependencies({
			cwd: "/tmp/example",
			packageManager: "pnpm",
			adapter: "drizzle",
			plugins: ["better-auth-ui"],
		});

		expect(execa).toHaveBeenCalledWith(
			"pnpm",
			[
				"add",
				"@btst/stack@next",
				"@btst/yar@1.3.2",
				"@tanstack/react-query@5.100.14",
				"@btst/adapter-drizzle@2.2.3",
				"drizzle-orm@0.45.2",
				"@btst/better-auth-ui@2.0.0-rc.1",
				"better-auth@1.6.16",
				"@better-auth/core@1.6.16",
				"@better-auth/api-key@1.6.16",
				"@better-auth/passkey@1.6.16",
				"@better-auth/utils@0.4.1",
				"@better-fetch/fetch@1.2.2",
				"better-call@1.3.6",
				"@better-auth/drizzle-adapter@1.6.16",
			],
			{ cwd: "/tmp/example", stdio: "inherit" },
		);
		expect(execa).toHaveBeenCalledTimes(1);
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
