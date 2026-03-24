import { access } from "node:fs/promises";
import { resolve } from "node:path";
import {
	cancel,
	confirm,
	intro,
	isCancel,
	multiselect,
	outro,
	select,
	text,
} from "@clack/prompts";
import { Command, InvalidOptionArgumentError } from "commander";
import {
	ADAPTERS,
	DEFAULT_PLUGIN_SELECTION,
	PLUGINS,
} from "../utils/constants";
import { detectAlias } from "../utils/detect-alias";
import { detectCssFile } from "../utils/detect-css-file";
import { detectFramework } from "../utils/detect-framework";
import { detectPackageManager } from "../utils/detect-package-manager";
import { detectProjectShape } from "../utils/detect-project-shape";
import { writePlannedFiles, type ConflictPolicy } from "../utils/file-writer";
import { patchCssImports } from "../utils/css-patcher";
import { patchLayoutWithQueryClientProvider } from "../utils/layout-patcher";
import { installInitDependencies } from "../utils/package-installer";
import {
	adapterNeedsGenerate,
	getGenerateHintForAdapter,
	runCliPassthrough,
} from "../utils/passthrough";
import { buildScaffoldPlan } from "../utils/scaffold-plan";
import { collectPrerequisiteWarnings } from "../utils/validate-prerequisites";
import type { Adapter, Framework, InitOptions, PluginKey } from "../types";

type InitCliOptions = InitOptions;

function ensureNotCancelled<T>(value: T | symbol): T {
	if (isCancel(value)) {
		cancel("Init cancelled.");
		process.exit(1);
	}
	return value as T;
}

async function detectOrSelectFramework(
	cwd: string,
	options: InitCliOptions,
): Promise<Framework> {
	if (options.framework) return options.framework;

	const detected = await detectFramework(cwd);
	if (options.yes) {
		return detected ?? "nextjs";
	}

	if (detected) {
		const accepted = ensureNotCancelled(
			await confirm({
				message: `Detected framework: ${detected}. Use this?`,
				initialValue: true,
			}),
		);
		if (accepted) return detected;
	}

	return ensureNotCancelled(
		await select({
			message: "Select framework",
			options: [
				{ label: "Next.js (App Router)", value: "nextjs" as const },
				{ label: "React Router v7", value: "react-router" as const },
				{ label: "TanStack Start", value: "tanstack" as const },
			],
		}),
	);
}

async function detectOrSelectAdapter(
	options: InitCliOptions,
): Promise<Adapter> {
	if (options.adapter) return options.adapter;
	if (options.yes) return "memory";
	return ensureNotCancelled(
		await select({
			message: "Select adapter",
			options: ADAPTERS.map((adapter) => ({
				label: adapter.label,
				value: adapter.key,
			})),
		}),
	);
}

async function selectPlugins(options: InitCliOptions): Promise<PluginKey[]> {
	if (options.plugins?.length) {
		return options.plugins;
	}

	if (options.yes) return DEFAULT_PLUGIN_SELECTION;

	const plugins = ensureNotCancelled(
		await multiselect({
			message: "Select plugins to scaffold",
			required: false,
			options: PLUGINS.map((plugin) => ({
				label: plugin.label,
				value: plugin.key,
				hint: plugin.key,
			})),
			initialValues: DEFAULT_PLUGIN_SELECTION,
		}),
	);

	return plugins as PluginKey[];
}

function parsePluginOption(value: string): PluginKey[] {
	const available = PLUGINS.map((plugin) => plugin.key);
	const availableSet = new Set(available);

	if (value.trim().toLowerCase() === "all") {
		return [...available];
	}

	const requested = value
		.split(",")
		.map((part) => part.trim())
		.filter(Boolean);

	if (requested.length === 0) {
		throw new InvalidOptionArgumentError(
			"Expected a comma-separated list of plugins or 'all'.",
		);
	}

	const invalid = requested.filter(
		(plugin) => !availableSet.has(plugin as PluginKey),
	);
	if (invalid.length > 0) {
		throw new InvalidOptionArgumentError(
			`Unknown plugin(s): ${invalid.join(", ")}. Valid: ${available.join(", ")}`,
		);
	}

	return Array.from(new Set(requested)) as PluginKey[];
}

async function pickConflictPolicy(
	yes: boolean | undefined,
): Promise<ConflictPolicy> {
	if (yes) return "overwrite";
	const value = ensureNotCancelled(
		await select({
			message: "When generated files already exist",
			options: [
				{ label: "Ask me per file", value: "ask" as const },
				{ label: "Skip existing files", value: "skip" as const },
				{ label: "Overwrite existing files", value: "overwrite" as const },
			],
		}),
	);
	return value;
}

