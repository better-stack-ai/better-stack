import type { FileWritePlanItem, Framework } from "@btst/codegen/meta";
import type { SeedRouteFile } from "@btst/codegen/meta";

export interface ProjectFile {
	content: string;
}

export type ProjectFiles = Record<string, ProjectFile>;

/**
 * Build the complete StackBlitz project file tree for Next.js.
 *
 * The base skeleton is a minimal Next.js app wired with the memory adapter.
 * The generated files from buildScaffoldPlan are merged on top (overwriting
 * any skeleton file with the same path).
 */
function buildNextjsProjectFiles(
	generatedFiles: FileWritePlanItem[],
	cssImports: string[],
	extraPackages: string[] = [],
	hasAiChat = false,
	seedFiles: SeedRouteFile[] = [],
	seedRunnerScript: string | null = null,
): ProjectFiles {
	const cssImportLines = cssImports.map((c) => `@import "${c}";`).join("\n");
	const baseDependencies: Record<string, string> = {
		"@btst/stack": "latest",
		"@btst/adapter-memory": "latest",
		"@tanstack/react-query": "^5.0.0",
		next: "15.3.4",
		react: "19.2.4",
		"react-dom": "19.2.4",
		"tw-animate-css": "latest",
		zod: "^4.2.0",
		"lucide-react": "^0.522.0",
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
						// When seeds are enabled, seed-runner.mjs starts in background and
						// polls the dev server until ready, then calls /api/seed-* routes.
						dev: seedRunnerScript
							? "node copy-stack-src.mjs; node seed-runner.mjs & next dev"
							: "node copy-stack-src.mjs && next dev",
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

		// ── .env ─────────────────────────────────────────────────────────────────
		".env": {
			content: `# Uncomment and add your OpenAI API key to enable AI chat.\n# OPENAI_API_KEY=sk-...\n`,
		},

		// ── next.config.ts ───────────────────────────────────────────────────────
		// Minimal fallback — the CLI (btst init) generates a richer version when
		// ai-chat or media plugins are selected, which merges on top of this via
		// generatedFiles. Without this fallback, projects without ai-chat/media
		// would have no next.config.ts at all.
		"next.config.ts": {
			content: `import type { NextConfig } from "next"

const nextConfig: NextConfig = {}

export default nextConfig
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
@import "tw-animate-css";
${cssImportLines ? `${cssImportLines}\n` : ""}
/* WebContainers: Tailwind's WASM scanner can't traverse node_modules        */
/* (https://github.com/tailwindlabs/tailwindcss/issues/18418).               */
/* copy-stack-src.mjs copies @btst/stack source here before dev/build runs. */
@source "./.btst-stack-src/**/*.{ts,tsx}";
@source "./.btst-stack-ui/**/*.{ts,tsx}";

${SHARED_THEME_CSS}
`,
		},

		// ── app/layout.tsx ───────────────────────────────────────────────────────
		"app/layout.tsx": {
			content: hasAiChat
				? `import "./globals.css"
import type { ReactNode } from "react"
import { PageAIContextProvider } from "@btst/stack/plugins/ai-chat/client/context"

export const metadata = { title: "BTST Playground" }

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <PageAIContextProvider>{children}</PageAIContextProvider>
      </body>
    </html>
  )
}
`
				: `import "./globals.css"
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

	// Merge seed route files
	for (const file of seedFiles) {
		files[file.path] = { content: file.content };
	}

	if (seedRunnerScript) {
		files["seed-runner.mjs"] = { content: seedRunnerScript };
	}

	return files;
}

// ── Shared CSS theme tokens ──────────────────────────────────────────────────
// Same token block used by both React Router and TanStack skeletons.
const SHARED_THEME_CSS = `@custom-variant dark (&:is(.dark *));

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
  --color-sidebar-ring: var(--sidebar-ring);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar: var(--sidebar);
  --color-chart-5: var(--chart-5);
  --color-chart-4: var(--chart-4);
  --color-chart-3: var(--chart-3);
  --color-chart-2: var(--chart-2);
  --color-chart-1: var(--chart-1);
  --color-ring: var(--ring);
  --color-input: var(--input);
  --color-border: var(--border);
  --color-destructive: var(--destructive);
  --color-accent-foreground: var(--accent-foreground);
  --color-accent: var(--accent);
  --color-muted-foreground: var(--muted-foreground);
  --color-muted: var(--muted);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-secondary: var(--secondary);
  --color-primary-foreground: var(--primary-foreground);
  --color-primary: var(--primary);
  --color-popover-foreground: var(--popover-foreground);
  --color-popover: var(--popover);
  --color-card-foreground: var(--card-foreground);
  --color-card: var(--card);
  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);
  --radius-2xl: calc(var(--radius) + 8px);
  --radius-3xl: calc(var(--radius) + 12px);
  --radius-4xl: calc(var(--radius) + 16px);
}

:root {
  --radius: 0.625rem;
  --background: oklch(1 0 0);
  --foreground: oklch(0.145 0 0);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.145 0 0);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.145 0 0);
  --primary: oklch(0.205 0 0);
  --primary-foreground: oklch(0.985 0 0);
  --secondary: oklch(0.97 0 0);
  --secondary-foreground: oklch(0.205 0 0);
  --muted: oklch(0.97 0 0);
  --muted-foreground: oklch(0.556 0 0);
  --accent: oklch(0.97 0 0);
  --accent-foreground: oklch(0.205 0 0);
  --destructive: oklch(0.577 0.245 27.325);
  --border: oklch(0.922 0 0);
  --input: oklch(0.922 0 0);
  --ring: oklch(0.708 0 0);
  --chart-1: oklch(0.646 0.222 41.116);
  --chart-2: oklch(0.6 0.118 184.704);
  --chart-3: oklch(0.398 0.07 227.392);
  --chart-4: oklch(0.828 0.189 84.429);
  --chart-5: oklch(0.769 0.188 70.08);
  --sidebar: oklch(0.985 0 0);
  --sidebar-foreground: oklch(0.145 0 0);
  --sidebar-primary: oklch(0.205 0 0);
  --sidebar-primary-foreground: oklch(0.985 0 0);
  --sidebar-accent: oklch(0.97 0 0);
  --sidebar-accent-foreground: oklch(0.205 0 0);
  --sidebar-border: oklch(0.922 0 0);
  --sidebar-ring: oklch(0.708 0 0);
}

