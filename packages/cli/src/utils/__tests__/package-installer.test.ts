import { beforeEach, describe, expect, it, vi } from "vitest";

const { execa } = vi.hoisted(() => ({ execa: vi.fn() }));

vi.mock("execa", () => ({ execa }));

import { installInitDependencies } from "../package-installer";
import { PLUGINS } from "../constants";

describe("installInitDependencies", () => {
	beforeEach(() => {
		execa.mockReset();
		execa.mockResolvedValue({});
	});

	it("never installs a provider-specific authentication cohort", async () => {
		await installInitDependencies({
			cwd: "/tmp/example",
			packageManager: "pnpm",
			adapter: "drizzle",
			plugins: PLUGINS.map((plugin) => plugin.key),
		});

		const installArguments = execa.mock.calls[0]?.[1] as string[];
		expect(installArguments).toContain("@btst/adapter-drizzle@2.2.3");
		expect(installArguments).toContain("drizzle-orm@0.45.2");
		expect(installArguments.join(" ")).not.toContain(
			["@btst", "better-auth-ui"].join("/"),
		);
		expect(installArguments.join(" ")).not.toContain(
			["better", "auth"].join("-"),
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
