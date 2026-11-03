import { createMemoryAdapter } from "@btst/adapter-memory";
import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createBackendStack } from "../../../api";
import { defineAuthorization } from "../../../authorization";
import { createServerAuth } from "../../../authorization/server";
import { cmsBackendPlugin } from "../../cms/api";
import { cmsPermissions } from "../../cms/permissions";
import { schoolBackendPlugin } from "../api/plugin";
import { schoolPermissions } from "../permissions";
import { SCHOOL_COURSE_CONTENT_TYPE } from "../schemas";
import type { Course, SchoolBackendOptions } from "../types";

const authorization = defineAuthorization({
	identity: z.object({ id: z.string() }),
	permissions: [cmsPermissions, schoolPermissions] as const,
	rules: ({ cms, school }) => [
		cms.contentType.read.allow(),
		cms.record.read.allow(),
		cms.record.create.allow(),
		cms.record.update.allow(),
		cms.record.delete.allow(),
		school.course.read.allow(),
		school.course.create.when(
			({ identity, facts }) => identity?.id === facts.instructorId,
		),
		school.course.manage.when(
			({ identity, facts }) => identity?.id === facts.instructorId,
		),
		school.enrollment.read.when(({ identity, facts }) =>
			facts.scope === "own"
				? identity !== null
				: identity?.id === facts.instructorId,
		),
		school.enrollment.enroll.when(({ identity }) => identity !== null),
		school.lesson.read.allow(),
		school.lesson.complete.when(({ identity }) => identity !== null),
		school.quiz.submit.when(({ identity }) => identity !== null),
		school.certificate.read.allow(),
	],
});
async function setup(options: SchoolBackendOptions = {}, withAuth = true) {
	const stack = createBackendStack({
		basePath: "/api/data",
		adapter: (db) => createMemoryAdapter(db)({}),
		...(withAuth
			? {
					auth: createServerAuth({
						authorization,
						getIdentity: ({ request }) =>
							request.headers.has("x-user")
								? { id: request.headers.get("x-user")! }
								: null,
					}),
				}
			: {}),
		plugins: {
			cms: cmsBackendPlugin({ contentTypes: [SCHOOL_COURSE_CONTENT_TYPE] }),
			school: schoolBackendPlugin(options),
		},
	});
	const course = await stack.trusted.school.createCourse({
		title: "TypeScript foundations",
		slug: "typescript",
		instructorId: "teacher",
		status: "published",
	});
	const text = await stack.trusted.school.createLesson({
		courseId: course.id,
		data: {
			title: "Types",
			type: "text",
			content: "Start with useful types",
			order: 0,
			isFreePreview: true,
		},
	});
	const quiz = await stack.trusted.school.createLesson({
		courseId: course.id,
		data: {
			title: "Check your understanding",
			type: "quiz",
			order: 1,
			quiz: {
				questions: [
					{
						id: "q1",
						question: "Which is a string?",
						options: ["hello", "42"],
						correctAnswer: 0,
					},
				],
				maxAttempts: 2,
			},
		},
	});
	const request = async (
		path: string,
		method = "GET",
		body?: unknown,
		user?: string,
	) =>
		stack.handler(
			new Request(`http://localhost/api/data/school${path}`, {
				method,
				headers: {
					...(user ? { "x-user": user } : {}),
					...(body ? { "content-type": "application/json" } : {}),
				},
				...(body ? { body: JSON.stringify(body) } : {}),
			}),
		);
	return { stack, course, text, quiz, request };
}

