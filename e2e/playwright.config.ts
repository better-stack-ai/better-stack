import { defineConfig } from "@playwright/test";

export default defineConfig({
	testDir: "./tests",
	timeout: 90_000,
	forbidOnly: !!process.env.CI,
	outputDir: "../test-results",
	reporter: process.env.CI
		? [["list"], ["html", { open: "never" }]]
		: [["list"]],
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
			timeout: 120_000,
			stdout: "pipe",
			stderr: "pipe",
			env: {
				...process.env,
				PORT: "3003",
				HOST: "127.0.0.1",
				BASE_URL: "http://localhost:3003",
				NEXT_PUBLIC_BASE_URL: "http://localhost:3003",
				OPENAI_API_KEY: process.env.OPENAI_API_KEY || "",
			},
		},
		{
			command: "pnpm -F examples/tanstack run start:e2e",
			port: 3004,
			reuseExistingServer: !process.env["CI"],
			timeout: 120_000,
			stdout: "pipe",
			stderr: "pipe",
			env: {
				...process.env,
				PORT: "3004",
				HOST: "127.0.0.1",
				BASE_URL: "http://localhost:3004",
				OPENAI_API_KEY: process.env.OPENAI_API_KEY || "",
			},
		},
		{
			command: "pnpm -F examples/react-router run start:e2e",
			port: 3005,
			reuseExistingServer: !process.env["CI"],
			timeout: 120_000,
			stdout: "pipe",
			stderr: "pipe",
			env: {
				...process.env,
				PORT: "3005",
				HOST: "127.0.0.1",
				BASE_URL: "http://localhost:3005",
				OPENAI_API_KEY: process.env.OPENAI_API_KEY || "",
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
			],
		},
		{
			name: "tanstack:memory",
			use: { baseURL: "http://localhost:3004" },
			testMatch: ["**/*.blog.spec.ts", "**/*.chat.spec.ts"],
		},
		{
			name: "react-router:memory",
			use: { baseURL: "http://localhost:3005" },
			testMatch: ["**/*.blog.spec.ts", "**/*.chat.spec.ts"],
		},
	],
});
