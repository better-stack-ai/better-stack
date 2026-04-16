import { execa } from "execa";
import { ADAPTERS } from "./constants";
import type { Adapter } from "../types";

export function adapterNeedsGenerate(adapter: Adapter): boolean {
	if (adapter === "memory") return false;
	return Boolean(ADAPTERS.find((item) => item.key === adapter)?.ormForGenerate);
}

export function getOutputForAdapter(adapter: Adapter): string | null {
	const meta = ADAPTERS.find((item) => item.key === adapter);
	if (!meta?.ormForGenerate) return null;

	if (meta.ormForGenerate === "prisma") return "prisma/schema.prisma";
	if (meta.ormForGenerate === "drizzle") return "src/db/schema.ts";
	return "migrations/schema.sql";
}

export function getGenerateHintForAdapter(
	adapter: Adapter,
	configPath: string,
): string | null {
	const meta = ADAPTERS.find((item) => item.key === adapter);
	if (!meta?.ormForGenerate) return null;

	const output = getOutputForAdapter(adapter);
	if (!output) return null;

	return `npx @btst/codegen generate --orm=${meta.ormForGenerate} --config=${configPath} --output=${output}`;
}

export async function runCliPassthrough(input: {
	cwd: string;
	command: "generate" | "migrate";
	args: string[];
}): Promise<number> {
	const effectiveCommand = ["@btst/cli", input.command, ...input.args];
	console.log(`Delegating to: npx ${effectiveCommand.join(" ")}`);
	try {
		await execa("npx", effectiveCommand, {
			cwd: input.cwd,
			stdio: "inherit",
		});
		return 0;
	} catch (error) {
		console.error(
			`Delegated ${input.command} failed. Resolve the error, then run npx @btst/cli ${input.command} ... again.`,
		);
		return 1;
	}
}
