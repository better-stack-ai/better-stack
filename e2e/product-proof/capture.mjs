#!/usr/bin/env node

import { chromium } from "@playwright/test";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { loadBlogRegistrationProof } from "./registration-contract.mjs";

const sourceRoot = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(sourceRoot, "../..");
const outputRoot = resolve(repoRoot, "docs/assets/product-proof");
const baseURL = process.env.PRODUCT_PROOF_BASE_URL ?? "http://localhost:3006";
const blogRegistrationProof = await loadBlogRegistrationProof(repoRoot);
const seed = JSON.parse(
	await readFile(join(sourceRoot, "dogfood-data.json"), "utf8"),
);
const manifest = JSON.parse(
	await readFile(join(outputRoot, "manifest.json"), "utf8"),
);
const captureRoot = await mkdtemp(join(tmpdir(), "btst-product-proof-"));

const palette = {
	ink: "#0B0D0E",
	graphite: "#191B1F",
	paper: "#F7F7F5",
	fog: "#E7E9EC",
	muted: "#5E6670",
	cobalt: "#2563EB",
	white: "#FFFFFF",
};

const forbiddenText = manifest.forbiddenText;

function escapeXml(value) {
	return String(value)
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;");
}

function textBlock(lines, x, y, size, options = {}) {
	const {
		color = palette.white,
		weight = 600,
		lineHeight = 1.15,
		mono = false,
	} = options;
	return `<text x="${x}" y="${y}" fill="${color}" font-family="${mono ? "Geist Mono, ui-monospace, monospace" : "Geist Sans, Geist, Arial, sans-serif"}" font-size="${size}" font-weight="${weight}" xml:space="preserve">${lines
		.map(
			(line, index) =>
				`<tspan x="${x}" dy="${index === 0 ? 0 : size * lineHeight}">${escapeXml(line)}</tspan>`,
		)
		.join("")}</text>`;
}

async function roundedScreenshot(input, width, height) {
	const mask = Buffer.from(
		`<svg width="${width}" height="${height}"><rect width="${width}" height="${height}" rx="22" fill="white"/></svg>`,
	);
	return sharp(input)
		.resize(width, height, {
			fit: "contain",
			position: "center",
			background: palette.ink,
		})
		.composite([{ input: mask, blend: "dest-in" }])
		.png()
		.toBuffer();
}

async function combineScreenshots(left, right) {
	const [leftPanel, rightPanel] = await Promise.all(
		[left, right].map((input) =>
			sharp(input)
				.resize(1120, 340, { fit: "cover", position: "top" })
				.png()
				.toBuffer(),
		),
	);
	return sharp({
		create: {
			width: 1120,
			height: 700,
			channels: 4,
			background: palette.ink,
		},
	})
		.composite([
			{ input: leftPanel, left: 0, top: 0 },
			{ input: rightPanel, left: 0, top: 360 },
		])
		.png()
		.toBuffer();
}

async function writeWebP(file, base, composites, quality = 72) {
	await sharp(base)
		.composite(composites)
		.webp({ quality, effort: 6, smartSubsample: true })
		.toFile(join(outputRoot, file));
}