.dark {
  --background: oklch(0.145 0 0);
  --foreground: oklch(0.985 0 0);
  --card: oklch(0.205 0 0);
  --card-foreground: oklch(0.985 0 0);
  --popover: oklch(0.205 0 0);
  --popover-foreground: oklch(0.985 0 0);
  --primary: oklch(0.922 0 0);
  --primary-foreground: oklch(0.205 0 0);
  --secondary: oklch(0.269 0 0);
  --secondary-foreground: oklch(0.985 0 0);
  --muted: oklch(0.269 0 0);
  --muted-foreground: oklch(0.708 0 0);
  --accent: oklch(0.269 0 0);
  --accent-foreground: oklch(0.985 0 0);
  --destructive: oklch(0.704 0.191 22.216);
  --border: oklch(1 0 0 / 10%);
  --input: oklch(1 0 0 / 15%);
  --ring: oklch(0.556 0 0);
  --chart-1: oklch(0.488 0.243 264.376);
  --chart-2: oklch(0.696 0.17 162.48);
  --chart-3: oklch(0.769 0.188 70.08);
  --chart-4: oklch(0.627 0.265 303.9);
  --chart-5: oklch(0.645 0.246 16.439);
  --sidebar: oklch(0.205 0 0);
  --sidebar-foreground: oklch(0.985 0 0);
  --sidebar-primary: oklch(0.488 0.243 264.376);
  --sidebar-primary-foreground: oklch(0.985 0 0);
  --sidebar-accent: oklch(0.269 0 0);
  --sidebar-accent-foreground: oklch(0.985 0 0);
  --sidebar-border: oklch(1 0 0 / 10%);
  --sidebar-ring: oklch(0.556 0 0);
}

