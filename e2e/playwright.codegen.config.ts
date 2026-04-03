import { defineConfig } from "@playwright/test";
import { config } from "dotenv";
import { resolve } from "path";

// Load each codegen project's .env file.
// The first config() call also populates process.env for the test runner
// (used by tests to check if OPENAI_API_KEY is available for skip logic).
const nextjsEnv =
	config({ path: resolve(__dirname, "../codegen-projects/nextjs/.env") })
		.parsed || {};
const tanstackEnv =
	config({ path: resolve(__dirname, "../codegen-projects/tanstack/.env") })
		.parsed || {};
const reactRouterEnv =
	config({ path: resolve(__dirname, "../codegen-projects/react-router/.env") })
		.parsed || {};

// When BTST_FRAMEWORK is set, only the matching webServer and project are
// started — useful for running a single framework locally or in a matrix CI job.
type Framework = "nextjs" | "tanstack" | "react-router";
const framework = process.env.BTST_FRAMEWORK as Framework | undefined;

// SSG tests only apply to Next.js (generateStaticParams). React Router and
// TanStack Start do not have SSG support, so smoke.ssg.spec.ts is excluded.
const NEXTJS_ONLY_PATTERNS = ["**/*.ssg.spec.ts"];

const ALL_TEST_PATTERNS = [
	"**/*.todos.spec.ts",
	"**/*.auth-blog.spec.ts",
	"**/*.blog.spec.ts",
	"**/*.chat.spec.ts",
	"**/*.public-chat.spec.ts",
	"**/*.cms.spec.ts",
	"**/*.relations-cms.spec.ts",
	"**/*.form-builder.spec.ts",
	"**/*.ui-builder.spec.ts",
	"**/*.kanban.spec.ts",
	"**/*.comments.spec.ts",
	"**/*.ssg.spec.ts",
	"**/*.page-context.spec.ts",
	"**/*.wealthreview.spec.ts",
	"**/*.media.spec.ts",
];

// React Router and TanStack share the same pattern set, minus SSG tests
const NON_NEXTJS_TEST_PATTERNS = ALL_TEST_PATTERNS.filter(
	(p) => !NEXTJS_ONLY_PATTERNS.includes(p),
);

const allWebServers = [
	{
		framework: "nextjs" as Framework,
		config: {
			command: "pnpm -F nextjs run start:e2e",
			port: 3006,
			reuseExistingServer: true,
			timeout: 300_000,
			stdout: "pipe" as const,
			stderr: "pipe" as const,
			env: {
				...process.env,
				...nextjsEnv,
				PORT: "3006",
				HOST: "127.0.0.1",
				BASE_URL: "http://localhost:3006",
				NEXT_PUBLIC_BASE_URL: "http://localhost:3006",
			},
		},
	},
	{
		framework: "tanstack" as Framework,
		config: {
			command: "pnpm -F tanstack run start:e2e",
			port: 3007,
			reuseExistingServer: true,
			timeout: 300_000,
			stdout: "pipe" as const,
			stderr: "pipe" as const,
			env: {
				...process.env,
				...tanstackEnv,
				PORT: "3007",
				HOST: "127.0.0.1",
				BASE_URL: "http://localhost:3007",
			},
		},
	},
	{
		framework: "react-router" as Framework,
		config: {
			command: "pnpm -F react-router run start:e2e",
			port: 3008,
			reuseExistingServer: true,
			timeout: 300_000,
			stdout: "pipe" as const,
			stderr: "pipe" as const,
			env: {
				...process.env,
				...reactRouterEnv,
				PORT: "3008",
				HOST: "127.0.0.1",
				BASE_URL: "http://localhost:3008",
			},
		},
	},
];

const allProjects = [
	{
		framework: "nextjs" as Framework,
		config: {
			name: "nextjs:codegen",
			fullyParallel: false,
			workers: 1,
			use: { baseURL: "http://localhost:3006" },
			testMatch: ALL_TEST_PATTERNS,
		},
	},
	{
		framework: "tanstack" as Framework,
		config: {
			name: "tanstack:codegen",
			fullyParallel: false,
			workers: 1,
			use: { baseURL: "http://localhost:3007" },
			testMatch: NON_NEXTJS_TEST_PATTERNS,
		},
	},
	{
		framework: "react-router" as Framework,
		config: {
			name: "react-router:codegen",
			fullyParallel: false,
			workers: 1,
			use: { baseURL: "http://localhost:3008" },
			testMatch: NON_NEXTJS_TEST_PATTERNS,
		},
	},
];

const webServers = framework
	? allWebServers.filter((s) => s.framework === framework).map((s) => s.config)
	: allWebServers.map((s) => s.config);

const projects = framework
	? allProjects.filter((p) => p.framework === framework).map((p) => p.config)
	: allProjects.map((p) => p.config);

export default defineConfig({
	testDir: "./tests",
	timeout: 90_000,
	forbidOnly: !!process.env.CI,
	outputDir: "../test-results-codegen",
	reporter: [
		["list"],
		["html", { open: "never", outputFolder: "playwright-report-codegen" }],
	],
	expect: {
		timeout: 10_000,
	},
	retries: process.env["CI"] ? 2 : 0,
	use: {
		trace: "retain-on-failure",
		video: "retain-on-failure",
		screenshot: "only-on-failure",
		actionTimeout: 15_000,
		navigationTimeout: 30_000,
		baseURL: "http://localhost:3006",
		viewport: { width: 1280, height: 900 },
	},
	webServer: webServers,
	projects,
});
