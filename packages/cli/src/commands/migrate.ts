import { Command } from "commander";
import { runCliPassthrough } from "../utils/passthrough";

export function createMigrateCommand() {
	return new Command("migrate")
		.description("Passthrough to @btst/cli migrate")
		.allowUnknownOption(true)
		.allowExcessArguments(true)
		.argument("[args...]", "Arguments forwarded to @btst/cli migrate")
		.action(async (args: string[] = []) => {
			const code = await runCliPassthrough({
				cwd: process.cwd(),
				command: "migrate",
				args,
			});
			process.exitCode = code;
		});
}