describe("School learning lifecycle", () => {
	it("protects instructor records and paid lessons while keeping previews and the SSG cache public", async () => {
		const { stack, course, text, quiz, request } = await setup();
		expect((await request(`/lessons/${text.id}`)).status).toBe(200);
		expect((await request(`/lessons/${quiz.id}`)).status).toBe(403);
		expect(
			(
				await request(
					`/courses/${course.id}`,
					"PATCH",
					{ title: "Stolen" },
					"student",
				)
			).status,
		).toBe(403);
		expect(
			(await request(`/lessons/${quiz.id}/edit`, "GET", undefined, "student"))
				.status,
		).toBe(403);
		const detail = await (
			await request("/catalog/typescript", "GET", undefined, "student")
		).json();
		expect(detail.enrollment).toBeNull();
		expect(JSON.stringify(detail)).not.toContain("correctAnswer");
		const qc = new QueryClient();
		await stack.raw.school.prefetchForRoute("course", qc, {
			slug: "typescript",
		});
		expect(qc.getQueryData(["schoolCourses", "detail", "typescript"])).toEqual(
			detail,
		);
		qc.clear();
	});
	it("fails paid enrollment closed and deduplicates successful requests with a stable payment key", async () => {
		const payment = vi.fn(
			async (_input: {
				userId: string;
				course: Course;
				idempotencyKey: string;
			}) => ({ paymentRef: "paid-1" }),
		);
		const { stack, course, request } = await setup({
			paymentAdapter: { createPayment: payment },
		});
		await stack.trusted.school.updateCourse({
			id: course.id,
			data: { price: 2000 },
		});
		const results = await Promise.all([
			request(`/courses/${course.id}/enroll`, "POST", undefined, "student"),
			request(`/courses/${course.id}/enroll`, "POST", undefined, "student"),
		]);
		expect(results.map((r) => r.status)).toEqual([200, 200]);
		expect(payment).toHaveBeenCalledTimes(1);
		expect(payment.mock.calls[0]?.[0]).toMatchObject({
			userId: "student",
			idempotencyKey: JSON.stringify([course.id, "student"]),
		});
		const noPayment = await setup();
		await noPayment.stack.trusted.school.updateCourse({
			id: noPayment.course.id,
			data: { price: 100 },
		});
		expect(
			(
				await noPayment.request(
					`/courses/${noPayment.course.id}/enroll`,
					"POST",
					undefined,
					"student",
				)
			).status,
		).toBe(402);
		expect(
			await (
				await noPayment.request("/me", "GET", undefined, "student")
			).json(),
		).toEqual({ items: [] });
	});
	it("scores on the server, blocks manual quiz completion, resumes progress, and issues one certificate", async () => {
		const onCourseComplete = vi.fn(async () => ({
			certificateId: "cert-typescript",
		}));
		const { course, text, quiz, request } = await setup({
			hooks: { onCourseComplete },
		});
		await request(`/courses/${course.id}/enroll`, "POST", undefined, "student");
		const lesson = await (
			await request(`/lessons/${quiz.id}`, "GET", undefined, "student")
		).json();
		expect(lesson.lesson.quiz.questions[0]).not.toHaveProperty("correctAnswer");
		expect(
			(
				await request(
					`/lessons/${quiz.id}/progress`,
					"POST",
					{ completed: true },
					"student",
				)
			).status,
		).toBe(400);
		await request(
			`/lessons/${text.id}/progress`,
			"POST",
			{ positionSecs: 27, completed: true },
			"student",
		);
		expect(
			(
				await (
					await request(`/lessons/${text.id}`, "GET", undefined, "student")
				).json()
			).progress.positionSecs,
		).toBe(27);
		const wrong = await (
			await request(
				`/lessons/${quiz.id}/quiz`,
				"POST",
				{
					answers: [{ questionId: "q1", answer: 1 }],
					score: 100,
					passed: true,
				},
				"student",
			)
		).json();
		expect(wrong).toMatchObject({ score: 0, passed: false });
		const right = await (
			await request(
				`/lessons/${quiz.id}/quiz`,
				"POST",
				{ answers: [{ questionId: "q1", answer: 0 }] },
				"student",
			)
		).json();
		expect(right).toMatchObject({ score: 100, passed: true });
		expect(
			(
				await request(
					`/lessons/${quiz.id}/quiz`,
					"POST",
					{ answers: [{ questionId: "q1", answer: 0 }] },
					"student",
				)
			).status,
		).toBe(409);
		const own = await (
			await request("/me", "GET", undefined, "student")
		).json();
		expect(own.items[0]).toMatchObject({
			status: "completed",
			progressPct: 100,
			certificateId: "cert-typescript",
		});
		expect(onCourseComplete).toHaveBeenCalledTimes(1);
		expect(
			await (await request("/certificates/cert-typescript")).json(),
		).toMatchObject({
			courseTitle: "TypeScript foundations",
			certificateId: "cert-typescript",
		});
		expect(
			await (await request("/me", "GET", undefined, "other")).json(),
		).toEqual({ items: [] });
		expect(
			(await request(`/lessons/${quiz.id}`, "GET", undefined, "other")).status,
		).toBe(403);
	});
	it("rejects cross-course section assignment and non-permutation reorder requests", async () => {
		const { stack, course, text, quiz } = await setup();
		const other = await stack.trusted.school.createCourse({
			title: "Other",
			slug: "other",
			instructorId: "teacher",
		});
		const section = await stack.trusted.school.createSection({
			courseId: other.id,
			data: { title: "Other section" },
		});
		await expect(
			stack.trusted.school.createLesson({
				courseId: course.id,
				data: { title: "Wrong", type: "text", sectionId: section.id },
			}),
		).rejects.toThrow("Section must belong");
		await expect(
			stack.trusted.school.reorderLessons({
				id: course.id,
				lessonIds: [text.id, text.id],
			}),
		).rejects.toThrow("exactly once");
		await stack.trusted.school.reorderLessons({
			id: course.id,
			lessonIds: [quiz.id, text.id],
		});
		expect(
			(
				await stack.trusted.school.getInstructorCourse({ id: course.id })
			).lessons.map((l) => l.id),
		).toEqual([quiz.id, text.id]);
	});
	it("keeps protected HTTP authoring closed when host authentication is absent", async () => {
		const { course, text, request } = await setup({}, false);
		expect((await request("/courses")).status).toBe(200);
		expect((await request(`/lessons/${text.id}`)).status).toBe(200);
		const requests = [
			request("/courses", "POST", {
				title: "New",
				slug: "new",
				instructorId: "teacher",
			}),
			request(`/courses/${course.id}`, "PATCH", { title: "Changed" }),
			request(`/courses/${course.id}`, "DELETE"),
			request(`/lessons/${text.id}/edit`),
			request(`/courses/${course.id}/students`),
		];
		expect((await Promise.all(requests)).map((r) => r.status)).toEqual([
			401, 401, 401, 401, 401,
		]);
	});
	it("preserves course publication on partial edits and cancels only the current student's enrollment", async () => {
		const { stack, course, request } = await setup();
		const updated = await stack.trusted.school.updateCourse({
			id: course.id,
			data: { price: 0 },
		});
		expect(updated.status).toBe("published");
		await request(`/courses/${course.id}/enroll`, "POST", undefined, "student");
		expect(
			(
				await request(
					`/courses/${course.id}/cancel`,
					"POST",
					undefined,
					"other",
				)
			).status,
		).toBe(404);
		expect(
			await (
				await request(
					`/courses/${course.id}/cancel`,
					"POST",
					undefined,
					"student",
				)
			).json(),
		).toMatchObject({ status: "cancelled" });
		expect(
			(
				await request(
					`/courses/${course.id}/enroll`,
					"POST",
					undefined,
					"student",
				)
			).status,
		).toBe(409);
	});
});
