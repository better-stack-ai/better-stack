import { expect, test, type APIRequestContext } from "@playwright/test";
import { mockAuthHeaders, setMockAuthCookie } from "./helpers/mock-auth";

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

test("student previews, enrolls, resumes, passes a quiz and verifies a certificate", async ({
	page,
	context,
	request,
}) => {
	const slug = `typescript-essentials-${Date.now().toString(36)}`;
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
		await page.goto(`/pages/learn/${slug}`);
		await expect(
			page.getByRole("heading", { name: "TypeScript essentials", exact: true }),
		).toBeVisible();
		await setMockAuthCookie(context, "student-school-e2e");
		await page.reload();
		await page.getByRole("button", { name: /enroll/i }).click();
		await page.goto(`/pages/learn/${slug}/lessons/${textLesson.id}`);
		await expect(
			page.getByText(
				"Use a type guard to narrow a union before reading a property.",
			),
		).toBeVisible();
		await page.getByRole("button", { name: /mark.*complete/i }).click();
		const studentHeaders = mockAuthHeaders("student-school-e2e");
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
		await page.goto("/pages/learn/me");
		await page.getByRole("link", { name: /continue learning/i }).click();
		await expect(page).toHaveURL(new RegExp(`/learn/${slug}/lessons/`));
		const studentQuiz = await request.get(
			`/api/data/school/lessons/${quizLesson.id}`,
			{ headers: studentHeaders },
		);
		expect(await studentQuiz.text()).not.toContain("correctAnswer");
		await page.goto(`/pages/learn/${slug}/lessons/${quizLesson.id}/quiz`);
		await page.getByLabel("A type guard", { exact: true }).check();
		await page.getByRole("button", { name: /submit.*(quiz|answers)/i }).click();
		await expect(page.getByText(/100%/).first()).toBeVisible();
		await page.goto("/pages/learn/me");
		await page.getByRole("link", { name: /certificate/i }).click();
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
		await page
			.getByRole("link", { name: "Create course", exact: true })
			.click();
		await page
			.getByLabel("Course title", { exact: true })
			.fill("A course written by an instructor");
		await page.getByLabel("Course address").fill(slug);
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
			.getByLabel("Section", { exact: true })
			.selectOption({ label: "First steps" });
		await page
			.getByLabel("Lesson content", { exact: true })
			.fill("Your first lesson is ready.");
		await page
			.getByRole("button", { name: "Save lesson", exact: true })
			.click();
		await expect(
			page.getByRole("link", { name: "Start here", exact: true }),
		).toBeVisible();
		await page.getByLabel("Status", { exact: true }).selectOption("published");
		await page
			.getByRole("button", { name: "Save course", exact: true })
			.click();
		await expect(page.getByRole("status")).toContainText("Course saved");
		await page.getByRole("link", { name: "View course", exact: true }).click();
		await expect(
			page.getByRole("heading", {
				name: "A course written by an instructor",
				exact: true,
			}),
		).toBeVisible();
		await page.goto(`/pages/learn/instructor/courses/${courseId}`);
		await page.getByLabel("Status", { exact: true }).selectOption("archived");
		await page
			.getByRole("button", { name: "Save course", exact: true })
			.click();
		await expect(page.getByRole("status")).toContainText("Course saved");
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
