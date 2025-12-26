import { defineConfig } from "@playwright/test";
import { config } from "dotenv";
import { resolve } from "path";

// Load each project's .env file to get their specific environment variables.
// The first config() call also populates process.env for the test runner
// (used by tests to check if OPENAI_API_KEY is available for skip logic).
const nextjsEnv =
	config({ path: resolve(__dirname, "../examples/nextjs/.env") }).parsed || {};
const tanstackEnv =
	config({ path: resolve(__dirname, "../examples/tanstack/.env") }).parsed ||
	{};
const reactRouterEnv =
	config({ path: resolve(__dirname, "../examples/react-router/.env") })
		.parsed || {};

export default defineConfig({
	testDir: "./tests",
	timeout: 90_000,
	forbidOnly: !!process.env.CI,
	outputDir: "../test-results",
	reporter: [
		["list"],
		["html", { open: process.env.CI ? "never" : "on-failure" }],
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
		baseURL: "http://localhost:3000",
	},
	webServer: [
		// Next.js with memory provider and custom plugin
		{
			command: "pnpm -F examples/nextjs run start:e2e",
			port: 3003,
			reuseExistingServer: !process.env["CI"],
			timeout: 300_000,
			stdout: !process.env["CI"] ? "pipe" : "ignore",
			stderr: !process.env.CI ? "pipe" : "ignore",
			env: {
				...process.env,
				...nextjsEnv,
				PORT: "3003",
				HOST: "127.0.0.1",
				BASE_URL: "http://localhost:3003",
				NEXT_PUBLIC_BASE_URL: "http://localhost:3003",
			},
		},
		{
			command: "pnpm -F examples/tanstack run start:e2e",
			port: 3004,
			reuseExistingServer: !process.env["CI"],
			timeout: 300_000,
			stdout: "pipe",
			stderr: "pipe",
			env: {
				...process.env,
				...tanstackEnv,
				PORT: "3004",
				HOST: "127.0.0.1",
				BASE_URL: "http://localhost:3004",
			},
		},
		{
			command: "pnpm -F examples/react-router run start:e2e",
			port: 3005,
			reuseExistingServer: !process.env["CI"],
			timeout: 300_000,
			stdout: "pipe",
			stderr: "pipe",
			env: {
				...process.env,
				...reactRouterEnv,
				PORT: "3005",
				HOST: "127.0.0.1",
				BASE_URL: "http://localhost:3005",
			},
		},
	],
	projects: [
		{
			name: "nextjs:memory",
			fullyParallel: false,
			workers: 1,
			use: { baseURL: "http://localhost:3003" },
			testMatch: [
				"**/*.todos.spec.ts",
				"**/*.auth-blog.spec.ts",
				"**/*.blog.spec.ts",
				"**/*.chat.spec.ts",
				"**/*.public-chat.spec.ts",
				"**/*.cms.spec.ts",
				"**/*.relations-cms.spec.ts",
				"**/*.form-builder.spec.ts",
			],
		},
		{
			name: "tanstack:memory",
			use: { baseURL: "http://localhost:3004" },
			testMatch: [
				"**/*.blog.spec.ts",
				"**/*.chat.spec.ts",
				"**/*.cms.spec.ts",
				"**/*.relations-cms.spec.ts",
				"**/*.form-builder.spec.ts",
			],
		},
		{
			name: "react-router:memory",
			use: { baseURL: "http://localhost:3005" },
			testMatch: [
				"**/*.blog.spec.ts",
				"**/*.chat.spec.ts",
				"**/*.cms.spec.ts",
				"**/*.relations-cms.spec.ts",
				"**/*.form-builder.spec.ts",
			],
		},
	],
});
