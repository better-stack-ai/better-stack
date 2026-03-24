import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { exists } from "./exists";

export async function collectPrerequisiteWarnings(
	cwd: string,
): Promise<string[]> {
	const warnings: string[] = [];

	if (!(await exists(join(cwd, "components.json")))) {
		warnings.push("Missing components.json (shadcn setup may be incomplete).");
	}

	let cssContent = "";
	for (const candidate of [
		"app/globals.css",
		"src/styles/globals.css",
		"app/app.css",
	]) {
		try {
			cssContent = await readFile(join(cwd, candidate), "utf8");
			break;
		} catch {
			// keep trying
		}
	}
	if (cssContent && !cssContent.includes("tailwindcss")) {
		warnings.push("Could not detect Tailwind v4 import in global CSS.");
	}

	let hasSonner = false;
	for (const candidate of [
		"app/layout.tsx",
		"app/root.tsx",
		"src/routes/__root.tsx",
	]) {
		try {
			const content = await readFile(join(cwd, candidate), "utf8");
			if (content.includes("Toaster")) {
				hasSonner = true;
				break;
			}
		} catch {
			// ignore
		}
	}
	if (!hasSonner) {
		warnings.push("Could not find Sonner <Toaster /> in root layout.");
	}

	return warnings;
}
