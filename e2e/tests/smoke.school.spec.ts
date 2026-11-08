import { expect, test, type APIRequestContext } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { mockAuthHeaders, setMockAuthCookie } from "./helpers/mock-auth";
import { waitForTanStackHydration } from "./helpers/hydration";

async function createCourse(request: APIRequestContext, slug: string) {
	const headers = mockAuthHeaders();
	const response = await request.post("/api/data/school/courses", {
		headers,
		data: {
			title: "TypeScript essentials",
			slug,
			instructorId: "admin-e2e",
			instructorName: "Course instructor",
			description: "Learn to narrow types and check your understanding.",
			category: "Programming",
			status: "published",
		},
	});
	expect(response.ok(), await response.text()).toBe(true);
	return response.json() as Promise<{ id: string }>;
}

test("lesson authoring uploads refresh a warmed Media picker", async ({
	page,
	context,
	request,
}) => {
	const suffix = Date.now().toString(36);
	const course = await createCourse(request, `media-cache-${suffix}`);
	const headers = mockAuthHeaders();
	const image = readFileSync(resolve(__dirname, "../fixtures/test-image.png"));
	let assetId: string | undefined;
	try {
		const created = await request.post(
			`/api/data/school/courses/${course.id}/lessons`,
			{
				headers,
				data: {
					title: "Cached images",
					type: "text",
					content: "Original notes.",
				},
			},
		);
		expect(created.ok(), await created.text()).toBe(true);
		const lesson = await created.json();
		await setMockAuthCookie(context);
		await page.goto(
			`/pages/learn/instructor/courses/${course.id}/lessons/${lesson.id}`,
		);
		let lists = 0;
		page.on("request", (request) => {
			if (
				request.method() === "GET" &&
				new URL(request.url()).pathname.endsWith("/media/assets")
			)
				lists++;
		});
		await page
			.getByRole("button", { name: "Browse media", exact: true })
			.click();
		await expect(
			page
				.getByTestId("media-asset-item")
				.first()
				.or(page.getByText("No files found", { exact: true })),
		).toBeVisible();
		await page.getByRole("button", { name: "Close", exact: true }).click();
		const warmed = lists;
		const content = page.getByLabel("Lesson content");
		let rejectedUploads = 0;
		await page.route("**/media/upload", (route) => {
			rejectedUploads++;
			return route.fulfill({
				status: 503,
				contentType: "application/json",
				body: JSON.stringify({ message: "Upload unavailable" }),
			});
		});
		await page.getByLabel("Upload lesson image").setInputFiles({
			name: "rejected.png",
			mimeType: "image/png",
			buffer: image,
		});
		await expect(
			page.getByRole("alert").filter({ hasText: "Upload unavailable" }),
		).toBeVisible();
		expect(rejectedUploads).toBe(1);
		await expect(content).toHaveValue("Original notes.");
		expect(lists).toBe(warmed);
		await page.unroute("**/media/upload");
		const name = `authoring-cache-${suffix}`;
		const uploaded = page.waitForResponse(
			(response) =>
				response.request().method() === "POST" &&
				new URL(response.url()).pathname.endsWith("/media/upload"),
		);
		await page.getByLabel("Upload lesson image").setInputFiles({
			name: `${name}.png`,
			mimeType: "image/png",
			buffer: image,
		});
		const response = await uploaded;
		expect(response.ok(), await response.text()).toBe(true);
		assetId = (await response.json()).id;
		await expect(content).toHaveValue(new RegExp(name));
		await page
			.getByRole("button", { name: "Browse media", exact: true })
			.click();
		await expect(
			page.getByTestId("media-asset-item").filter({ hasText: name }),
		).toBeVisible();
		expect(lists).toBe(warmed + 1);
	} finally {
		if (assetId)
			await request.delete(`/api/data/media/assets/${assetId}`, { headers });
		await request.delete(`/api/data/school/courses/${course.id}`, { headers });
	}
});

