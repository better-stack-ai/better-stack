import { describe, expect, it } from "vitest";
import { createInitCommand } from "../../commands/init";

describe("init command help", () => {
	it("advertises the optional Better Auth UI scaffold boundary", () => {
		const help = createInitCommand().helpInformation();

		expect(help).toContain("better-auth-ui");
		expect(help).toContain("auth + account");
		expect(help).toContain("existing Better Auth backend");
	});
});
