import { execa } from "execa";
import { ADAPTERS, PLUGINS } from "./constants";
import type { Adapter, PackageManager, PluginKey } from "../types";

function getInstallCommand(
	packageManager: PackageManager,
	packages: string[],
): { command: string; args: string[] } {
	if (packageManager === "pnpm") {
		return { command: "pnpm", args: ["add", ...packages] };
	}
	if (packageManager === "yarn") {
		return { command: "yarn", args: ["add", ...packages] };
	}
	return { command: "npm", args: ["install", ...packages] };
}

export async function installInitDependencies(input: {
	cwd: string;
	packageManager: PackageManager;
	adapter: Adapter;
	plugins: PluginKey[];
	skipInstall?: boolean;
}): Promise<void> {
	if (input.skipInstall) return;

	const adapterMeta = ADAPTERS.find((item) => item.key === input.adapter);
	if (!adapterMeta) {
		throw new Error(`Unknown adapter: ${input.adapter}`);
	}

	const pluginExtraPackages = input.plugins.flatMap((key) => {
		const meta = PLUGINS.find((p) => p.key === key);
		return meta?.extraPackages ?? [];
	});

	const packages = [
		"@btst/stack",
		"@btst/yar",
		"@tanstack/react-query",
		adapterMeta.packageName,
		...(adapterMeta.extraPackages ?? []),
		...pluginExtraPackages,
	];
	const { command, args } = getInstallCommand(input.packageManager, packages);
	await execa(command, args, { cwd: input.cwd, stdio: "inherit" });
}