test("lesson discussions survive course renames and link back from My comments", async ({
	page,
	context,
	request,
}) => {
	const slug = `lesson-discussion-${Date.now().toString(36)}`;
	const course = await createCourse(request, slug);
	const headers = mockAuthHeaders();
	try {
		const response = await request.post(
			`/api/data/school/courses/${course.id}/lessons`,
			{
				headers,
				data: {
					title: "Discuss narrowing",
					type: "text",
					content: "Use a type guard.",
					isFreePreview: true,
				},
			},
		);
		expect(response.ok(), await response.text()).toBe(true);
		const lesson = await response.json();
		await setMockAuthCookie(context);
		await page.goto(`/pages/learn/${slug}/lessons/${lesson.id}`);
		const thread = page.getByTestId("comment-thread");
		await thread.scrollIntoViewIfNeeded();
		await expect(thread).toBeVisible();
		await thread
			.getByRole("textbox")
			.fill("Can a type guard narrow this union?");
		const posted = page.waitForResponse(
			(result) =>
				result.request().method() === "POST" &&
				new URL(result.url()).pathname === "/api/data/comments" &&
				result.ok(),
		);
		await thread
			.getByRole("button", { name: "Post comment", exact: true })
			.click();
		const comment = await (await posted).json();
		expect(comment.resourceType).toBe("school-lesson");
		await expect(
			thread.getByText("Can a type guard narrow this union?", { exact: true }),
		).toBeVisible();
		const renamedSlug = `${slug}-renamed`;
		const renamed = await request.patch(
			`/api/data/school/courses/${course.id}`,
			{
				headers,
				data: { slug: renamedSlug },
			},
		);
		expect(renamed.ok(), await renamed.text()).toBe(true);
		await page.goto(`/pages/learn/${renamedSlug}/lessons/${lesson.id}`);
		await page.reload();
		await expect(
			page
				.getByTestId("comment-thread")
				.getByText(comment.body, { exact: true }),
		).toBeVisible();
		expect(comment.resourceId).toBe(`${course.id}/lessons/${lesson.id}`);
		await page.goto("/pages/comments");
		const href = `/pages/learn/~${course.id}/lessons/${lesson.id}#comments`;
		const link = page.locator(`a[href="${href}"]`);
		await expect(link).toBeVisible();
		const opened = page.waitForEvent("popup");
		await link.click();
		const lessonPage = await opened;
		await expect(lessonPage).toHaveURL(
			new RegExp(`/lessons/${lesson.id}#comments$`),
		);
		await expect(
			lessonPage
				.getByTestId("comment-thread")
				.getByText(comment.body, { exact: true }),
		).toBeVisible();
		await lessonPage.close();
	} finally {
		await request.delete(`/api/data/school/courses/${course.id}`, { headers });
	}
});

