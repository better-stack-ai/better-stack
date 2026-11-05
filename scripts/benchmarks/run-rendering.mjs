import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
	mkdir,
	readFile,
	writeFile,
	appendFile,
	readdir,
} from "node:fs/promises";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { cpus, freemem, totalmem, release } from "node:os";
import { join, resolve } from "node:path";
import { gzipSync } from "node:zlib";

const require = createRequire(
	new URL("../../e2e/package.json", import.meta.url),
);
const { chromium } = require("@playwright/test");
const option = (name, fallback) =>
	process.argv.includes(name)
		? process.argv[process.argv.indexOf(name) + 1]
		: fallback;
assert(
	process.argv.includes("--apps") && process.argv.includes("--output"),
	"Usage: run-rendering.mjs --apps DIR --output DIR [--runs 15]",
);
const apps = resolve(option("--apps"));
const output = resolve(option("--output"));
const repetitions = Number(option("--runs", "15"));
const throttle = !process.argv.includes("--unthrottled");
const routes = ["core", "reader", "editor", "multi"];
const ports = { v5: 3210, v6: 3211 };
await mkdir(output, { recursive: true });
assert.equal(
	(await readdir(output)).length,
	0,
	"Results directory must be empty",
);
const servers = [];
let browser;
const raw = [];
const failures = [];
const expected = {
	core: "BTST core workspace",
	reader: "A practical guide to a shared project workspace",
	editor: "Add New Post",
	multi: "Project workspace dashboard",
};
const metadata = {
	startedAt: new Date().toISOString(),
	node: process.version,
	chromium: null,
	state: "running",
	playwright: require("@playwright/test/package.json").version,
	platform: process.platform,
	kernel: release(),
	cpu: cpus()[0].model,
	cpuCount: cpus().length,
	memoryBytes: totalmem(),
	availableMemoryBytes: freemem(),
	repetitions,
	profile: {
		viewport: { width: 1280, height: 800 },
		cpuSlowdown: throttle ? 4 : 1,
		latencyMs: throttle ? 150 : 0,
		downloadBytesPerSecond: throttle ? 1_600_000 / 8 : null,
		uploadBytesPerSecond: throttle ? 750_000 / 8 : null,
	},
	provenance: null,
	metrics: {
		shellHydrationMs: "App-shell effect; not completion of all lazy children",
		contentVisibleMs:
			"First animation frame with route-specific content visible",
		routeReadyMs:
			"In-page animation-frame observation of hydrated route readiness, including the contenteditable editor",
		editorInputFrameReadyMs:
			"Trusted beforeinput to edited DOM and next requestAnimationFrame callback; frame-readiness proxy",
		counterFrameReadyMs:
			"Trusted counter click to DOM commit and next requestAnimationFrame callback; frame-readiness proxy, not post-paint or field INP",
		navigationFrameReadyMs:
			"Trusted client-link click to in-page route readiness at a requestAnimationFrame callback; no link prefetch",
	},
};

function observe() {
	const metrics = {
		cls: 0,
		lcpMs: null,
		lcpElement: null,
		contentVisibleMs: null,
		routeReadyMs: null,
	};
	window.__benchmark = metrics;
	window.__frameResults = {};
	window.__routeReady = (route) => {
		const titles = {
			core: "BTST core workspace",
			reader: "A practical guide to a shared project workspace",
			editor: "Add New Post",
			multi: "Project workspace dashboard",
		};
		const visible = (element) =>
			element && element.getBoundingClientRect().height > 0;
		if (
			!Array.from(document.querySelectorAll("h1")).some(
				(element) => element.textContent === titles[route] && visible(element),
			)
		)
			return false;
		if (document.documentElement.dataset.hydrated !== "true") return false;
		if (
			route === "editor" &&
			!visible(document.querySelector(".milkdown-custom [contenteditable]"))
		)
			return false;
		if (
			route === "multi" &&
			!Array.from(document.querySelectorAll("li")).some(
				(element) => element.textContent === "Articles" && visible(element),
			)
		)
			return false;
		return true;
	};
	window.__watchInputFrame = ({ selector, event, text, metric }) => {
		window.__frameResults[metric] = null;
		const element = document.querySelector(selector);
		element.addEventListener(
			event,
			(input) => {
				if (!input.isTrusted)
					throw new Error("Benchmark input must be trusted");
				const start = performance.now();
				const observer = new MutationObserver(() => {
					if (!element.textContent.includes(text)) return;
					observer.disconnect();
					requestAnimationFrame(() => {
						window.__frameResults[metric] = performance.now() - start;
					});
				});
				observer.observe(element, {
					childList: true,
					subtree: true,
					characterData: true,
				});
			},
			{ once: true, capture: true },
		);
	};

	new PerformanceObserver((list) => {
		for (const entry of list.getEntries()) {
			metrics.lcpMs = entry.startTime;
			metrics.lcpElement = {
				tag: entry.element?.tagName,
				id: entry.element?.id,
				className: entry.element?.className,
				text: entry.element?.textContent?.slice(0, 160),
				size: entry.size,
			};
		}
	}).observe({ type: "largest-contentful-paint", buffered: true });
	new PerformanceObserver((list) => {
		for (const entry of list.getEntries())
			if (!entry.hadRecentInput) metrics.cls += entry.value;
	}).observe({ type: "layout-shift", buffered: true });
	function sample() {
		const selector =
			location.pathname === "/editor"
				? 'input[name="title"]'
				: location.pathname === "/reader"
					? '[data-testid="post-page"] h1'
					: '[data-benchmark="content"] h1, h1[data-benchmark="content"]';
		const element = document.querySelector(selector);
		if (
			element?.getBoundingClientRect().height > 0 &&
			metrics.contentVisibleMs === null
		)
			metrics.contentVisibleMs = performance.now();
		if (
			metrics.routeReadyMs === null &&
			window.__routeReady(location.pathname.slice(1))
		)
			metrics.routeReadyMs = performance.now();
		requestAnimationFrame(sample);
	}
	requestAnimationFrame(sample);
}

