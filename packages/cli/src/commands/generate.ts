import { Command } from "commander";
import { runCliPassthrough } from "../utils/passthrough";

export function createGenerateCommand() {
	return new Command("generate")
		.description("Passthrough to @btst/cli generate")
		.allowUnknownOption(true)
		.allowExcessArguments(true)
		.argument("[args...]", "Arguments forwarded to @btst/cli generate")
		.action(async (args: string[] = []) => {
			const code = await runCliPassthrough({
				cwd: process.cwd(),
				command: "generate",
				args,
			});
			process.exitCode = code;
		});
}
