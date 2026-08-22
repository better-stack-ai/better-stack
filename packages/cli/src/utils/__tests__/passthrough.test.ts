import { beforeEach, describe, expect, it, vi } from "vitest";

const { execa } = vi.hoisted(() => ({ execa: vi.fn() }));

vi.mock("execa", () => ({ execa }));

import { runCliPassthrough } from "../passthrough";

describe("runCliPassthrough", () => {
	beforeEach(() => {
		execa.mockReset();
		execa.mockResolvedValue({});
	});

	it("runs the aligned Better DB CLI outside the consumer dependency graph", async () => {
		await expect(
			runCliPassthrough({
				cwd: "/tmp/example",
				command: "generate",
				args: ["--orm=drizzle"],
			}),
		).resolves.toBe(0);

		expect(execa).toHaveBeenCalledWith(
			"npx",
			["--yes", "@btst/cli@2.2.3", "generate", "--orm=drizzle"],
			{ cwd: "/tmp/example", stdio: "inherit" },
		);
	});
});