function frameSvg({ eyebrow, title, body, result, label }) {
	return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900">
		<rect width="1600" height="900" fill="${palette.paper}"/>
		<rect width="400" height="900" fill="${palette.graphite}"/>
		<rect x="0" y="0" width="8" height="900" fill="${palette.cobalt}"/>
		<text x="64" y="90" fill="#94A3B8" font-family="Geist Mono, ui-monospace, monospace" font-size="18" font-weight="650" letter-spacing="2">${escapeXml(eyebrow.toUpperCase())}</text>
		${textBlock(title, 64, 170, 40, { weight: 720, lineHeight: 1.08 })}
		${textBlock(body, 64, 350, 21, { color: "#C8CDD3", weight: 420, lineHeight: 1.45 })}
		<rect x="64" y="670" width="302" height="66" rx="14" fill="#22262C" stroke="#39414B"/>
		<circle cx="91" cy="703" r="7" fill="${palette.cobalt}"/>
		<text x="113" y="698" fill="#94A3B8" font-family="Geist Mono, ui-monospace, monospace" font-size="14" letter-spacing="1">VISIBLE RESULT</text>
		<text x="113" y="720" fill="${palette.white}" font-family="Geist Sans, Geist, Arial, sans-serif" font-size="16" font-weight="600">${escapeXml(result)}</text>
		<text x="64" y="832" fill="#77808B" font-family="Geist Mono, ui-monospace, monospace" font-size="14">${escapeXml(label)}</text>
		<rect x="420" y="78" width="1160" height="744" rx="28" fill="#101214" stroke="#CCD1D7"/>
	</svg>`);
}

async function proofFrame(file, screenshot, copy) {
	const product = await roundedScreenshot(screenshot, 1120, 700);
	await writeWebP(file, frameSvg(copy), [
		{ input: product, left: 440, top: 100 },
		{
			input: Buffer.from(
				`<svg width="1120" height="700"><rect x="0.5" y="0.5" width="1119" height="699" rx="22" fill="none" stroke="#353B43"/></svg>`,
			),
			left: 440,
			top: 100,
		},
	]);
}

async function sanitizePage(page, { hideSuggestions = false } = {}) {
	await page.addStyleTag({
		content: `
			*, *::before, *::after { animation-duration: 0s !important; transition-duration: 0s !important; caret-color: transparent !important; }
			nextjs-portal, [data-nextjs-toast], [data-next-badge-root], .tsqd-open-btn-container { display: none !important; }
			[data-testid="chat-widget"] { display: none !important; }
		`,
	});
	await page.evaluate(
		({ hideSuggestions }) => {
			for (const button of document.querySelectorAll("button")) {
				const label =
					button.getAttribute("aria-label") ?? button.textContent ?? "";
				if (
					/Open (Next\.js Dev Tools|Tanstack query devtools|chat)|issues overlay|Collapse issues badge/i.test(
						label,
					)
				) {
					button.style.visibility = "hidden";
				}
			}
			if (hideSuggestions) {
				const suggestions = document.querySelectorAll(
					'[data-testid="chat-interface"] .flex.flex-wrap.justify-center.gap-2 > button',
				);
				if (suggestions.length === 0) {
					throw new Error("AI Chat suggestion controls were not found");
				}
				for (const suggestion of suggestions) suggestion.style.display = "none";
			}
		},
		{ hideSuggestions },
	);
	await page.evaluate(() => document.fonts.ready);
}

async function assertNoForbiddenText(page, asset) {
	const body = (await page.locator("body").innerText()).toLowerCase();
	for (const forbidden of forbiddenText) {
		if (body.includes(forbidden.toLowerCase())) {
			throw new Error(
				`${asset}: page contains forbidden text ${JSON.stringify(forbidden)}`,
			);
		}
	}
}

async function visit(page, path, options = {}) {
	const errors = [];
	const onConsole = (message) => {
		if (message.type() === "error") errors.push(message.text());
	};
	page.on("console", onConsole);
	const response = await page.goto(`${baseURL}${path}`, {
		waitUntil: "networkidle",
	});
	if (!response?.ok())
		throw new Error(`${path}: HTTP ${response?.status() ?? "unknown"}`);
	await sanitizePage(page, options);
	await assertNoForbiddenText(page, path);
	page.off("console", onConsole);
	const meaningfulErrors = errors.filter(
		(error) =>
			!error.includes("favicon") && !error.includes("Failed to load resource"),
	);
	if (meaningfulErrors.length > 0) {
		throw new Error(`${path}: console errors:\n${meaningfulErrors.join("\n")}`);
	}
}

async function screenshot(page, file) {
	const path = join(captureRoot, file);
	await page.screenshot({ path, animations: "disabled" });
	return path;
}

async function jsonRequest(request, method, path, data) {
	const response = await request.fetch(`${baseURL}${path}`, {
		method,
		headers: {
			cookie: `btst.example_session=mock-session-${seed.identity}`,
			...(data ? { "content-type": "application/json" } : {}),
		},
		...(data ? { data } : {}),
	});
	if (!response.ok()) {
		throw new Error(
			`${method} ${path}: ${response.status()} ${await response.text()}`,
		);
	}
	return response;
}

async function assertEmptyChatHistory(request) {
	const response = await jsonRequest(
		request,
		"GET",
		"/api/data/chat/conversations",
	);
	const conversations = await response.json();
	if (!Array.isArray(conversations) || conversations.length !== 0) {
		throw new Error(
			`AI Chat proof requires an empty authenticated history; found ${Array.isArray(conversations) ? conversations.length : "a non-array response"}`,
		);
	}
}

async function seedBlog(request) {
	const response = await jsonRequest(
		request,
		"GET",
		"/api/data/posts?limit=100&offset=0",
	);
	const current = await response.json();
	for (const post of current.items ?? []) {
		if (seed.posts.some((candidate) => candidate.slug === post.slug)) {
			await jsonRequest(request, "DELETE", `/api/data/posts/${post.id}`);
		}
	}
	for (const post of seed.posts)
		await jsonRequest(request, "POST", "/api/data/posts", post);
}

async function seedComments(request) {
	for (const comment of seed.comments) {
		for (const status of ["pending", "approved", "spam"]) {
			const params = new URLSearchParams({
				resourceId: comment.resourceId,
				resourceType: comment.resourceType,
				status,
				limit: "100",
				offset: "0",
			});
			const response = await jsonRequest(
				request,
				"GET",
				`/api/data/comments?${params}`,
			);
			const current = await response.json();
			for (const candidate of current.items ?? []) {
				if (candidate.body === comment.body) {
					await jsonRequest(
						request,
						"DELETE",
						`/api/data/comments/${candidate.id}`,
					);
				}
			}
		}
		const created = await jsonRequest(request, "POST", "/api/data/comments", {
			resourceId: comment.resourceId,
			resourceType: comment.resourceType,
			parentId: null,
			body: comment.body,
		});
		const createdComment = await created.json();
		if (comment.status !== createdComment.status) {
			await jsonRequest(
				request,
				"PATCH",
				`/api/data/comments/${createdComment.id}/status`,
				{ status: comment.status },
			);
		}
		const countParams = new URLSearchParams({
			resourceId: comment.resourceId,
			resourceType: comment.resourceType,
			status: comment.status,
		});
		const countResponse = await jsonRequest(
			request,
			"GET",
			`/api/data/comments/count?${countParams}`,
		);
		const { count } = await countResponse.json();
		if (count < 1) {
			throw new Error(
				`Comments fixture was not persisted for ${comment.resourceId}`,
			);
		}
	}
}

async function seedCms(request) {
	const path = `/api/data/content/${seed.cms.typeSlug}`;
	const response = await jsonRequest(
		request,
		"GET",
		`${path}?limit=100&offset=0`,
	);
	const current = await response.json();
	for (const item of current.items ?? []) {
		if (seed.cms.records.some((record) => record.slug === item.slug)) {
			await jsonRequest(request, "DELETE", `${path}/${item.id}`);
		}
	}
	for (const record of seed.cms.records) {
		await jsonRequest(request, "POST", path, record);
	}
	const persistedResponse = await jsonRequest(
		request,
		"GET",
		`${path}?limit=100&offset=0`,
	);
	const persisted = await persistedResponse.json();
	for (const record of seed.cms.records) {
		const matches = (persisted.items ?? []).filter(
			(item) =>
				item.slug === record.slug && item.parsedData?.name === record.data.name,
		);
		if (matches.length !== 1) {
			throw new Error(
				`CMS fixture expected one persisted ${record.slug} record`,
			);
		}
	}
}

async function seedKanban(request) {
	const currentResponse = await jsonRequest(
		request,
		"GET",
		`/api/data/boards?${new URLSearchParams({ slug: seed.kanban.slug, limit: "100" })}`,
	);
	const current = await currentResponse.json();
	for (const board of current.items ?? []) {
		await jsonRequest(request, "DELETE", `/api/data/boards/${board.id}`);
	}
	const createdResponse = await jsonRequest(
		request,
		"POST",
		"/api/data/boards",
		{
			name: seed.kanban.name,
			slug: seed.kanban.slug,
			description: seed.kanban.description,
		},
	);
	const board = await createdResponse.json();
	if (!Array.isArray(board.columns) || board.columns.length < 3) {
		throw new Error(
			"Kanban fixture requires the three generated board columns",
		);
	}
	for (const task of seed.kanban.tasks) {
		await jsonRequest(request, "POST", "/api/data/tasks", {
			title: task.title,
			description: task.description,
			priority: task.priority,
			columnId: board.columns[task.column].id,
		});
	}
	return board;
}

async function cleanupMedia(request) {
	const params = new URLSearchParams({
		query: seed.media.uploadName,
		limit: "100",
		offset: "0",
	});
	const currentResponse = await jsonRequest(
		request,
		"GET",
		`/api/data/media/assets?${params}`,
	);
	const current = await currentResponse.json();
	for (const asset of current.items ?? []) {
		if (asset.originalName === seed.media.uploadName) {
			await jsonRequest(
				request,
				"DELETE",
				`/api/data/media/assets/${asset.id}`,
			);
		}
	}
}

async function seedMedia(request) {
	await cleanupMedia(request);

	const fixtureBuffer = await readFile(resolve(sourceRoot, seed.media.fixture));
	const uploadedResponse = await request.post(
		`${baseURL}/api/data/media/upload`,
		{
			headers: {
				cookie: `btst.example_session=mock-session-${seed.identity}`,
			},
			multipart: {
				file: {
					name: seed.media.uploadName,
					mimeType: seed.media.mimeType,
					buffer: fixtureBuffer,
				},
			},
		},
	);
	if (!uploadedResponse.ok()) {
		throw new Error(
			`POST /api/data/media/upload: ${uploadedResponse.status()} ${await uploadedResponse.text()}`,
		);
	}
	const uploaded = await uploadedResponse.json();
	if (
		uploaded.originalName !== seed.media.uploadName ||
		uploaded.mimeType !== seed.media.mimeType ||
		uploaded.size !== fixtureBuffer.byteLength ||
		typeof uploaded.url !== "string" ||
		!uploaded.url.startsWith("/uploads/")
	) {
		throw new Error(
			`Media upload response did not match the deterministic fixture: ${JSON.stringify(uploaded)}`,
		);
	}
	await jsonRequest(request, "PATCH", `/api/data/media/assets/${uploaded.id}`, {
		alt: seed.media.alt,
	});

	const persistedResponse = await jsonRequest(
		request,
		"GET",
		`/api/data/media/assets?${new URLSearchParams({ query: seed.media.uploadName, limit: "100", offset: "0" })}`,
	);
	const persisted = await persistedResponse.json();
	const matchingAssets = (persisted.items ?? []).filter(
		(asset) =>
			asset.id === uploaded.id &&
			asset.originalName === seed.media.uploadName &&
			asset.mimeType === seed.media.mimeType &&
			asset.size === fixtureBuffer.byteLength &&
			asset.alt === seed.media.alt,
	);
	if (matchingAssets.length !== 1) {
		throw new Error(
			`Media fixture expected one persisted ${seed.media.uploadName}, found ${matchingAssets.length}`,
		);
	}
}

async function seedUiBuilder(request) {
	const response = await jsonRequest(
		request,
		"GET",
		"/api/data/content/ui-builder-page?limit=100&offset=0",
	);
	const current = await response.json();
	for (const page of current.items ?? []) {
		if (page.slug === seed.uiBuilder.slug) {
			await jsonRequest(
				request,
				"DELETE",
				`/api/data/content/ui-builder-page/${page.id}`,
			);
		}
	}
	const created = await jsonRequest(
		request,
		"POST",
		"/api/data/content/ui-builder-page",
		{
			slug: seed.uiBuilder.slug,
			data: {
				layers: JSON.stringify(seed.uiBuilder.layers),
				variables: "[]",
				status: "published",
			},
		},
	);
	return created.json();
}

function heroSvg() {
	return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900">
		<rect width="1600" height="900" fill="${palette.ink}"/>
		<rect x="0" y="0" width="10" height="900" fill="${palette.cobalt}"/>
		<text x="136" y="93" fill="#AAB1BA" font-family="Geist Mono, ui-monospace, monospace" font-size="20" font-weight="650" letter-spacing="2">BTST / COMPOSABLE CAPABILITIES FOR REACT</text>
		${textBlock(["Add complete capabilities.", "Keep your app."], 72, 205, 72, { weight: 740, lineHeight: 1.04 })}
		<text x="74" y="400" fill="#C3CAD2" font-family="Geist Sans, Geist, Arial, sans-serif" font-size="31" font-weight="480">Install a complete capability.</text>
		<rect x="1112" y="310" width="416" height="88" rx="18" fill="#171A1F" stroke="#38404A"/>
		<circle cx="1150" cy="354" r="8" fill="${palette.cobalt}"/>
		<text x="1174" y="361" fill="white" font-family="Geist Mono, ui-monospace, monospace" font-size="24" font-weight="600">REAL /pages/blog</text>
		<rect x="72" y="454" width="1456" height="374" rx="25" fill="#15181C" stroke="#343A42"/>
	</svg>`);
}

