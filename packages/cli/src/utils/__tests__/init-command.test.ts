import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createInitCommand } from "../../commands/init";

describe("init command help", () => {
	it("advertises the optional Better Auth UI scaffold boundary", () => {
		const help = createInitCommand().helpInformation();

		expect(help).toContain("better-auth-ui");
		expect(help).toContain("auth + account");
		expect(help).toContain("existing Better Auth backend");
	});
});

const projects: string[] = [];
afterEach(async () => {
	vi.restoreAllMocks();
	await Promise.all(
		projects.splice(0).map((cwd) => rm(cwd, { recursive: true, force: true })),
	);
});

it.each(["react-router", "tanstack"] as const)(
	"preserves the %s Vite config through actual init and rerun",
	async (framework) => {
		const cwd = await mkdtemp(join(tmpdir(), "btst-init-vite-"));
		projects.push(cwd);
		const source = framework === "react-router" ? "app" : "src";
		await mkdir(join(cwd, source, "routes"), { recursive: true });
		await writeFile(
			join(cwd, "package.json"),
			JSON.stringify({ name: "fixture", type: "module" }),
		);
		await writeFile(
			join(cwd, "components.json"),
			JSON.stringify({
				aliases: { components: "@/components" },
				tailwind: { css: `${source}/styles.css` },
			}),
		);
		await writeFile(join(cwd, source, "styles.css"), '@import "tailwindcss";');
		await writeFile(
			join(
				cwd,
				source,
				framework === "react-router" ? "root.tsx" : "routes/__root.tsx",
			),
			"export default function Root() { return <div /> }",
		);
		await writeFile(
			join(cwd, "vite.config.ts"),
			'import { defineConfig } from "vite";\nexport default defineConfig({ plugins: [existingPlugin()], ssr: { external: ["native-addon"], noExternal: ["existing-package"] } });',
		);
		const args = [
			"--cwd",
			cwd,
			"--framework",
			framework,
			"--adapter",
			"memory",
			"--plugins",
			"blog,newsletter",
			"--skip-install",
			"--yes",
		];
		await createInitCommand().parseAsync(args, { from: "user" });
		const once = await readFile(join(cwd, "vite.config.ts"), "utf8");
		expect(once).toContain("plugins: [existingPlugin()]");
		expect(once).toContain('external: ["native-addon"]');
		expect(once).toContain('noExternal: ["existing-package", "lucide-react"]');
		await createInitCommand().parseAsync(args, { from: "user" });
		expect(await readFile(join(cwd, "vite.config.ts"), "utf8")).toBe(once);
	},
);

it("reports a dynamic Vite config before scaffold writes and leaves it unchanged", async () => {
	const cwd = await mkdtemp(join(tmpdir(), "btst-init-dynamic-vite-"));
	projects.push(cwd);
	await mkdir(join(cwd, "app"));
	await writeFile(
		join(cwd, "package.json"),
		'{"name":"fixture","type":"module"}',
	);
	const original =
		'export default () => { throw new Error("Do not execute config"); };';
	await writeFile(join(cwd, "vite.config.ts"), original);
	let reportedBeforeWrites = false;
	vi.spyOn(console, "warn").mockImplementation((message) => {
		if (String(message).includes('ssr: { noExternal: ["lucide-react"] }')) {
			reportedBeforeWrites = !existsSync(join(cwd, "app/lib/stack.ts"));
		}
	});
	await createInitCommand().parseAsync(
		[
			"--cwd",
			cwd,
			"--framework",
			"react-router",
			"--adapter",
			"memory",
			"--plugins",
			"blog",
			"--skip-install",
			"--yes",
		],
		{ from: "user" },
	);
	expect(reportedBeforeWrites).toBe(true);
	expect(await readFile(join(cwd, "vite.config.ts"), "utf8")).toBe(original);
	expect(existsSync(join(cwd, "app/lib/stack.ts"))).toBe(true);
});
