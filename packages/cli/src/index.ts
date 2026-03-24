#!/usr/bin/env node
import { Command } from "commander";
import { createGenerateCommand } from "./commands/generate";
import { createInitCommand } from "./commands/init";
import { createMigrateCommand } from "./commands/migrate";

const program = new Command();

program.name("btst").description("BTST codegen CLI");
program.addCommand(createInitCommand());
program.addCommand(createGenerateCommand());
program.addCommand(createMigrateCommand());

program.parseAsync(process.argv).catch((error: unknown) => {
	console.error(error);
	process.exit(1);
});