test("student previews, enrolls, resumes, passes a quiz and verifies a certificate", async ({
	page,
	context,
	request,
}) => {
	const slug = `typescript-essentials-${Date.now().toString(36)}`;
	const studentId = `student-school-${slug}`;
	const cancellationStudentId = `student-school-cancel-${slug}`;
	// The browser query runs after hydration attaches handlers to SSR controls.
	const waitForOwnEnrollments = () =>
		page.waitForResponse(
			(response) =>
				response.request().method() === "GET" &&
				new URL(response.url()).pathname === "/api/data/school/me" &&
				response.ok(),
		);
	const course = await createCourse(request, slug);
	const headers = mockAuthHeaders();
	try {
		const textResponse = await request.post(
			`/api/data/school/courses/${course.id}/lessons`,
			{
				headers,
				data: {
					title: "Narrowing a union",
					type: "text",
					content:
						"Use a type guard to narrow a union before reading a property.",
					isFreePreview: true,
					order: 0,
				},
			},
		);
		expect(textResponse.ok(), await textResponse.text()).toBe(true);
		const textLesson = await textResponse.json();
		const quizResponse = await request.post(
			`/api/data/school/courses/${course.id}/lessons`,
			{
				headers,
				data: {
					title: "Check your understanding",
					type: "quiz",
					order: 1,
					quiz: {
						passMark: 100,
						maxAttempts: 2,
						questions: [
							{
								id: "guard",
								question: "What narrows a union?",
								options: ["A type guard", "A comment"],
								correctAnswer: 0,
							},
						],
					},
				},
			},
		);
		expect(quizResponse.ok(), await quizResponse.text()).toBe(true);
		const quizLesson = await quizResponse.json();
		expect(
			(await request.get(`/api/data/school/lessons/${quizLesson.id}`)).ok(),
		).toBe(false);
		expect(
			(await request.get(`/api/data/school/lessons/${textLesson.id}`)).ok(),
		).toBe(true);
		await page.goto("/pages/learn");
		await page.waitForLoadState("networkidle");
		const search = page.getByRole("searchbox", { name: "Search", exact: true });
		let releaseFilteredResponses = () => {};
		let filteredResponseHeld = false;
		const filteredResponsesGate = new Promise<void>((resolve) => {
			releaseFilteredResponses = resolve;
		});
		const filteredCoursesPath = "**/api/data/school/courses?*";
		await page.route(filteredCoursesPath, async (route) => {
			const response = await route.fetch();
			filteredResponseHeld = true;
			await filteredResponsesGate;
			await route.fulfill({ response });
		});
		try {
			await search.fill("Type");
			await expect.poll(() => filteredResponseHeld).toBe(true);
			await expect(search).toBeVisible();
			await expect(search).toBeFocused();
			await search.pressSequentially("Script");
			await expect(search).toHaveValue("TypeScript");
			await expect(search).toBeFocused();
			const finalFilteredResponse = page.waitForResponse((response) => {
				const url = new URL(response.url());
				return (
					url.pathname.endsWith("/school/courses") &&
					url.searchParams.get("query") === "TypeScript"
				);
			});
			releaseFilteredResponses();
			expect((await finalFilteredResponse).ok()).toBe(true);
			await expect(
				page.getByRole("heading", {
					name: "TypeScript essentials",
					exact: true,
				}),
			).toBeVisible();
		} finally {
			releaseFilteredResponses();
			await page.unroute(filteredCoursesPath);
		}
		await page
			.getByRole("link", { name: "TypeScript essentials", exact: true })
			.click();
		await expect(page).toHaveURL(new RegExp(`/learn/${slug}$`));
		await expect(
			page.getByRole("heading", { name: "TypeScript essentials", exact: true }),
		).toBeVisible();
		await setMockAuthCookie(context, studentId);
		const enrollmentPageReady = waitForOwnEnrollments();
		await page.reload();
		await enrollmentPageReady;
		await page.getByRole("button", { name: /enroll/i }).click();
		await expect(page).toHaveURL(new RegExp(`/lessons/${textLesson.id}$`));
		await expect(
			page.getByText(
				"Use a type guard to narrow a union before reading a property.",
			),
		).toBeVisible();
		await page.waitForLoadState("networkidle");
		let postCommitFailureInjected = false;
		await page.route(
			`**/api/data/school/lessons/${textLesson.id}/progress`,
			async (route) => {
				if (
					route.request().method() === "POST" &&
					route.request().postDataJSON()?.completed === true &&
					!postCommitFailureInjected
				) {
					const response = await route.fetch();
					expect(response.ok()).toBe(true);
					postCommitFailureInjected = true;
					await route.fulfill({
						status: 500,
						contentType: "application/json",
						body: JSON.stringify({
							message: "Completion response interrupted",
						}),
					});
					return;
				}
				await route.continue();
			},
		);
		await page.getByRole("button", { name: /mark.*complete/i }).click();
		await expect(
			page.getByText("Completion response interrupted", { exact: true }),
		).toBeVisible();
		expect(postCommitFailureInjected).toBe(true);
		const studentHeaders = mockAuthHeaders(studentId);
		await expect
			.poll(async () => {
				const result = await request.get("/api/data/school/me", {
					headers: studentHeaders,
				});
				return (await result.json()).items.find(
					(item: { courseId: string }) => item.courseId === course.id,
				)?.progressPct;
			})
			.toBe(50);
		await page
			.getByRole("navigation", { name: "School", exact: true })
			.getByRole("link", { name: "My courses", exact: true })
			.click();
		await expect(page.getByText("50% complete", { exact: true })).toBeVisible();
		await page.getByRole("link", { name: /continue learning/i }).click();
		await expect(page).toHaveURL(new RegExp(`/learn/${slug}/lessons/`));
		const studentQuiz = await request.get(
			`/api/data/school/lessons/${quizLesson.id}`,
			{ headers: studentHeaders },
		);
		expect(await studentQuiz.text()).not.toContain("correctAnswer");
		await page
			.getByRole("link", { name: "Check your understanding", exact: true })
			.click();
		await expect(page).toHaveURL(new RegExp(`/lessons/${quizLesson.id}$`));
		await page.getByLabel("A type guard", { exact: true }).check();
		await page.getByRole("button", { name: /submit.*(quiz|answers)/i }).click();
		await expect(page.getByText(/100%/).first()).toBeVisible();
		await page
			.getByRole("navigation", { name: "School", exact: true })
			.getByRole("link", { name: "My courses", exact: true })
			.click();
		await expect(
			page.getByRole("link", { name: /certificate/i }),
		).toBeVisible();
		await page.getByRole("link", { name: /certificate/i }).click();
		await expect(page).toHaveURL(/\/learn\/certificates\/[^/?]+$/);
		await expect(
			page.getByRole("heading", {
				name: "Certificate verification",
				exact: true,
			}),
		).toBeVisible();
		await expect(
			page.getByText("TypeScript essentials", { exact: true }),
		).toBeVisible();
		await context.clearCookies();
		await page.reload();
		await expect(
			page.getByText("TypeScript essentials", { exact: true }),
		).toBeVisible();
		const students = await request.get(
			`/api/data/school/courses/${course.id}/students`,
			{ headers },
		);
		expect(await students.json()).toMatchObject({
			analytics: { totalEnrolled: 1, totalCompleted: 1 },
		});
		await setMockAuthCookie(context, cancellationStudentId);
		const cancellationCourseReady = waitForOwnEnrollments();
		await page.goto(`/pages/learn/${slug}`);
		await cancellationCourseReady;
		await page
			.getByRole("button", { name: "Enroll for free", exact: true })
			.click();
		await expect(page).toHaveURL(new RegExp(`/lessons/${textLesson.id}$`));
		const cancellationPortalReady = waitForOwnEnrollments();
		await page.goto("/pages/learn/me");
		await cancellationPortalReady;
		let cancellationMessage = "";
		page.once("dialog", async (dialog) => {
			cancellationMessage = dialog.message();
			await dialog.accept();
		});
		await page
			.getByRole("button", { name: "Cancel enrollment", exact: true })
			.click();
		await expect(
			page.getByRole("heading", {
				name: "Your first lesson starts here",
				exact: true,
			}),
		).toBeVisible();
		expect(cancellationMessage).toContain(
			"This enrollment cannot be restarted.",
		);
		await page.goto(`/pages/learn/${slug}`);
		await expect(
			page.getByText(
				"Enrollment cancelled. This enrollment cannot be restarted.",
				{ exact: true },
			),
		).toBeVisible();
		await expect(page.getByRole("button", { name: /enroll/i })).toHaveCount(0);
	} finally {
		const cleanup = await request.delete(
			`/api/data/school/courses/${course.id}`,
			{ headers },
		);
		expect(cleanup.ok(), await cleanup.text()).toBe(true);
	}
});