async function readmeHero(blog) {
	const symbol = await sharp(join(outputRoot, "source/btst-symbol.svg"))
		.resize(44, 44)
		.png()
		.toBuffer();
	const proofMask = Buffer.from(
		'<svg width="1416" height="334"><rect width="1416" height="334" rx="18" fill="white"/></svg>',
	);
	const blogProof = await sharp(blog)
		.extract({ left: 0, top: 66, width: 1440, height: 340 })
		.resize(1416, 334, { fit: "fill" })
		.composite([{ input: proofMask, blend: "dest-in" }])
		.png()
		.toBuffer();
	await writeWebP("readme-hero.webp", heroSvg(), [
		{ input: symbol, left: 72, top: 58 },
		{ input: blogProof, left: 92, top: 474 },
	]);
}

async function codeToResult(blog, registrationProof) {
	const result = await roundedScreenshot(blog, 760, 720);
	const base =
		Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900">
		<rect width="1600" height="900" fill="${palette.paper}"/>
		<text x="70" y="85" fill="${palette.cobalt}" font-family="Geist Mono, ui-monospace, monospace" font-size="18" font-weight="700" letter-spacing="2">CODE → RESULT</text>
		${textBlock(["One feature, registered", "on both sides."], 70, 160, 46, { color: palette.ink, weight: 720, lineHeight: 1.1 })}
		<rect x="70" y="300" width="640" height="430" rx="22" fill="#111418"/>
		<text x="110" y="350" fill="#778291" font-family="Geist Mono, ui-monospace, monospace" font-size="15">BACKEND / lib/stack.ts</text>
		${textBlock(registrationProof.backendExcerpt, 110, 395, 17, {
			color: "#DDE3EA",
			weight: 500,
			lineHeight: 1.45,
			mono: true,
		})}
		<text x="110" y="505" fill="#778291" font-family="Geist Mono, ui-monospace, monospace" font-size="15">CLIENT / lib/stack-client.tsx</text>
		${textBlock(registrationProof.clientExcerpt, 110, 535, 14, {
			color: "#DDE3EA",
			weight: 500,
			lineHeight: 1.3,
			mono: true,
		})}
		<text x="110" y="710" fill="#7EA6FF" font-family="Geist Mono, ui-monospace, monospace" font-size="17">ROUTE /pages/blog</text>
		<path d="M735 510H805" stroke="${palette.cobalt}" stroke-width="5" stroke-linecap="round"/>
		<path d="M790 492L810 510L790 528" fill="none" stroke="${palette.cobalt}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
		<rect x="826" y="90" width="710" height="720" rx="24" fill="#111418" stroke="#CBD0D6"/>
	</svg>`);
	await writeWebP("code-to-result.webp", base, [
		{ input: result, left: 826, top: 90 },
	]);
}

async function main() {
	await mkdir(outputRoot, { recursive: true });
	const browser = await chromium.launch({ headless: true });
	const context = await browser.newContext({
		viewport: { width: 1440, height: 900 },
		deviceScaleFactor: 1,
		colorScheme: "dark",
		reducedMotion: "reduce",
		locale: "en-US",
		timezoneId: "UTC",
	});
	await context.addCookies([
		{
			name: "btst.example_session",
			value: `mock-session-${seed.identity}`,
			url: baseURL,
			httpOnly: true,
			sameSite: "Lax",
		},
	]);
	await context.addInitScript(() => localStorage.setItem("theme", "dark"));
	const page = await context.newPage();
	try {
		await seedBlog(context.request);
		await seedComments(context.request);
		await seedCms(context.request);
		const kanbanBoard = await seedKanban(context.request);
		await visit(page, "/pages/blog");
		await page.getByRole("heading", { name: "Blog Posts" }).waitFor();
		const blog = await screenshot(page, "blog.png");

		await visit(page, "/pages/forms/new");
		await page.getByPlaceholder("Enter form name").fill(seed.form.name);
		await page.getByPlaceholder("enter-form-slug").fill(seed.form.slug);
		const canvas = page.getByTestId("canvas-drop-zone");
		await page
			.getByRole("button", { name: "Email", exact: true })
			.dragTo(canvas);
		await page
			.getByRole("button", { name: "Text Area", exact: true })
			.dragTo(page.getByTestId("form-builder-canvas"));
		await page
			.getByRole("button", { name: "Select", exact: true })
			.dragTo(page.getByTestId("form-builder-canvas"));
		const form = await screenshot(page, "form-builder.png");

		await visit(page, "/pages/cms");
		await page.getByTestId("cms-dashboard-page").waitFor();
		const cmsDashboard = await screenshot(page, "cms-dashboard.png");
		await visit(page, `/pages/cms/${seed.cms.typeSlug}`);
		await page.getByText(seed.cms.records[0].slug, { exact: true }).waitFor();
		const cmsRecords = await screenshot(page, "cms-records.png");
		const cms = await combineScreenshots(cmsDashboard, cmsRecords);

		const uiBuilderPage = await seedUiBuilder(context.request);
		await visit(page, `/pages/ui-builder/${uiBuilderPage.id}/edit`);
		await page.getByRole("heading", { name: "Component Properties" }).waitFor();
		const uiBuilder = await screenshot(page, "ui-builder.png");

		await visit(page, `/pages/kanban/${kanbanBoard.id}`);
		await page.getByText(seed.kanban.name, { exact: true }).waitFor();
		const kanban = await screenshot(page, "kanban.png");

		await visit(page, "/pages/comments/moderation");
		await page.getByTestId("tab-approved").click();
		await page.getByText(seed.comments[0].body, { exact: true }).waitFor();
		const comments = await screenshot(page, "comments.png");

		await seedMedia(context.request);
		await visit(page, seed.media.libraryPath);
		await page.getByPlaceholder(seed.media.expectedControl).waitFor();
		await page
			.getByPlaceholder(seed.media.expectedControl)
			.fill(seed.media.uploadName);
		const mediaCard = page
			.locator('[data-testid="media-asset-item"]')
			.filter({ hasText: seed.media.uploadName });
		await mediaCard.waitFor();
		if ((await mediaCard.count()) !== 1) {
			throw new Error(
				`Media library expected one visible ${seed.media.uploadName} card`,
			);
		}
		const media = await screenshot(page, "media.png");

		await visit(page, seed.routeDocs.pagePath);
		await page
			.getByText(seed.routeDocs.expectedTitle, { exact: false })
			.first()
			.waitFor();
		const routeDocs = await screenshot(page, "route-docs.png");

		await visit(page, seed.openApi.referencePath);
		await page
			.getByText(seed.openApi.expectedTitle, { exact: false })
			.first()
			.waitFor({ timeout: 30_000 });
		const openapi = await screenshot(page, "openapi.png");

		await assertEmptyChatHistory(context.request);
		await visit(page, "/pages/chat", { hideSuggestions: true });
		await page
			.getByTestId("chat-sidebar")
			.getByText("No conversations yet", { exact: true })
			.waitFor();
		await page.getByPlaceholder("Type a message...").fill(seed.chatPrompt);
		await assertNoForbiddenText(page, "ai-chat-proof");
		const chat = await screenshot(page, "ai-chat.png");

		await proofFrame("blog-proof.webp", blog, {
			eyebrow: "Canonical full-stack proof",
			title: ["Blog ships", "a complete", "slice."],
			body: [
				"Routes, backend behavior,",
				"client UI, and product output",
				"arrive as one plugin.",
			],
			result: "Published product route",
			label: "BLOG / AUTHENTIC GENERATED APP",
		});
		await proofFrame("form-builder-proof.webp", form, {
			eyebrow: "Rich interaction proof",
			title: ["Build forms", "inside your app."],
			body: [
				"A real drag-and-drop builder",
				"and live preview—not a",
				"decorative mockup.",
			],
			result: "Editable form + live preview",
			label: "FORM BUILDER / AUTHENTIC GENERATED APP",
		});
		await proofFrame("cms-proof.webp", cms, {
			eyebrow: "Schema-to-operations proof",
			title: ["Define content.", "Give editors", "a workflow."],
			body: [
				"The dashboard reflects types",
				"defined in code; the list shows",
				"records stored by the same app.",
			],
			result: "Content model + managed records",
			label: "CMS / TWO AUTHENTIC WORKFLOW STATES",
		});
		await proofFrame("ui-builder-proof.webp", uiBuilder, {
			eyebrow: "Complex UI proof",
			title: ["Compose pages.", "Keep the code."],
			body: [
				"The builder works against the",
				"same application runtime and",
				"deployment boundary.",
			],
			result: "Published page composition",
			label: "UI BUILDER / AUTHENTIC GENERATED APP",
		});
		await proofFrame("kanban-proof.webp", kanban, {
			eyebrow: "Workflow state proof",
			title: ["Move work", "through", "your app."],
			body: [
				"The generated board holds",
				"columns, priorities, and tasks",
				"in the adopter's database.",
			],
			result: "Board + columns + task state",
			label: "KANBAN / AUTHENTIC GENERATED APP",
		});
		await proofFrame("comments-proof.webp", comments, {
			eyebrow: "Moderation proof",
			title: ["Discussion", "stays with", "the resource."],
			body: [
				"A seeded resource comment",
				"appears in the shipped",
				"moderation workflow.",
			],
			result: "Resource context + moderation",
			label: "COMMENTS / AUTHENTIC GENERATED APP",
		});
		await proofFrame("media-proof.webp", media, {
			eyebrow: "Storage-to-library proof",
			title: ["Upload once.", "Reuse the asset."],
			body: [
				"A checked-in fixture moves",
				"through the real upload API",
				"into the generated library.",
			],
			result: "Uploaded file + stored metadata",
			label: "MEDIA / AUTHENTIC GENERATED APP",
		});
		await proofFrame("route-docs-proof.webp", routeDocs, {
			eyebrow: "Registered-route proof",
			title: ["See routes", "your stack", "composed."],
			body: [
				"The reference is generated",
				"from actual client plugins,",
				"parameters, and sitemaps.",
			],
			result: "Route + plugin + parameter context",
			label: "ROUTE DOCS / AUTHENTIC GENERATED APP",
		});
		await proofFrame("openapi-proof.webp", openapi, {
			eyebrow: "One-sided plugin proof",
			title: ["OpenAPI needs", "no client half."],
			body: [
				"Add a focused backend",
				"capability without forcing",
				"a matching product interface.",
			],
			result: "Browsable API reference",
			label: "OPENAPI / AUTHENTIC GENERATED APP",
		});
		await proofFrame("ai-chat-proof.webp", chat, {
			eyebrow: "Authenticated shell proof",
			title: ["Authenticated.", "Prompt ready."],
			body: [
				"This capture proves the",
				"conversation shell and prompt",
				"boundary—not a fabricated",
				"reply.",
			],
			result: "Prompt ready to send",
			label: "AI CHAT / NO MODEL OUTPUT FABRICATED",
		});
		await readmeHero(blog);
		await codeToResult(blog, blogRegistrationProof);
	} finally {
		try {
			await cleanupMedia(context.request);
		} finally {
			await browser.close();
		}
	}
	console.log(`Captured product proof to ${outputRoot}`);
}

try {
	await main();
} finally {
	await rm(captureRoot, { recursive: true, force: true });
}