@layer base {
  * {
    @apply border-border outline-ring/50;
  }
  body {
    @apply bg-background text-foreground;
  }
}`;

// ── React Router skeleton ────────────────────────────────────────────────────

function buildReactRouterProjectFiles(
	generatedFiles: FileWritePlanItem[],
	cssImports: string[],
	extraPackages: string[] = [],
	hasAiChat = false,
	seedFiles: SeedRouteFile[] = [],
	seedRunnerScript: string | null = null,
	seedPluginCode: string | null = null,
): ProjectFiles {
	const cssImportLines = cssImports.map((c) => `@import "${c}";`).join("\n");
	const pluginDependencies = Object.fromEntries(
		Array.from(new Set(extraPackages)).map((pkgName) => [pkgName, "latest"]),
	);
	const baseDependencies: Record<string, string> = {
		"@btst/adapter-memory": "latest",
		"@btst/stack": "latest",
		"@react-router/node": "^7.0.0",
		"@react-router/serve": "^7.0.0",
		"@tanstack/react-query": "^5.0.0",
		react: "^19.0.0",
		"react-dom": "^19.0.0",
		"react-router": "^7.0.0",
		"tw-animate-css": "latest",
		zod: "^4.2.0",
		"lucide-react": "^0.522.0",
	};
	const dependencies = Object.fromEntries(
		Object.entries({ ...baseDependencies, ...pluginDependencies }).sort(
			([l], [r]) => l.localeCompare(r),
		),
	);

	const files: ProjectFiles = {
		"package.json": {
			content: JSON.stringify(
				{
					name: "btst-playground-demo",
					version: "0.0.0",
					private: true,
					type: "module",
					scripts: {
						dev: seedRunnerScript
							? "node copy-stack-src.mjs; node seed-runner.mjs & NODE_OPTIONS='--experimental-loader ./css-noop-loader.mjs' react-router dev"
							: "node copy-stack-src.mjs && NODE_OPTIONS='--experimental-loader ./css-noop-loader.mjs' react-router dev",
						build:
							"node copy-stack-src.mjs && NODE_OPTIONS='--experimental-loader ./css-noop-loader.mjs' react-router build",
						start: "react-router-serve ./build/server/index.js",
					},
					dependencies,
					devDependencies: {
						"@react-router/dev": "^7.0.0",
						"@tailwindcss/vite": "^4",
						"@types/node": "^22",
						"@types/react": "^19",
						"@types/react-dom": "^19",
						tailwindcss: "^4",
						typescript: "^5",
						vite: "^7.0.0",
						"vite-tsconfig-paths": "^5.0.0",
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
}
`,
		},

		".npmrc": {
			content: `legacy-peer-deps=true\nengine-strict=false\n`,
		},

		// ── .env ─────────────────────────────────────────────────────────────────
		".env": {
			content: `# Uncomment and add your OpenAI API key to enable AI chat.\n# OPENAI_API_KEY=sk-...\n`,
		},

		// ── css-noop-loader.mjs ──────────────────────────────────────────────────
		// WebContainers runs a WASI-based Node.js that cannot register Vite's
		// internal ESM hooks, so CSS imports from SSR-evaluated node_modules (e.g.
		// highlight.js) reach Node's native loader and fail. This custom loader
		// intercepts .css imports from node_modules only — project-local CSS files
		// (app.css, globals.css) are left alone so Vite can deliver them to the browser.
		// Activated via NODE_OPTIONS='--experimental-loader ./css-noop-loader.mjs'.
		"css-noop-loader.mjs": {
			content: `export async function load(url, context, nextLoad) {
  if (/\\.css(\\?.*)?$/.test(url) && url.includes('/node_modules/')) {
    return { format: 'module', shortCircuit: true, source: '' }
  }
  return nextLoad(url, context)
}
`,
		},

		"vite.config.ts": {
			content: `import { reactRouter } from "@react-router/dev/vite"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from "vite"
import tsconfigPaths from "vite-tsconfig-paths"
${seedPluginCode ? `\nconst btstSeedPlugin = ${seedPluginCode}\n` : ""}
export default defineConfig({
  plugins: [
    tailwindcss(),
    reactRouter(),
    tsconfigPaths(),
    {
      // WebContainers: Node's ESM loader cannot handle .css imports inside SSR
      // bundles (ERR_UNKNOWN_FILE_EXTENSION). Return an empty module for every
      // .css file during SSR so the import is a no-op rather than a crash.
      name: "ssr-ignore-css",
      enforce: "pre",
      load(id, options) {
        if (options?.ssr && /\\.css(\\?.*)?$/.test(id)) {
          return { code: "" }
        }
      },
    },${seedPluginCode ? "\n    btstSeedPlugin," : ""}
  ],
  ssr: {
    // Bundle @btst/* and highlight.js through Vite so the plugin above can
    // intercept their .css imports before they reach Node's ESM loader.
    noExternal: ["@btst", "highlight.js"],
  },
  define: {
    "import.meta.env.VITE_BASE_URL": JSON.stringify("http://localhost:5173"),
    // Expose the base URL to SSR code (process.env.BASE_URL is checked by
    // the generated stack-client.tsx getBaseURL() on the server side).
    "process.env.BASE_URL": JSON.stringify("http://localhost:5173"),
    // No OPENAI_API_KEY in WebContainers — banner will prompt users to add it.
    "import.meta.env.VITE_HAS_OPENAI_KEY": JSON.stringify(""),
  },
})
`,
		},

		"react-router.config.ts": {
			content: `import type { Config } from "@react-router/dev/config"

export default {
  ssr: true,
} satisfies Config
`,
		},

		"tsconfig.json": {
			content: JSON.stringify(
				{
					include: [
						"**/*",
						"**/.server/**/*",
						"**/.client/**/*",
						".react-router/types/**/*",
					],
					compilerOptions: {
						lib: ["DOM", "DOM.Iterable", "ES2022"],
						types: ["node", "vite/client"],
						target: "ES2022",
						module: "ES2022",
						moduleResolution: "bundler",
						jsx: "react-jsx",
						rootDirs: [".", "./.react-router/types"],
						baseUrl: ".",
						paths: { "~/*": ["./app/*"] },
						esModuleInterop: true,
						verbatimModuleSyntax: true,
						noEmit: true,
						resolveJsonModule: true,
						skipLibCheck: true,
						strict: true,
					},
				},
				null,
				2,
			),
		},

		"app/app.css": {
			content: `@import "tailwindcss";
@import "tw-animate-css";
${cssImportLines ? `${cssImportLines}\n` : ""}
/* WebContainers: Tailwind's WASM scanner can't traverse node_modules        */
/* copy-stack-src.mjs copies @btst/stack source here before dev/build runs. */
@source "./.btst-stack-src/**/*.{ts,tsx}";
@source "./.btst-stack-ui/**/*.{ts,tsx}";

${SHARED_THEME_CSS}
`,
		},

		"app/root.tsx": {
			content: `import { Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router"
import "./app.css"
${hasAiChat ? `import { PageAIContextProvider } from "@btst/stack/plugins/ai-chat/client/context"\n` : ""}
export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        ${
					hasAiChat
						? `<PageAIContextProvider>
          {children}
        </PageAIContextProvider>`
						: `{children}`
				}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  )
}

export default function App() {
  return <Outlet />
}

export function ErrorBoundary({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : String(error)
  return (
    <main style={{ padding: "2rem" }}>
      <h1>Error</h1>
      <pre>{message}</pre>
    </main>
  )
}
`,
		},

		"app/routes.ts": {
			content: (() => {
				const generatedPaths = new Set(generatedFiles.map((f) => f.path));
				const seedRouteEntries = seedFiles
					.map((f) => {
						// React Router seed files use flat dot notation:
						// "app/routes/api.seed-blog.ts" → route file "routes/api.seed-blog.ts"
						const routeFile = f.path.replace(/^app\//, "");
						const m = routeFile.match(/routes\/api\.seed-(.+)\.ts$/);
						if (!m) return null;
						const pluginKey = m[1];
						return `  route("api/seed-${pluginKey}", "${routeFile}"),`;
					})
					.filter(Boolean)
					.join("\n");
				const pluginRouteEntries = [
					generatedPaths.has("app/routes/form-demo.tsx") &&
						`  route("form-demo/:slug", "routes/form-demo.tsx"),`,
					generatedPaths.has("app/routes/preview.tsx") &&
						`  route("preview/:slug", "routes/preview.tsx"),`,
					generatedPaths.has("app/routes/public-chat.tsx") &&
						`  route("public-chat", "routes/public-chat.tsx"),`,
					generatedPaths.has("app/routes/sitemap.xml.ts") &&
						`  route("sitemap.xml", "routes/sitemap.xml.ts"),`,
				]
					.filter(Boolean)
					.join("\n");
				return `import { type RouteConfig, index, layout, route } from "@react-router/dev/routes"

export default [
  index("routes/home.tsx"),
  layout("routes/pages/_layout.tsx", [
    route("pages/*", "routes/pages/$.tsx"),
  ]),${pluginRouteEntries ? `\n${pluginRouteEntries}` : ""}
  route("api/data/*", "routes/api/data/$.ts"),${seedRouteEntries ? `\n${seedRouteEntries}` : ""}
] satisfies RouteConfig
`;
			})(),
		},

		"app/routes/home.tsx": {
			content: `import { Link } from "react-router"

export default function Home() {
  return (
    <main style={{ fontFamily: "sans-serif", padding: "2rem", maxWidth: "48rem" }}>
      <h1 style={{ fontSize: "2rem", fontWeight: "bold", marginBottom: "0.5rem" }}>
        BTST Playground
      </h1>
      <p style={{ color: "#666", marginBottom: "1.5rem" }}>
        A demo project generated by the BTST Playground. Navigate to a plugin route below.
      </p>
      <nav>
        <Link
          to="/pages/route-docs"
          style={{ color: "#2563eb", textDecoration: "underline" }}
        >
          /pages/route-docs — Browse all available routes
        </Link>
      </nav>
    </main>
  )
}
`,
		},
	};

	for (const file of generatedFiles) {
		files[file.path] = { content: file.content };
	}

	for (const file of seedFiles) {
		files[file.path] = { content: file.content };
	}

	if (seedRunnerScript) {
		files["seed-runner.mjs"] = { content: seedRunnerScript };
	}

	return files;
}

