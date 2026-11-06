import { createHmac } from "node:crypto";
import { stripeAdapter, type PaymentAdapter } from "@btst/stack/payments";
import type { DBAdapter } from "@btst/db";
import { createMemoryAdapter } from "@btst/adapter-memory";
import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createBackendStack } from "@btst/stack/api";
import { defineAuthorization } from "@btst/stack/authorization";
import { createServerAuth } from "@btst/stack/authorization/server";
import { cmsBackendPlugin } from "@btst/plugin-cms/api";
import { cmsPermissions } from "@btst/plugin-cms/permissions";
import { schoolBackendPlugin } from "../api/plugin";
import { schoolPermissions } from "../permissions";
import {
	SCHOOL_COURSE_CONTENT_TYPE,
	courseSchema,
	quizSchema,
} from "../schemas";
import type { SchoolBackendOptions } from "../types";

const webhookSecret = "test-webhook-secret";
function signedPaymentWebhook(
	path: string,
	orderId: string,
	options: {
		type?: string;
		amount?: number;
		currency?: string;
		paymentRef?: string;
		invalidSignature?: boolean;
	} = {},
) {
	const timestamp = String(Math.floor(Date.now() / 1000));
	const raw = JSON.stringify(
		{
			type: options.type ?? "payment_intent.succeeded",
			livemode: false,
			data: {
				object: {
					id: options.paymentRef ?? "pi-verified",
					metadata: { orderId },
					amount_received: options.amount ?? 2000,
					amount: options.amount ?? 2000,
					currency: options.currency ?? "usd",
				},
			},
		},
		null,
		2,
	);
	const signature = options.invalidSignature
		? "00".repeat(32)
		: createHmac("sha256", webhookSecret)
				.update(`${timestamp}.${raw}`)
				.digest("hex");
	return new Request(`http://localhost/api/data${path}`, {
		method: "POST",
		body: raw,
		headers: {
			"content-type": "application/json",
			"stripe-signature": `t=${timestamp},v1=${signature}`,
		},
	});
}
function testPaymentAdapter() {
	const paymentAdapter = stripeAdapter("sk_test_local", webhookSecret);
	const createPayment = vi
		.spyOn(paymentAdapter, "createPayment")
		.mockResolvedValue({ clientSecret: "secret-for-current-checkout" });
	return { paymentAdapter, createPayment };
}

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
function cappedReads<T extends Pick<DBAdapter, "findMany">>(adapter: T): T {
	return {
		...adapter,
		findMany: ((options: Parameters<DBAdapter["findMany"]>[0]) =>
			adapter.findMany({
				...options,
				limit: Math.min(options.limit ?? 2, 2),
			})) as DBAdapter["findMany"],
	};
}
async function setup(
	options: SchoolBackendOptions = {},
	withAuth = true,
	capReads = false,
) {
	let adapter!: DBAdapter;
	const stack = createBackendStack({
		basePath: "/api/data",
		adapter: (db) => {
			const memory = createMemoryAdapter(db)({});
			adapter = capReads
				? {
						...cappedReads(memory),
						transaction: (callback) =>
							memory.transaction((tx) => callback(cappedReads(tx))),
					}
				: memory;
			return adapter;
		},
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
	return { stack, course, text, quiz, request, adapter };
}

describe("School learning lifecycle", () => {
	it("records CMS history for course creation, instructor edits and archival", async () => {
		const { stack, course, request } = await setup();
		const history = () =>
			stack.trusted.cms.listContentRevisions({
				typeSlug: "school-course",
				id: course.id,
			});
		expect((await history()).items.map((revision) => revision.version)).toEqual(
			[1],
		);
		expect(
			(
				await request(
					`/courses/${course.id}`,
					"PATCH",
					{ title: "Revised course" },
					"teacher",
				)
			).status,
		).toBe(200);
		expect(
			(await request(`/courses/${course.id}`, "DELETE", undefined, "teacher"))
				.status,
		).toBe(200);
		const revisions = (await history()).items;
		expect(revisions.map((revision) => revision.version)).toEqual([3, 2, 1]);
		expect(JSON.parse(revisions[0]!.data)).toMatchObject({
			title: "Revised course",
			status: "archived",
		});
		expect(JSON.parse(revisions[1]!.data).title).toBe("Revised course");
		expect(JSON.parse(revisions[2]!.data).title).toBe("TypeScript foundations");
		expect(revisions[0]!.authorId).toBe("teacher");
		expect(revisions[1]!.authorId).toBe("teacher");
	});

	it("protects instructor records and paid lessons while keeping previews and the SSG cache public", async () => {
		const { stack, course, text, quiz, request } = await setup();
		for (const slug of ["me", "instructor"]) {
			expect(
				(
					await request(
						"/courses",
						"POST",
						{ title: "Reserved course", slug, instructorId: "teacher" },
						"teacher",
					)
				).status,
			).toBe(400);
			await expect(
				stack.trusted.cms.createContentItem({
					typeSlug: "school-course",
					body: { slug, data: { ...courseSchema.parse(course), slug } },
				}),
			).rejects.toMatchObject({
				statusCode: 400,
				code: "RECORD_VALIDATION_FAILED",
			});
		}

		await expect(
			stack.trusted.cms.createContentItem({
				typeSlug: "school-course",
				body: {
					slug: "cms-valid-course",
					data: { ...courseSchema.parse(course), slug: "cms-valid-course" },
				},
			}),
		).resolves.toMatchObject({ slug: "cms-valid-course" });

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
		const payment = vi.fn<PaymentAdapter["createPayment"]>(async () => ({
			clientSecret: "enrollment-secret",
		}));
		const { stack, course, request } = await setup({
			paymentAdapter: {
				createPayment: payment,
				async handleWebhook() {
					return null;
				},
			},
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
			amount: 2000,
			currency: "USD",
			orderId: expect.stringMatching(/^school:/),
			metadata: { userId: "student", courseId: course.id },
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
	it("keeps paid lessons locked and verifies signed payments against the original checkout", async () => {
		const { paymentAdapter, createPayment } = testPaymentAdapter();
		const afterEnroll = vi.fn();
		const { stack, request, course, text, quiz } = await setup({
			paymentAdapter,
			hooks: { onAfterEnroll: afterEnroll },
		});
		await stack.trusted.school.updateCourse({
			id: course.id,
			data: { price: 2000, currency: "USD" },
		});
		await stack.trusted.school.updateLesson({
			id: text.id,
			data: { isFreePreview: false },
		});
		expect((await request(`/courses/${course.id}/enroll`, "POST")).status).toBe(
			401,
		);
		const enrollment = await (
			await request(
				`/courses/${course.id}/enroll`,
				"POST",
				undefined,
				"student",
			)
		).json();
		expect(enrollment).toMatchObject({
			status: "pending_payment",
			checkout: { clientSecret: "secret-for-current-checkout" },
		});
		expect(afterEnroll).not.toHaveBeenCalled();
		const orderId = createPayment.mock.calls[0]![0].orderId;
		for (const [path, method, body] of [
			[`/lessons/${text.id}`, "GET", undefined],
			[`/lessons/${text.id}/progress`, "POST", { completed: true }],
			[
				`/lessons/${quiz.id}/quiz`,
				"POST",
				{ answers: [{ questionId: "q1", answer: 0 }] },
			],
			[
				`/courses/${course.id}/reviews`,
				"POST",
				{ rating: 5, body: "Not paid yet" },
			],
		] as const)
			expect((await request(path, method, body, "student")).status).toBe(403);
		for (const [path, user] of [
			["/me", "student"],
			[`/courses/${course.id}/students`, "teacher"],
		]) {
			const response = await request(path!, "GET", undefined, user);
			expect(response.status).toBe(200);
			const raw = await response.text();
			expect(raw).not.toContain("secret-for-current-checkout");
			expect(raw).not.toContain('"payment":');
		}
		await stack.trusted.school.updateCourse({
			id: course.id,
			data: { price: 9000, currency: "EUR" },
		});
		for (const options of [
			{ invalidSignature: true },
			{ amount: 9000 },
			{ currency: "eur" },
		])
			expect(
				(
					await stack.handler(
						signedPaymentWebhook("/school/webhook", orderId, options),
					)
				).status,
			).toBe(400);
		const paid = await Promise.all(
			[0, 1].map(() =>
				stack.handler(signedPaymentWebhook("/school/webhook", orderId)),
			),
		);
		expect(paid.map((response) => response.status)).toEqual([200, 200]);
		expect(afterEnroll).toHaveBeenCalledTimes(1);
		expect(
			(await request(`/lessons/${text.id}`, "GET", undefined, "student"))
				.status,
		).toBe(200);
		expect(
			(
				await stack.handler(
					signedPaymentWebhook("/school/webhook", orderId, {
						paymentRef: "pi-other",
					}),
				)
			).status,
		).toBe(409);
		expect(
			(
				await stack.handler(
					signedPaymentWebhook("/school/webhook", orderId, {
						type: "payment_intent.canceled",
					}),
				)
			).status,
		).toBe(200);
		expect((await request("/me", "GET", undefined, "student")).ok).toBe(true);
		expect(
			(await (await request("/me", "GET", undefined, "student")).json())
				.items[0].status,
		).toBe("enrolled");
	});

	it("retries payment initialization and enrollment hooks without duplicating enrollment", async () => {
		const { paymentAdapter, createPayment } = testPaymentAdapter();
		createPayment.mockRejectedValueOnce(new Error("Provider response lost"));
		const afterEnroll = vi
			.fn()
			.mockRejectedValueOnce(new Error("Email temporarily unavailable"));
		const { stack, request, course } = await setup({
			paymentAdapter,
			hooks: { onAfterEnroll: afterEnroll },
		});
		await stack.trusted.school.updateCourse({
			id: course.id,
			data: { price: 2000 },
		});
		expect(
			(
				await request(
					`/courses/${course.id}/enroll`,
					"POST",
					undefined,
					"student",
				)
			).status,
		).toBe(500);
		const retry = await request(
			`/courses/${course.id}/enroll`,
			"POST",
			undefined,
			"student",
		);
		expect(retry.status).toBe(200);
		const enrollment = await retry.json();
		expect(createPayment.mock.calls.map(([input]) => input.orderId)).toEqual([
			`school:${enrollment.id}`,
			`school:${enrollment.id}`,
		]);
		expect(
			(await (await request("/me", "GET", undefined, "student")).json()).items,
		).toHaveLength(1);
		const webhook = () =>
			stack.handler(
				signedPaymentWebhook("/school/webhook", `school:${enrollment.id}`),
			);
		expect((await webhook()).status).toBe(500);
		expect((await webhook()).status).toBe(200);
		expect((await webhook()).status).toBe(200);
		expect(afterEnroll).toHaveBeenCalledTimes(2);
	});

	it("keeps verified failure retries terminal and rejects late payment after cancellation", async () => {
		const { paymentAdapter } = testPaymentAdapter();
		const { stack, request, course } = await setup({ paymentAdapter });
		await stack.trusted.school.updateCourse({
			id: course.id,
			data: { price: 2000 },
		});
		for (const user of ["failed-student", "cancelled-student"]) {
			const enrollment = await (
				await request(`/courses/${course.id}/enroll`, "POST", undefined, user)
			).json();
			if (user === "failed-student") {
				for (let retry = 0; retry < 2; retry++)
					expect(
						(
							await stack.handler(
								signedPaymentWebhook(
									"/school/webhook",
									`school:${enrollment.id}`,
									{ type: "payment_intent.canceled" },
								),
							)
						).status,
					).toBe(200);
			} else
				expect(
					(
						await request(
							`/courses/${course.id}/cancel`,
							"POST",
							undefined,
							user,
						)
					).status,
				).toBe(200);
			expect(
				(
					await stack.handler(
						signedPaymentWebhook("/school/webhook", `school:${enrollment.id}`),
					)
				).status,
			).toBe(409);
			expect(
				(await (await request("/me", "GET", undefined, user)).json()).items[0]
					.status,
			).toBe("cancelled");
		}
	});

	it("scores on the server, blocks manual quiz completion, resumes progress, and issues one certificate", async () => {
		const onCourseComplete = vi.fn(async () => ({
			certificateId: "cert-typescript",
		}));
		const { stack, course, text, quiz, request } = await setup({
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
		const extraLesson = await stack.trusted.school.createLesson({
			courseId: course.id,
			data: {
				title: "Further reading",
				type: "text",
				content: "An optional addition",
				order: 2,
			},
		});
		expect(
			(await request(`/lessons/${extraLesson.id}`, "GET", undefined, "student"))
				.status,
		).toBe(200);
		const revisited = await (
			await request(
				`/lessons/${extraLesson.id}/progress`,
				"POST",
				{ positionSecs: 12 },
				"student",
			)
		).json();
		expect(revisited).toMatchObject({
			status: "completed",
			progressPct: 100,
			certificateId: "cert-typescript",
			completedAt: own.items[0].completedAt,
			lastLessonId: extraLesson.id,
		});
		expect((await request("/certificates/cert-typescript")).status).toBe(200);

		expect(onCourseComplete).toHaveBeenCalledTimes(1);
		await stack.trusted.school.updateCourse({
			id: course.id,
			data: { status: "archived" },
		});
		const archivedPortal = await (
			await request("/me", "GET", undefined, "student")
		).json();
		expect(archivedPortal.items[0]).toMatchObject({
			status: "completed",
			certificateId: "cert-typescript",
			course: { status: "archived" },
		});
		expect(
			(await request(`/lessons/${text.id}`, "GET", undefined, "student"))
				.status,
		).toBe(404);

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
		).toBe(404);
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
			await (await request("/me", "GET", undefined, "student")).json(),
		).toMatchObject({
			items: [{ courseId: course.id, status: "cancelled" }],
		});
		expect(
			await (await request("/me", "GET", undefined, "other")).json(),
		).toMatchObject({ items: [] });
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
	it("preserves chapter ordering and lesson metadata on partial instructor edits", async () => {
		const { stack, course, text, request } = await setup();
		const section = await stack.trusted.school.createSection({
			courseId: course.id,
			data: { title: "Second chapter", order: 7 },
		});
		const renamed = await request(
			`/sections/${section.id}`,
			"PATCH",
			{ title: "Renamed chapter" },
			"teacher",
		);
		expect(renamed.status).toBe(200);
		expect(await renamed.json()).toMatchObject({
			title: "Renamed chapter",
			order: 7,
		});
		const lesson = await request(
			`/lessons/${text.id}`,
			"PATCH",
			{ content: "Revised lesson text" },
			"teacher",
		);
		expect(lesson.status).toBe(200);
		expect(await lesson.json()).toMatchObject({
			content: "Revised lesson text",
			title: "Types",
			type: "text",
			isFreePreview: true,
			order: 0,
		});
	});
	it("clears a deleted resume lesson atomically while preserving other students' resume targets", async () => {
		const { course, text, quiz, request } = await setup();
		await request(`/courses/${course.id}/enroll`, "POST", undefined, "student");
		await request(
			`/lessons/${text.id}/progress`,
			"POST",
			{ positionSecs: 17 },
			"student",
		);
		await request(`/courses/${course.id}/enroll`, "POST", undefined, "other");
		await request(
			`/lessons/${quiz.id}/progress`,
			"POST",
			{ positionSecs: 0 },
			"other",
		);
		expect(
			(await request(`/lessons/${text.id}`, "DELETE", undefined, "teacher"))
				.status,
		).toBe(200);
		const own = await (
			await request("/me", "GET", undefined, "student")
		).json();
		expect(own.items[0].lastLessonId).toBeNull();
		expect(own.items[0].lessons.map((l: { id: string }) => l.id)).toEqual([
			quiz.id,
		]);
		const other = await (
			await request("/me", "GET", undefined, "other")
		).json();
		expect(other.items[0].lastLessonId).toBe(quiz.id);
	});
	it("rechecks enrollment inside progress and quiz transactions after another process cancels", async () => {
		const { adapter, course, text, quiz, request } = await setup();
		const originalTransaction = adapter.transaction.bind(adapter);
		for (const [owner, lessonId, action, data] of [
			["reader", text.id, "progress", { completed: true }],
			[
				"quiz-student",
				quiz.id,
				"quiz",
				{ answers: [{ questionId: "q1", answer: 0 }] },
			],
		] as const) {
			await request(`/courses/${course.id}/enroll`, "POST", undefined, owner);
			const spy = vi
				.spyOn(adapter, "transaction")
				.mockImplementationOnce(async (callback) => {
					await adapter.updateMany({
						model: "schoolEnrollment",
						where: [
							{ field: "courseId", value: course.id, operator: "eq" },
							{ field: "userId", value: owner, operator: "eq" },
						],
						update: { status: "cancelled" },
					});
					return originalTransaction(callback);
				});
			expect(
				(await request(`/lessons/${lessonId}/${action}`, "POST", data, owner))
					.status,
			).toBe(403);
			spy.mockRestore();
		}
		const students = await (
			await request(
				`/courses/${course.id}/students`,
				"GET",
				undefined,
				"teacher",
			)
		).json();
		expect(
			students.items.every((e: { status: string }) => e.status === "cancelled"),
		).toBe(true);
	});
	it("reads full collections with two-record adapter pages before scoring and completing courses", async () => {
		const { stack, course, text, quiz, request } = await setup(
			{
				hooks: {
					onCourseComplete: async () => ({
						certificateId: "complete-paginated-course",
					}),
				},
			},
			true,
			true,
		);
		const additional = [];
		for (const slug of ["extra-one", "extra-two"]) {
			additional.push(
				await stack.trusted.school.createCourse({
					title: slug,
					slug,
					instructorId: "teacher",
					status: "published",
				}),
			);
		}
		const catalog = await (await request("/courses")).json();
		expect(catalog.total).toBe(3);
		expect(
			(
				await request(
					`/courses/${additional[1]!.id}`,
					"GET",
					undefined,
					"teacher",
				)
			).status,
		).toBe(200);
		expect((await request("/catalog/extra-two")).status).toBe(200);
		for (const order of [2, 0, 1])
			await stack.trusted.school.createSection({
				courseId: course.id,
				data: { title: `Chapter ${order}`, order },
			});
		const moreLessons = [];
		for (const order of [2, 3])
			moreLessons.push(
				await stack.trusted.school.createLesson({
					courseId: course.id,
					data: { title: `Lesson ${order}`, type: "text", order },
				}),
			);
		for (const owner of ["reader", "reviewer-one", "reviewer-two"]) {
			await request(`/courses/${course.id}/enroll`, "POST", undefined, owner);
			expect(
				(
					await request(
						`/courses/${course.id}/reviews`,
						"POST",
						{ rating: 5, body: "Useful course" },
						owner,
					)
				).status,
			).toBe(200);
		}
		for (const other of additional)
			await request(`/courses/${other.id}/enroll`, "POST", undefined, "reader");
		expect(
			(await (await request("/me", "GET", undefined, "reader")).json()).items,
		).toHaveLength(3);
		expect(
			(
				await (
					await request(
						`/courses/${course.id}/students`,
						"GET",
						undefined,
						"teacher",
					)
				).json()
			).items,
		).toHaveLength(3);
		const detail = await (await request("/catalog/typescript")).json();
		expect(detail).toMatchObject({ lessonCount: 4 });
		expect(
			detail.lessons.map((lesson: { order: number }) => lesson.order),
		).toEqual([0, 1, 2, 3]);
		expect(
			detail.sections.map((section: { order: number }) => section.order),
		).toEqual([0, 1, 2]);
		expect(detail.reviews).toHaveLength(3);
		const quizDefinition = {
			questions: [
				{
					id: "q1",
					question: "Which is a string?",
					options: ["hello", "42"],
					correctAnswer: 0,
				},
			],
			maxAttempts: 3,
		};
		await stack.trusted.school.updateLesson({
			id: quiz.id,
			data: { quiz: quizDefinition },
		});
		for (let attempt = 0; attempt < 3; attempt++)
			expect(
				(
					await request(
						`/lessons/${quiz.id}/quiz`,
						"POST",
						{ answers: [{ questionId: "q1", answer: 1 }] },
						"reader",
					)
				).status,
			).toBe(200);
		expect(
			(
				await (
					await request(
						`/lessons/${quiz.id}/attempts`,
						"GET",
						undefined,
						"reader",
					)
				).json()
			).items,
		).toHaveLength(3);
		expect(
			(
				await request(
					`/lessons/${quiz.id}/quiz`,
					"POST",
					{ answers: [{ questionId: "q1", answer: 0 }] },
					"reader",
				)
			).status,
		).toBe(409);
		for (const lesson of [text, ...moreLessons]) {
			const progress = await (
				await request(
					`/lessons/${lesson.id}/progress`,
					"POST",
					{ completed: true },
					"reader",
				)
			).json();
			expect(progress.status).toBe("enrolled");
			expect(progress.certificateId).toBeFalsy();
		}
		await stack.trusted.school.updateLesson({
			id: quiz.id,
			data: { quiz: { ...quizDefinition, maxAttempts: 4 } },
		});
		expect(
			(
				await request(
					`/lessons/${quiz.id}/quiz`,
					"POST",
					{ answers: [{ questionId: "q1", answer: 0 }] },
					"reader",
				)
			).status,
		).toBe(200);
		const completed = (
			await (await request("/me", "GET", undefined, "reader")).json()
		).items.find((item: { courseId: string }) => item.courseId === course.id);
		expect(completed).toMatchObject({
			status: "completed",
			progressPct: 100,
			certificateId: "complete-paginated-course",
		});
	});
	it("retries a failed certificate after a final quiz attempt without consuming another attempt", async () => {
		let calls = 0;
		const onCourseComplete = vi.fn(async () => {
			calls++;
			if (calls === 1) throw new Error("Certificate provider unavailable");
			return { certificateId: "recovered-certificate" };
		});
		const { stack, adapter, course, text, quiz, request } = await setup({
			hooks: { onCourseComplete },
		});
		await stack.trusted.school.deleteLesson({ id: text.id });
		const definition = await stack.trusted.school.getEditableLesson({
			id: quiz.id,
		});
		await stack.trusted.school.updateLesson({
			id: quiz.id,
			data: { quiz: { ...quizSchema.parse(definition.quiz), maxAttempts: 1 } },
		});
		for (const owner of ["student", "other"])
			await request(`/courses/${course.id}/enroll`, "POST", undefined, owner);
		expect(
			(
				await request(
					`/lessons/${quiz.id}/quiz`,
					"POST",
					{ answers: [{ questionId: "q1", answer: 0 }] },
					"student",
				)
			).status,
		).toBe(500);
		const pending = await (
			await request("/me", "GET", undefined, "student")
		).json();
		expect(pending.items[0]).toMatchObject({
			status: "completed",
			progressPct: 100,
			certificatePending: true,
		});
		expect(
			(
				await (
					await request(
						`/lessons/${quiz.id}/attempts`,
						"GET",
						undefined,
						"student",
					)
				).json()
			).items,
		).toHaveLength(1);
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
		expect(
			(
				await request(
					`/courses/${course.id}/certificate`,
					"POST",
					undefined,
					"other",
				)
			).status,
		).toBe(409);
		expect(
			(
				await request(
					`/courses/${course.id}/certificate`,
					"POST",
					undefined,
					"outsider",
				)
			).status,
		).toBe(404);
		expect(onCourseComplete).toHaveBeenCalledTimes(1);
		await stack.trusted.school.updateCourse({
			id: course.id,
			data: { status: "archived" },
		});
		const retried = await request(
			`/courses/${course.id}/certificate`,
			"POST",
			undefined,
			"student",
		);
		expect(retried.status).toBe(200);
		expect(await retried.json()).toMatchObject({
			status: "completed",
			certificateId: "recovered-certificate",
		});
		expect(
			(
				await request(
					`/courses/${course.id}/certificate`,
					"POST",
					undefined,
					"student",
				)
			).status,
		).toBe(200);
		expect(onCourseComplete).toHaveBeenCalledTimes(2);
		expect(
			await adapter.count({
				model: "schoolQuizAttempt",
				where: [{ field: "lessonId", value: quiz.id, operator: "eq" }],
			}),
		).toBe(1);
		expect(
			(await (await request("/me", "GET", undefined, "student")).json())
				.items[0],
		).toMatchObject({
			certificatePending: false,
			certificateId: "recovered-certificate",
		});
		expect((await request("/certificates/recovered-certificate")).status).toBe(
			200,
		);
	});
	it("keeps lesson navigation in chapter order after section edits without changing saved ordering or resume", async () => {
		const { stack, course, text, quiz, request } = await setup();
		await stack.trusted.school.deleteLesson({ id: text.id });
		await stack.trusted.school.deleteLesson({ id: quiz.id });
		const first = await stack.trusted.school.createSection({
			courseId: course.id,
			data: { title: "First chapter", order: 0 },
		});
		const second = await stack.trusted.school.createSection({
			courseId: course.id,
			data: { title: "Second chapter", order: 1 },
		});
		const a = await stack.trusted.school.createLesson({
			courseId: course.id,
			data: { title: "A", type: "text", sectionId: first.id, order: 0 },
		});
		const b = await stack.trusted.school.createLesson({
			courseId: course.id,
			data: { title: "B", type: "text", sectionId: second.id, order: 1 },
		});
		const c = await stack.trusted.school.createLesson({
			courseId: course.id,
			data: { title: "C", type: "text", sectionId: first.id, order: 2 },
		});
		const extra = await stack.trusted.school.createLesson({
			courseId: course.id,
			data: { title: "Other lesson", type: "text", order: 0 },
		});
		await request(`/courses/${course.id}/enroll`, "POST", undefined, "student");
		await request(
			`/lessons/${b.id}/progress`,
			"POST",
			{ positionSecs: 15 },
			"student",
		);
		const detail = await (await request("/catalog/typescript")).json();
		expect(detail.lessons.map((lesson: { id: string }) => lesson.id)).toEqual([
			a.id,
			c.id,
			b.id,
			extra.id,
		]);
		const own = await (
			await request("/me", "GET", undefined, "student")
		).json();
		expect(
			own.items[0].lessons.map((lesson: { id: string }) => lesson.id),
		).toEqual([a.id, c.id, b.id, extra.id]);
		expect(own.items[0].lastLessonId).toBe(b.id);
		expect(
			(
				await request(
					`/sections/${second.id}`,
					"PATCH",
					{ order: 0 },
					"teacher",
				)
			).status,
		).toBe(200);
		expect(
			(await request(`/sections/${first.id}`, "PATCH", { order: 1 }, "teacher"))
				.status,
		).toBe(200);
		const reordered = await (await request("/catalog/typescript")).json();
		expect(
			reordered.lessons.map((lesson: { id: string }) => lesson.id),
		).toEqual([b.id, a.id, c.id, extra.id]);
		const resumed = await (
			await request("/me", "GET", undefined, "student")
		).json();
		expect(
			resumed.items[0].lessons.map((lesson: { id: string }) => lesson.id),
		).toEqual([b.id, a.id, c.id, extra.id]);
		expect(resumed.items[0].lastLessonId).toBe(b.id);
		expect(
			reordered.lessons.map((lesson: { order: number }) => lesson.order),
		).toEqual([1, 0, 2, 0]);
		expect(
			(
				await (
					await request(`/lessons/${b.id}`, "GET", undefined, "student")
				).json()
			).progress.positionSecs,
		).toBe(15);
	});
});