export function createInitCommand() {
	return new Command("init")
		.description("Scaffold BTST into an existing app")
		.option("--framework <framework>", "nextjs | react-router | tanstack")
		.option(
			"--adapter <adapter>",
			"memory | prisma | drizzle | kysely | mongodb",
		)
		.option(
			"--plugins <plugins>",
			"Comma-separated plugin keys, or 'all'",
			parsePluginOption,
		)
		.option("--skip-install", "Skip dependency install")
		.option("--cwd <path>", "Target project directory")
		.option("--yes", "Accept defaults and skip prompts")
		.action(async (rawOptions: InitCliOptions) => {
			intro("Running @btst/codegen init");

			const cwd = resolve(rawOptions.cwd ?? process.cwd());
			try {
				await access(resolve(cwd, "package.json"));
			} catch {
				cancel(`No package.json found in ${cwd}`);
				process.exit(1);
			}

			const framework = await detectOrSelectFramework(cwd, rawOptions);
			const shape = await detectProjectShape(cwd, framework);
			if (!shape.ok) {
				cancel(
					`Project does not match expected ${framework} shape. Missing: ${shape.missingPaths.join(", ")}`,
				);
				process.exit(1);
			}

			const packageManager = await detectPackageManager(cwd);
			const adapter = await detectOrSelectAdapter(rawOptions);
			const alias = await detectAlias(cwd);
			const selectedPlugins = await selectPlugins(rawOptions);

			let cssFile = await detectCssFile(cwd, framework);
			if (!cssFile) {
				cssFile = rawOptions.yes
					? framework === "nextjs"
						? "app/globals.css"
						: framework === "react-router"
							? "app/app.css"
							: "src/styles/globals.css"
					: ensureNotCancelled(
							await text({
								message: "Could not detect global CSS file path. Enter it:",
								placeholder: "app/globals.css",
							}),
						);
			} else if (!rawOptions.yes) {
				const keepDetected = ensureNotCancelled(
					await confirm({
						message: `Use detected CSS file ${cssFile}?`,
						initialValue: true,
					}),
				);
				if (!keepDetected) {
					cssFile = ensureNotCancelled(
						await text({
							message: "Enter CSS file path",
							initialValue: cssFile,
						}),
					);
				}
			}

			const conflictPolicy = await pickConflictPolicy(rawOptions.yes);
			const finalCssFile = cssFile as string;
			const plan = await buildScaffoldPlan({
				framework,
				adapter,
				plugins: selectedPlugins,
				alias,
				cssFile: finalCssFile,
			});

			const writeResult = await writePlannedFiles(
				cwd,
				plan.files,
				conflictPolicy,
			);
			const cssImports = PLUGINS.filter((plugin) =>
				selectedPlugins.includes(plugin.key),
			).map((plugin) => plugin.cssImport);
			const cssPatch = await patchCssImports(
				cwd,
				plan.cssPatchTarget,
				cssImports,
			);
			const layoutPatch =
				framework === "nextjs"
					? { updated: false as const }
					: await patchLayoutWithQueryClientProvider(
							cwd,
							plan.layoutPatchTarget,
							alias,
						);

			await installInitDependencies({
				cwd,
				packageManager,
				adapter,
				skipInstall: rawOptions.skipInstall,
			});

			if (layoutPatch.warning) {
				console.warn(`\n${layoutPatch.warning}\n`);
			}

			const prerequisiteWarnings = await collectPrerequisiteWarnings(cwd);
			if (prerequisiteWarnings.length > 0) {
				console.warn("\nWarnings:");
				for (const warning of prerequisiteWarnings) {
					console.warn(`- ${warning}`);
				}
			}

			if (adapterNeedsGenerate(adapter)) {
				const stackPath =
					plan.files.find((file) => file.path.endsWith("lib/stack.ts"))?.path ??
					(framework === "react-router"
						? "app/lib/stack.ts"
						: "src/lib/stack.ts");
				const hint = getGenerateHintForAdapter(adapter, stackPath);
				if (hint) {
					const runNow = rawOptions.yes
						? false
						: ensureNotCancelled(
								await confirm({
									message: `Run generate now? (${hint})`,
									initialValue: true,
								}),
							);
					if (runNow) {
						const orm = ADAPTERS.find(
							(item) => item.key === adapter,
						)?.ormForGenerate;
						const args = orm
							? [`--orm=${orm}`, `--config=${stackPath}`]
							: [`--config=${stackPath}`];
						const exitCode = await runCliPassthrough({
							cwd,
							command: "generate",
							args,
						});
						if (exitCode !== 0) {
							process.exitCode = exitCode;
						}
					}
				}
			}

			const layoutStatus =
				framework === "nextjs"
					? `yes (generated ${plan.pagesLayoutPath ?? "app/pages/layout.tsx"})`
					: layoutPatch.updated
						? "yes"
						: "manual action may be needed";

			outro(`BTST init complete.
Files written: ${writeResult.written.length}
Files skipped: ${writeResult.skipped.length}
CSS updated: ${cssPatch.updated ? "yes" : "no"}
Layout patched: ${layoutStatus}

Next steps:
- Verify routes under /pages/*
- Run your build
- Use npx @btst/codegen generate or npx @btst/codegen migrate as needed
`);
		});
}