async function ready(page, route) {
	await page
		.getByRole("heading", { name: expected[route], exact: true })
		.waitFor({ state: "visible", timeout: 60_000 });
	await page.waitForFunction(
		() => document.documentElement.dataset.hydrated === "true",
	);
	if (route === "editor")
		await page
			.locator(".milkdown-custom [contenteditable]")
			.first()
			.waitFor({ state: "visible", timeout: 60_000 });
	if (route === "multi")
		await page
			.getByText("Articles", { exact: true })
			.waitFor({ state: "visible" });
}

async function measure(page, variant, route, cache, repetition, assets) {
	const errors = [];
	const onError = (error) => errors.push(error.message);
	page.on("pageerror", onError);
	const response = await page.goto(
		`http://127.0.0.1:${ports[variant]}/${route}`,
		{ waitUntil: "domcontentloaded" },
	);
	assert.equal(response.status(), 200);
	await ready(page, route);
	await page.waitForFunction(() => window.__benchmark.routeReadyMs !== null);
	await page.waitForTimeout(750);
	const metrics = await page.evaluate(() => {
		const navigation = performance.getEntriesByType("navigation")[0];
		return {
			...window.__benchmark,
			ttfbMs: navigation.responseStart - navigation.startTime,
			fcpMs:
				performance.getEntriesByName("first-contentful-paint")[0]?.startTime ??
				null,
			shellHydrationMs:
				performance.getEntriesByName("benchmark-hydrated")[0]?.startTime ??
				null,
			jsTransferBytes: performance
				.getEntriesByType("resource")
				.filter((entry) => new URL(entry.name).pathname.endsWith(".js"))
				.reduce((sum, entry) => sum + entry.transferSize, 0),
			cssTransferBytes: performance
				.getEntriesByType("resource")
				.filter((entry) => new URL(entry.name).pathname.endsWith(".css"))
				.reduce((sum, entry) => sum + entry.transferSize, 0),
			loadedAssets: performance
				.getEntriesByType("resource")
				.filter((entry) => /\.(js|css)$/.test(new URL(entry.name).pathname))
				.map((entry) => ({
					path: new URL(entry.name).pathname,
					encodedBodySize: entry.encodedBodySize,
					transferSize: entry.transferSize,
				})),
		};
	});
	await page.evaluate(() =>
		window.__watchInputFrame({
			selector: '[data-benchmark="counter"]',
			event: "click",
			text: "Interaction counter: 1",
			metric: "counterFrameReadyMs",
		}),
	);
	await page.locator('[data-benchmark="counter"]').click();
	await page.waitForFunction(
		() => window.__frameResults.counterFrameReadyMs !== null,
	);
	metrics.counterFrameReadyMs = await page.evaluate(
		() => window.__frameResults.counterFrameReadyMs,
	);
	if (route === "editor") {
		await page.evaluate(() =>
			window.__watchInputFrame({
				selector: ".milkdown-custom [contenteditable]",
				event: "beforeinput",
				text: "A benchmark editing interaction.",
				metric: "editorInputFrameReadyMs",
			}),
		);
		await page
			.locator(".milkdown-custom [contenteditable]")
			.first()
			.fill("A benchmark editing interaction.");
		await page.waitForFunction(
			() => window.__frameResults.editorInputFrameReadyMs !== null,
		);
		metrics.editorInputFrameReadyMs = await page.evaluate(
			() => window.__frameResults.editorInputFrameReadyMs,
		);
	}
	assert.deepEqual(errors, [], `${variant}/${route} browser errors`);
	page.off("pageerror", onError);
	const row = {
		variant,
		route,
		cache,
		repetition,
		warmup: repetition < 0,
		...metrics,
	};
	raw.push(row);
	await appendFile(join(output, "samples.jsonl"), `${JSON.stringify(row)}\n`);
	for (const asset of metrics.loadedAssets) assets.add(asset.path);
	if (repetition < 0)
		await page.screenshot({
			path: join(output, `${variant}-${route}-${cache}.png`),
			fullPage: true,
		});
	return row;
}