// ── TanStack Start skeleton ──────────────────────────────────────────────────

function buildTanstackProjectFiles(
	generatedFiles: FileWritePlanItem[],
	cssImports: string[],
	extraPackages: string[] = [],
	hasAiChat = false,
	seedFiles: SeedRouteFile[] = [],
	seedRunnerScript: string | null = null,
	seedPluginCode: string | null = null,
): ProjectFiles {
	const cssImportLines = cssImports.map((c) => `@import "${c}";`).join("\n");
	const pluginDependencies = Object.fromEntries(
		Array.from(new Set(extraPackages)).map((pkgName) => [pkgName, "latest"]),
	);
	const baseDependencies: Record<string, string> = {
		"@btst/adapter-memory": "latest",
		"@btst/stack": "latest",
		"@tailwindcss/postcss": "^4",
		"@tanstack/react-query": "^5.0.0",
		"@tanstack/react-router": "^1.0.0",
		"@tanstack/react-router-ssr-query": "^1.0.0",
		"@tanstack/react-start": "^1.0.0",
		postcss: "^8",
		react: "^19.0.0",
		"react-dom": "^19.0.0",
		tailwindcss: "^4",
		"tw-animate-css": "latest",
		zod: "^4.2.0",
		"lucide-react": "^0.522.0",
	};
	const dependencies = Object.fromEntries(
		Object.entries({ ...baseDependencies, ...pluginDependencies }).sort(
			([l], [r]) => l.localeCompare(r),
		),
	);

	const files: ProjectFiles = {
		"package.json": {
			content: JSON.stringify(
				{
					name: "btst-playground-demo",
					version: "0.0.0",
					private: true,
					type: "module",
					scripts: {
						dev: seedRunnerScript
							? "node copy-stack-src.mjs; node seed-runner.mjs & NODE_OPTIONS='--experimental-loader ./css-noop-loader.mjs' vite dev"
							: "node copy-stack-src.mjs && NODE_OPTIONS='--experimental-loader ./css-noop-loader.mjs' vite dev",
						build:
							"node copy-stack-src.mjs && NODE_OPTIONS='--experimental-loader ./css-noop-loader.mjs' vite build",
						start:
							"NODE_OPTIONS='--experimental-loader ./css-noop-loader.mjs' node .output/server/index.mjs",
					},
					dependencies,
					devDependencies: {
						"@tanstack/router-cli": "^1.0.0",
						"@types/node": "^22",
						"@types/react": "^19",
						"@types/react-dom": "^19",
						"@vitejs/plugin-react": "^5.0.0",
						nitro: "latest",
						typescript: "^5",
						vite: "^7.0.0",
						"vite-tsconfig-paths": "^5.0.0",
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

		"copy-stack-src.mjs": {
			content: `#!/usr/bin/env node
import { cp, mkdir, rm } from "fs/promises";
import { existsSync } from "fs";

const src = "node_modules/@btst/stack/src";
const dest = "src/.btst-stack-src";
const uiSrc = "node_modules/@btst/stack/dist/packages/ui";
const uiDest = "src/.btst-stack-ui";

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
}
`,
		},

		".npmrc": {
			content: `legacy-peer-deps=true\nengine-strict=false\n`,
		},

		// ── .env ─────────────────────────────────────────────────────────────────
		".env": {
			content: `# Uncomment and add your OpenAI API key to enable AI chat.\n# OPENAI_API_KEY=sk-...\n`,
		},

		"css-noop-loader.mjs": {
			content: `export async function load(url, context, nextLoad) {
  if (/\\.css(\\?.*)?$/.test(url) && url.includes('/node_modules/')) {
    return { format: 'module', shortCircuit: true, source: '' }
  }
  return nextLoad(url, context)
}
`,
		},

		"vite.config.ts": {
			content: `import { defineConfig } from "vite"
import tsConfigPaths from "vite-tsconfig-paths"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import viteReact from "@vitejs/plugin-react"
import { nitro } from "nitro/vite"
${seedPluginCode ? `\nconst btstSeedPlugin = ${seedPluginCode}\n` : ""}
export default defineConfig({
  server: { port: 3000 },
  plugins: [
    nitro(),
    tsConfigPaths(),
    tanstackStart(),
    viteReact(),
    {
      // WebContainers: Node's ESM loader cannot handle .css imports inside SSR
      // bundles (ERR_UNKNOWN_FILE_EXTENSION). Return an empty module for every
      // .css file during SSR so the import is a no-op rather than a crash.
      name: "ssr-ignore-css",
      enforce: "pre",
      load(id, options) {
        if (options?.ssr && /\\.css(\\?.*)?$/.test(id)) {
          return { code: "" }
        }
      },
    },${seedPluginCode ? "\n    btstSeedPlugin," : ""}
  ],
  ssr: {
    // Bundle @btst/* and highlight.js through Vite so the plugin above can
    // intercept their .css imports before they reach Node's ESM loader.
    noExternal: ["@btst", "highlight.js"],
  },
  define: {
    "import.meta.env.VITE_BASE_URL": JSON.stringify("http://localhost:3000"),
    // No OPENAI_API_KEY in WebContainers — banner will prompt users to add it.
    "import.meta.env.VITE_HAS_OPENAI_KEY": JSON.stringify(""),
  },
})
`,
		},

		"postcss.config.mjs": {
			content: `export default {
  plugins: {
    '@tailwindcss/postcss': {},
  },
}
`,
		},

		"tsconfig.json": {
			content: JSON.stringify(
				{
					compilerOptions: {
						jsx: "react-jsx",
						moduleResolution: "Bundler",
						module: "ESNext",
						target: "ES2022",
						skipLibCheck: true,
						strictNullChecks: true,
						baseUrl: ".",
						paths: { "@/*": ["./src/*"] },
					},
				},
				null,
				2,
			),
		},

		"src/styles/globals.css": {
			content: `@import "tailwindcss";
@import "tw-animate-css";
${cssImportLines ? `${cssImportLines}\n` : ""}
/* WebContainers: Tailwind's WASM scanner can't traverse node_modules        */
/* copy-stack-src.mjs copies @btst/stack source here before dev/build runs. */
@source "../.btst-stack-src/**/*.{ts,tsx}";
@source "../.btst-stack-ui/**/*.{ts,tsx}";

${SHARED_THEME_CSS}
`,
		},

		"src/router.tsx": {
			content: `import { createRouter } from "@tanstack/react-router"
import { routeTree } from "./routeTree.gen"
import { QueryClient, isServer } from "@tanstack/react-query"
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query"

export interface MyRouterContext {
  queryClient: QueryClient
}

export function getRouter() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: isServer ? 60 * 1000 : 0,
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        retry: false,
      },
      dehydrate: {
        shouldDehydrateQuery: () => true,
      },
    },
  })

  const router = createRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: false,
    context: { queryClient },
    notFoundMode: "root",
  })

  setupRouterSsrQueryIntegration({ router, queryClient })

  return router
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
`,
		},

		"src/routes/__root.tsx": {
			content: `import { createRootRouteWithContext, HeadContent, Outlet, Scripts } from "@tanstack/react-router"
import globalsCss from "@/styles/globals.css?url"
import type { MyRouterContext } from "@/router"
${hasAiChat ? `import { PageAIContextProvider } from "@btst/stack/plugins/ai-chat/client/context"\n` : ""}
export const Route = createRootRouteWithContext<MyRouterContext>()({
  head: () => ({
    meta: [{ charSet: "utf-8" }, { name: "viewport", content: "width=device-width, initial-scale=1" }],
    links: [{ rel: "stylesheet", href: globalsCss }],
  }),
  component: RootComponent,
})

function RootComponent() {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        ${
					hasAiChat
						? `<PageAIContextProvider>
          <Outlet />
        </PageAIContextProvider>`
						: `<Outlet />`
				}
        <Scripts />
      </body>
    </html>
  )
}
`,
		},

		"src/routes/index.tsx": {
			content: `import { createFileRoute, Link } from "@tanstack/react-router"

export const Route = createFileRoute("/")({
  component: Home,
})

function Home() {
  return (
    <main style={{ fontFamily: "sans-serif", padding: "2rem", maxWidth: "48rem" }}>
      <h1 style={{ fontSize: "2rem", fontWeight: "bold", marginBottom: "0.5rem" }}>
        BTST Playground
      </h1>
      <p style={{ color: "#666", marginBottom: "1.5rem" }}>
        A demo project generated by the BTST Playground. Navigate to a plugin route below.
      </p>
      <nav>
        <Link
          to="/pages/$"
          params={{ _splat: "route-docs" }}
          style={{ color: "#2563eb", textDecoration: "underline" }}
        >
          /pages/route-docs — Browse all available routes
        </Link>
      </nav>
    </main>
  )
}
`,
		},
	};

	for (const file of generatedFiles) {
		files[file.path] = { content: file.content };
	}

	for (const file of seedFiles) {
		files[file.path] = { content: file.content };
	}

	if (seedRunnerScript) {
		files["seed-runner.mjs"] = { content: seedRunnerScript };
	}

	return files;
}

// ── Public dispatcher ────────────────────────────────────────────────────────

/**
 * Build the complete StackBlitz project file tree for the given framework.
 *
 * The base skeleton provides framework boilerplate (package.json, config,
 * CSS, root layout). Generated files from buildScaffoldPlan are merged on
 * top, overwriting any skeleton file with the same path.
 */
export function buildProjectFiles(
	framework: Framework,
	generatedFiles: FileWritePlanItem[],
	cssImports: string[],
	extraPackages: string[] = [],
	hasAiChat = false,
	seedFiles: SeedRouteFile[] = [],
	seedRunnerScript: string | null = null,
	seedPluginCode: string | null = null,
): ProjectFiles {
	if (framework === "react-router") {
		return buildReactRouterProjectFiles(
			generatedFiles,
			cssImports,
			extraPackages,
			hasAiChat,
			seedFiles,
			seedRunnerScript,
			seedPluginCode,
		);
	}
	if (framework === "tanstack") {
		return buildTanstackProjectFiles(
			generatedFiles,
			cssImports,
			extraPackages,
			hasAiChat,
			seedFiles,
			seedRunnerScript,
			seedPluginCode,
		);
	}
	return buildNextjsProjectFiles(
		generatedFiles,
		cssImports,
		extraPackages,
		hasAiChat,
		seedFiles,
		seedRunnerScript,
	);
}

/**
 * Convert project files to the format expected by @stackblitz/sdk embedProject()
 */
export function toSdkFiles(projectFiles: ProjectFiles): Record<string, string> {
	return Object.fromEntries(
		Object.entries(projectFiles).map(([path, { content }]) => [path, content]),
	);
}