test("instructor creates a course and lesson, publishes, then archives it", async ({
	page,
	context,
	request,
}) => {
	const slug = `instructor-course-${Date.now().toString(36)}`;
	const headers = mockAuthHeaders();
	let courseId: string | undefined;
	await setMockAuthCookie(context);
	try {
		await page.goto("/pages/learn/instructor");
		await waitForTanStackHydration(page);
		await page
			.getByRole("link", { name: "Create course", exact: true })
			.click();
		await waitForTanStackHydration(page);
		await page
			.getByLabel("Course title", { exact: true })
			.fill("A course written by an instructor");
		await page.getByLabel("Course address").fill(slug);
		await expect(page.getByLabel("Course title", { exact: true })).toHaveValue(
			"A course written by an instructor",
		);
		await expect(page.getByLabel("Course address")).toHaveValue(slug);
		await page
			.getByRole("button", { name: "Create course", exact: true })
			.click();
		await expect(page).toHaveURL(
			/\/learn\/instructor\/courses\/(?!new)[^/?]+$/,
		);
		courseId = new URL(page.url()).pathname.split("/").at(-1);
		await page.getByLabel("New section", { exact: true }).fill("First steps");
		await page
			.getByRole("button", { name: "Add section", exact: true })
			.click();
		await expect(page.getByLabel("Section title", { exact: true })).toHaveValue(
			"First steps",
		);
		await page.getByRole("link", { name: "Add lesson", exact: true }).click();
		await page.getByLabel("Lesson title", { exact: true }).fill("Start here");
		await page
			.getByRole("combobox", { name: "Section", exact: true })
			.selectOption({ label: "First steps" });
		await page
			.getByRole("textbox", { name: /^Lesson content/ })
			.fill("Your first lesson is ready.");
		await page
			.getByRole("button", { name: "Save lesson", exact: true })
			.click();
		await expect(
			page.getByRole("link", { name: "Start here", exact: true }),
		).toBeVisible();
		const courseBeforeReorder = await request.get(
			`/api/data/school/courses/${courseId}`,
			{ headers },
		);
		const firstSectionId = (await courseBeforeReorder.json()).sections[0].id;
		const nextSectionResponse = await request.post(
			`/api/data/school/courses/${courseId}/sections`,
			{
				headers,
				data: { title: "Next steps", order: 1 },
			},
		);
		expect(nextSectionResponse.ok(), await nextSectionResponse.text()).toBe(
			true,
		);
		const nextSection = await nextSectionResponse.json();
		for (const lesson of [
			{ title: "Keep practicing", sectionId: firstSectionId, order: 1 },
			{ title: "Apply it", sectionId: nextSection.id, order: 2 },
		]) {
			const response = await request.post(
				`/api/data/school/courses/${courseId}/lessons`,
				{
					headers,
					data: { ...lesson, type: "text", content: "Practice the lesson." },
				},
			);
			expect(response.ok(), await response.text()).toBe(true);
		}
		const editorReady = page.waitForResponse(
			(response) =>
				response.url().endsWith(`/school/courses/${courseId}/students`) &&
				response.ok(),
		);
		await page.reload();
		await waitForTanStackHydration(page);
		await editorReady;
		const lessonLinks = page.locator(".school-edit-lessons").getByRole("link");
		await expect(lessonLinks).toHaveText([
			"Start here",
			"Keep practicing",
			"Apply it",
		]);
		const reorderResponse = page.waitForResponse(
			(response) =>
				response.url().endsWith(`/school/courses/${courseId}/reorder`) &&
				response.request().method() === "POST",
		);
		await page
			.getByRole("button", { name: "Move Start here down", exact: true })
			.click();
		expect((await reorderResponse).ok()).toBe(true);
		await expect(lessonLinks).toHaveText([
			"Keep practicing",
			"Start here",
			"Apply it",
		]);
		await expect(
			page.getByRole("button", {
				name: "Move Keep practicing down",
				exact: true,
			}),
		).toBeEnabled();
		await expect(
			page.getByRole("button", { name: "Move Start here down", exact: true }),
		).toBeDisabled();
		await expect(
			page.getByRole("button", { name: "Move Apply it up", exact: true }),
		).toBeDisabled();
		const beforeCrossSectionDrop = (
			await (
				await request.get(`/api/data/school/courses/${courseId}`, { headers })
			).json()
		).lessons;
		let crossSectionReorders = 0;
		page.on("request", (request) => {
			if (
				request.method() === "POST" &&
				request.url().endsWith(`/school/courses/${courseId}/reorder`)
			)
				crossSectionReorders += 1;
		});
		await page
			.locator(".school-edit-lessons > li")
			.filter({
				has: page.getByRole("link", { name: "Start here", exact: true }),
			})
			.dragTo(
				page.locator(".school-edit-lessons > li").filter({
					has: page.getByRole("link", { name: "Apply it", exact: true }),
				}),
			);
		const afterCrossSectionDrop = (
			await (
				await request.get(`/api/data/school/courses/${courseId}`, { headers })
			).json()
		).lessons;
		expect(afterCrossSectionDrop).toEqual(beforeCrossSectionDrop);
		expect(crossSectionReorders).toBe(0);
		await page
			.getByRole("combobox", { name: "Status", exact: true })
			.selectOption("published");
		await page
			.getByRole("button", { name: "Save course", exact: true })
			.click();
		await expect(
			page.getByText("Course saved.", { exact: true }),
		).toBeVisible();
		await page.getByRole("link", { name: "View course", exact: true }).click();
		await expect(
			page.getByRole("heading", {
				name: "A course written by an instructor",
				exact: true,
			}),
		).toBeVisible();
		const archiveEditorReady = page.waitForResponse(
			(response) =>
				response.url().endsWith(`/school/courses/${courseId}/students`) &&
				response.ok(),
		);
		await page.goto(`/pages/learn/instructor/courses/${courseId}`);
		await waitForTanStackHydration(page);
		await archiveEditorReady;
		await page
			.getByRole("combobox", { name: "Status", exact: true })
			.selectOption("archived");
		const archiveResponse = page.waitForResponse(
			(response) =>
				response.url().endsWith(`/school/courses/${courseId}`) &&
				response.request().method() === "PATCH",
		);
		await page
			.getByRole("button", { name: "Save course", exact: true })
			.click();
		await expect(
			page.getByText("Course saved.", { exact: true }),
		).toBeVisible();
		expect(await (await archiveResponse).json()).toMatchObject({
			status: "archived",
		});
		expect(
			(await request.get(`/api/data/school/catalog/${slug}`)).status(),
		).toBe(404);
	} finally {
		if (courseId) {
			const cleanup = await request.delete(
				`/api/data/school/courses/${courseId}`,
				{ headers },
			);
			expect(cleanup.ok(), await cleanup.text()).toBe(true);
		}
	}
});