let phase = "initialization";
let cleanupPromise;
async function cleanup() {
	if (cleanupPromise) return cleanupPromise;
	cleanupPromise = (async () => {
		const closing = browser?.close().catch(() => {});
		for (const child of servers) {
			try {
				process.kill(-child.pid, "SIGTERM");
			} catch (error) {
				if (error.code !== "ESRCH")
					failures.push({ phase: "cleanup", error: error.message });
			}
		}
		await Promise.race([
			Promise.allSettled([
				closing,
				...servers.map((child) =>
					child.exitCode !== null
						? Promise.resolve()
						: new Promise((resolve) => child.once("exit", resolve)),
				),
			]),
			new Promise((resolve) => setTimeout(resolve, 3000)),
		]);
		for (const child of servers) {
			try {
				process.kill(-child.pid, "SIGKILL");
			} catch (error) {
				if (error.code !== "ESRCH")
					failures.push({ phase: "cleanup", error: error.message });
			}
		}
		metadata.finishedAt = new Date().toISOString();
		metadata.failures = failures;
		await writeFile(
			join(output, "metadata.json"),
			`${JSON.stringify(metadata, null, 2)}\n`,
		);
		await writeFile(
			join(output, "samples.json"),
			`${JSON.stringify(raw, null, 2)}\n`,
		);
	})();
	return cleanupPromise;
}
function onSignal(signal) {
	metadata.state = "aborted";
	failures.push({ phase, signal });
	void cleanup().finally(() => process.exit(signal === "SIGINT" ? 130 : 143));
}
process.once("SIGINT", onSignal);
process.once("SIGTERM", onSignal);
try {
	assert(
		Number.isInteger(repetitions) && repetitions >= 0,
		"Run count must be a nonnegative integer",
	);
	metadata.provenance = JSON.parse(
		await readFile(join(apps, "provenance.json"), "utf8"),
	);
	assert.equal(metadata.provenance.baseline.version, "5.2.0");
	assert.equal(
		metadata.provenance.baseline.gitHead,
		"2e176fe1d83866de1decd1109bc2efd05ac3d18e",
	);
	assert.match(metadata.provenance.harnessGitHead, /^[a-f0-9]{40}$/);
	for (const name of [
		"@btst/stack",
		"@btst/plugin-blog",
		"@btst/plugin-cms",
		"@btst/plugin-kanban",
	]) {
		const candidate = metadata.provenance.candidate[name];
		assert.match(candidate.gitHead, /^[a-f0-9]{40}$/);
		assert.match(candidate.integrity, /^sha512-/);
		assert(candidate.bytes > 0);
	}
	browser = await chromium.launch({
		headless: true,
		handleSIGINT: false,
		handleSIGTERM: false,
		handleSIGHUP: false,
	});
	metadata.chromium = browser.version();
	for (const variant of ["v5", "v6"]) {
		phase = `server-${variant}`;
		await new Promise((resolve, reject) => {
			const probe = createServer();
			probe.once("error", reject);
			probe.listen(ports[variant], "127.0.0.1", () => probe.close(resolve));
		});
		const child = spawn("pnpm", ["start", "--port", String(ports[variant])], {
			cwd: join(apps, variant),
			env: {
				...process.env,
				NODE_ENV: "production",
				NEXT_TELEMETRY_DISABLED: "1",
			},
			detached: true,
			stdio: ["ignore", "pipe", "pipe"],
		});
		servers.push(child);
		child.stdout.on("data", (chunk) =>
			appendFile(join(output, `${variant}-server.log`), chunk),
		);
		child.stderr.on("data", (chunk) =>
			appendFile(join(output, `${variant}-server.log`), chunk),
		);
		let responsive = false;
		for (let attempt = 0; attempt < 120; attempt++) {
			try {
				const response = await fetch(`http://127.0.0.1:${ports[variant]}/core`);
				if (response.ok) {
					responsive = true;
					break;
				}
			} catch {}
			await new Promise((resolve) => setTimeout(resolve, 250));
		}
		assert(responsive, `${variant} production server did not start`);
		// Exclude process/module cold-start from browser cold-cache measurements.
		for (const route of routes) {
			phase = `ssr-${variant}-${route}`;
			const response = await fetch(
				`http://127.0.0.1:${ports[variant]}/${route}`,
			);
			const html = await response.text();
			assert(
				response.ok &&
					new RegExp(`<h1[^>]*>${expected[route]}</h1>`).test(html),
				`${variant}/${route} missing expected server-rendered content`,
			);
			await writeFile(join(output, `${variant}-${route}-ssr.html`), html);
		}
	}
	const assets = { v5: new Set(), v6: new Set() };
	for (let repetition = -1; repetition < repetitions; repetition++) {
		const variants = repetition % 2 ? ["v6", "v5"] : ["v5", "v6"];
		for (const route of [
			...routes.slice(repetition % routes.length),
			...routes.slice(0, repetition % routes.length),
		]) {
			for (const variant of variants) {
				phase = `sample-${variant}-${route}-${repetition}`;
				const context = await browser.newContext({
					viewport: metadata.profile.viewport,
					reducedMotion: "reduce",
				});
				await context.addInitScript(observe);
				if (repetition < 0)
					await context.tracing.start({ screenshots: true, snapshots: true });
				const page = await context.newPage();
				const cdp = await context.newCDPSession(page);
				await cdp.send("Network.enable");
				await cdp.send("Network.setCacheDisabled", { cacheDisabled: false });
				if (throttle) {
					await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
					await cdp.send("Network.emulateNetworkConditions", {
						offline: false,
						latency: 150,
						downloadThroughput: 1_600_000 / 8,
						uploadThroughput: 750_000 / 8,
					});
				}
				try {
					await measure(
						page,
						variant,
						route,
						"cold",
						repetition,
						assets[variant],
					);
					await measure(
						page,
						variant,
						route,
						"warm",
						repetition,
						assets[variant],
					);
					// A separate navigation measurement exercises Next's client router.
					if (route !== "core") {
						await page.goto(`http://127.0.0.1:${ports[variant]}/core`);
						await ready(page, "core");
						await page.evaluate(
							({ route }) => {
								window.__navigationFrame = null;
								const link = document.querySelector(`nav a[href="/${route}"]`);
								link.addEventListener(
									"click",
									(event) => {
										if (!event.isTrusted)
											throw new Error("Benchmark navigation must be trusted");
										const start = performance.now();
										function sample() {
											if (window.__routeReady(route))
												window.__navigationFrame = performance.now() - start;
											else requestAnimationFrame(sample);
										}
										requestAnimationFrame(sample);
									},
									{ once: true, capture: true },
								);
							},
							{ route },
						);
						await page.locator(`nav a[href="/${route}"]`).click();
						await page.waitForFunction(() => window.__navigationFrame !== null);
						const navigationFrameReadyMs = await page.evaluate(
							() => window.__navigationFrame,
						);
						const row = {
							variant,
							route,
							cache: "navigation",
							repetition,
							warmup: repetition < 0,
							navigationFrameReadyMs,
						};
						raw.push(row);
						await appendFile(
							join(output, "samples.jsonl"),
							`${JSON.stringify(row)}\n`,
						);
					}
					if (repetition < 0)
						await context.tracing.stop({
							path: join(output, `${variant}-${route}-trace.zip`),
						});
				} catch (error) {
					await page
						.screenshot({
							path: join(output, `${variant}-${route}-failure.png`),
						})
						.catch(() => {});
					throw error;
				} finally {
					await context.close();
				}
			}
			console.log(
				JSON.stringify({ completed: repetition + 1, repetitions, route }),
			);
		}
	}
	const assetSizes = {};
	for (const variant of ["v5", "v6"]) {
		assetSizes[variant] = [];
		for (const path of assets[variant]) {
			const buffer = await readFile(
				join(apps, variant, ".next", path.replace("/_next/", "")),
			);
			assetSizes[variant].push({
				path,
				bytes: buffer.length,
				gzipBytes: gzipSync(buffer).length,
			});
		}
	}
	await writeFile(
		join(output, "asset-sizes.json"),
		`${JSON.stringify(assetSizes, null, 2)}\n`,
	);
	metadata.state = "completed";
} catch (error) {
	if (metadata.state !== "aborted") {
		metadata.state = "failed";
		failures.push({ phase, error: error.message });
		console.error(error);
		process.exitCode = 1;
	}
} finally {
	await cleanup();
	process.off("SIGINT", onSignal);
	process.off("SIGTERM", onSignal);
}
