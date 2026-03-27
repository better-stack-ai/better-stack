import type { FileWritePlanItem } from "@btst/codegen/lib";

export interface ProjectFile {
	content: string;
}

export type ProjectFiles = Record<string, ProjectFile>;

/**
 * Build the complete StackBlitz project file tree.
 *
 * The base skeleton is a minimal Next.js app wired with the memory adapter.
 * The generated files from buildScaffoldPlan are merged on top (overwriting
 * any skeleton file with the same path).
 */
export function buildProjectFiles(
	generatedFiles: FileWritePlanItem[],
	cssImports: string[],
	extraPackages: string[] = [],
): ProjectFiles {
	const cssImportLines = cssImports.map((c) => `@import "${c}";`).join("\n");
	const baseDependencies: Record<string, string> = {
		"@btst/stack": "latest",
		"@btst/adapter-memory": "latest",
		"@tanstack/react-query": "^5.0.0",
		next: "15.3.4",
		react: "19.2.4",
		"react-dom": "19.2.4",
	};
	const pluginDependencies = Object.fromEntries(
		Array.from(new Set(extraPackages)).map((pkgName) => [pkgName, "latest"]),
	);
	const dependencies = Object.fromEntries(
		Object.entries({
			...baseDependencies,
			...pluginDependencies,
		}).sort(([left], [right]) => left.localeCompare(right)),
	);

	const files: ProjectFiles = {
		// ── package.json ────────────────────────────────────────────────────────
		"package.json": {
			content: JSON.stringify(
				{
					name: "btst-playground-demo",
					version: "0.0.0",
					private: true,
					scripts: {
						// copy-stack-src.mjs must run before next dev/build so Tailwind's
						// WASM oxide scanner can find @btst/stack source outside node_modules.
						// See: https://github.com/tailwindlabs/tailwindcss/issues/18418
						dev: "node copy-stack-src.mjs && next dev",
						build: "node copy-stack-src.mjs && next build",
						start: "next start",
					},
					dependencies,
					devDependencies: {
						"@tailwindcss/postcss": "^4",
						"@types/node": "^20",
						"@types/react": "^19",
						"@types/react-dom": "^19",
						postcss: "^8",
						tailwindcss: "^4",
						typescript: "^5",
					},
					stackblitz: {
						installDependencies: false,
						startCommand: "pnpm install && pnpm dev",
					},
				},
				null,
				2,
			),
		},

		// ── copy-stack-src.mjs ───────────────────────────────────────────────────
		// Tailwind's WASM oxide scanner cannot traverse node_modules inside
		// WebContainers (https://github.com/tailwindlabs/tailwindcss/issues/18418).
		// This script copies @btst/stack/src outside node_modules so Tailwind
		// can scan it. Mirrors the same script used in the demo projects.
		"copy-stack-src.mjs": {
			content: `#!/usr/bin/env node
import { cp, mkdir, rm } from "fs/promises";
import { existsSync } from "fs";

const src = "node_modules/@btst/stack/src";
const dest = "app/.btst-stack-src";
const uiSrc = "node_modules/@btst/stack/dist/packages/ui";
const uiDest = "app/.btst-stack-ui";

if (!existsSync(src)) {
  console.log("[copy-stack-src] node_modules/@btst/stack/src not found, skipping");
  process.exit(0);
}

await rm(dest, { recursive: true, force: true });
await mkdir(dest, { recursive: true });
await cp(src, dest, { recursive: true });
console.log(\`[copy-stack-src] copied \${src} → \${dest}\`);

if (existsSync(uiSrc)) {
  await rm(uiDest, { recursive: true, force: true });
  await mkdir(uiDest, { recursive: true });
  await cp(uiSrc, uiDest, { recursive: true });
  console.log(\`[copy-stack-src] copied \${uiSrc} → \${uiDest}\`);
} else {
  console.log(\`[copy-stack-src] \${uiSrc} not found, skipping\`);
}

// When running inside the monorepo, workspace-built dist/plugins/ has
// @workspace/ui imports already inlined by postbuild.cjs. Overlay these
// files onto the npm-installed ones so plugin CSS stays self-contained.
// In StackBlitz/WebContainers this path won't exist, so this is a no-op.
const workspacePluginsDist = "../../packages/stack/dist/plugins";
const npmPluginsDist = "node_modules/@btst/stack/dist/plugins";
if (existsSync(workspacePluginsDist)) {
  await cp(workspacePluginsDist, npmPluginsDist, { recursive: true });
  console.log(
    \`[copy-stack-src] overlaid \${workspacePluginsDist} → \${npmPluginsDist}\`,
  );
}
`,
		},

		// ── .npmrc ──────────────────────────────────────────────────────────────
		// Needed in StackBlitz WebContainers: prevents native module build
		// failures and engine version mismatch errors during npm install.
		".npmrc": {
			content: `legacy-peer-deps=true\nengine-strict=false\n`,
		},

		// ── next.config.ts ───────────────────────────────────────────────────────
		"next.config.ts": {
			content: `import type { NextConfig } from "next"

const config: NextConfig = {
  reactStrictMode: true,
}

export default config
`,
		},

		// ── tsconfig.json ────────────────────────────────────────────────────────
		"tsconfig.json": {
			content: JSON.stringify(
				{
					compilerOptions: {
						baseUrl: ".",
						target: "ESNext",
						lib: ["dom", "dom.iterable", "esnext"],
						allowJs: true,
						skipLibCheck: true,
						strict: true,
						forceConsistentCasingInFileNames: true,
						noEmit: true,
						esModuleInterop: true,
						module: "esnext",
						moduleResolution: "bundler",
						resolveJsonModule: true,
						isolatedModules: true,
						jsx: "preserve",
						incremental: true,
						paths: { "@/*": ["./*"] },
						plugins: [{ name: "next" }],
					},
					include: [
						"next-env.d.ts",
						"**/*.ts",
						"**/*.tsx",
						".next/types/**/*.ts",
					],
					exclude: ["node_modules"],
				},
				null,
				2,
			),
		},

		// ── postcss.config.mjs ──────────────────────────────────────────────────
		"postcss.config.mjs": {
			content: `export default {
  plugins: {
    '@tailwindcss/postcss': {},
  },
}
`,
		},

		// ── app/globals.css ──────────────────────────────────────────────────────
		"app/globals.css": {
			content: `@import "tailwindcss";
${cssImportLines ? `\n${cssImportLines}\n` : ""}
/* WebContainers: Tailwind's WASM scanner can't traverse node_modules        */
/* (https://github.com/tailwindlabs/tailwindcss/issues/18418).               */
/* copy-stack-src.mjs copies @btst/stack source here before dev/build runs. */
@source "./.btst-stack-src/**/*.{ts,tsx}";
@source "./.btst-stack-ui/**/*.{ts,tsx}";
`,
		},

		// ── app/layout.tsx ───────────────────────────────────────────────────────
		"app/layout.tsx": {
			content: `import "./globals.css"
import type { ReactNode } from "react"

export const metadata = { title: "BTST Playground" }

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
`,
		},

		// ── app/page.tsx ─────────────────────────────────────────────────────────
		"app/page.tsx": {
			content: `import Link from "next/link"

export default function Home() {
  return (
    <main style={{ fontFamily: "sans-serif", padding: "2rem", maxWidth: "48rem" }}>
      <h1 style={{ fontSize: "2rem", fontWeight: "bold", marginBottom: "0.5rem" }}>
        BTST Playground
      </h1>
      <p style={{ color: "#666", marginBottom: "1.5rem" }}>
        A demo project generated by the{" "}
        <a href="https://better-stack.ai" style={{ color: "#2563eb" }}>
          BTST Playground
        </a>
        . Navigate to a plugin route below to see it in action.
      </p>
      <nav>
        <ul style={{ listStyle: "none", padding: 0, display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <li>
            <Link href="/pages/route-docs" style={{ color: "#2563eb", textDecoration: "underline" }}>
              /pages/route-docs — Browse all available routes
            </Link>
          </li>
        </ul>
      </nav>
    </main>
  )
}
`,
		},
	};

	// Merge generated files on top of the skeleton
	for (const file of generatedFiles) {
		files[file.path] = { content: file.content };
	}

	return files;
}

/**
 * Convert project files to the format expected by @stackblitz/sdk embedProject()
 */
export function toSdkFiles(projectFiles: ProjectFiles): Record<string, string> {
	return Object.fromEntries(
		Object.entries(projectFiles).map(([path, { content }]) => [path, content]),
	);
}
