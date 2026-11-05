import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createMemoryAdapter } from "@btst/adapter-memory";
import * as core from "@btst/stack/api";
import * as auth from "@btst/stack/authorization";
import * as serverAuth from "@btst/stack/authorization/server";
import * as school from "@btst/plugin-school/api";
import * as cms from "@btst/plugin-cms/api";
import * as schoolAuth from "@btst/plugin-school/permissions";
import * as cmsAuth from "@btst/plugin-cms/permissions";
import { schoolClientPlugin } from "@btst/plugin-school/client";
import { QueryClient } from "@tanstack/react-query";
import { z } from "zod";
const require = createRequire(import.meta.url);
assert.equal(schoolClientPlugin().id, "school");
assert.equal(
	require("@btst/plugin-school/client").schoolClientPlugin().id,
	"school",
);
assert.throws(() => require.resolve("@btst/plugin-ai-chat/api"), {
	code: "MODULE_NOT_FOUND",
});

async function verify({
	createBackendStack,
	defineAuthorization,
	createServerAuth,
	schoolBackendPlugin,
	SCHOOL_COURSE_CONTENT_TYPE,
	courseSchema,
	cmsBackendPlugin,
	schoolPermissions,
	cmsPermissions,
}) {
	const authorization = defineAuthorization({
		identity: z.object({ id: z.string() }),
		permissions: [cmsPermissions, schoolPermissions],
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
	const auth = createServerAuth({
		authorization,
		getIdentity: ({ request }) => {
			const id = request.headers.get("x-user");
			return id ? { id } : null;
		},
	});
	assert.throws(
		() =>
			createBackendStack({
				plugins: { school: schoolBackendPlugin() },
				adapter: (db) => createMemoryAdapter(db)({}),
				auth,
			}),
		/School requires cmsBackendPlugin/,
	);
	const stack = createBackendStack({
		basePath: "/api",
		adapter: (db) => createMemoryAdapter(db)({}),
		auth,
		plugins: {
			cms: cmsBackendPlugin({ contentTypes: [SCHOOL_COURSE_CONTENT_TYPE] }),
			school: schoolBackendPlugin({
				hooks: {
					onCourseComplete: async () => ({
						certificateId: "packed-certificate",
					}),
				},
			}),
		},
	});
	const request = (path, method = "GET", body, user) =>
		stack.handler(
			new Request(`https://example.test/api/school${path}`, {
				method,
				headers: {
					...(user ? { "x-user": user } : {}),
					...(body ? { "content-type": "application/json" } : {}),
				},
				...(body ? { body: JSON.stringify(body) } : {}),
			}),
		);
	const course = await stack.trusted.school.createCourse({
		title: "Packed course",
		slug: "packed-course",
		instructorId: "teacher",
		status: "published",
	});
	const text = await stack.trusted.school.createLesson({
		courseId: course.id,
		data: {
			title: "Types",
			type: "text",
			content: "**Useful** types",
			order: 0,
			isFreePreview: true,
		},
	});
	const quiz = await stack.trusted.school.createLesson({
		courseId: course.id,
		data: {
			title: "Quiz",
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
				maxAttempts: 1,
			},
		},
	});
	assert.equal((await request(`/lessons/${text.id}`)).status, 200);
	assert.equal((await request(`/lessons/${quiz.id}`)).status, 403);
	assert.equal(
		(
			await request(
				`/courses/${course.id}`,
				"PATCH",
				{ title: "Stolen" },
				"student",
			)
		).status,
		403,
	);
	assert.equal(
		(
			await request(
				"/courses",
				"POST",
				{ title: "Invalid", slug: "me", instructorId: "teacher" },
				"teacher",
			)
		).status,
		400,
	);
	await assert.rejects(
		stack.trusted.cms.createContentItem({
			typeSlug: "school-course",
			body: { slug: "bad", data: { ...courseSchema.parse(course), price: -1 } },
		}),
		{ statusCode: 400 },
	);
	const detail = await (await request("/catalog/packed-course")).json();
	assert.equal(detail.enrollment, null);
	assert.equal(JSON.stringify(detail).includes("correctAnswer"), false);
	const cache = new QueryClient();
	await stack.raw.school.prefetchForRoute("course", cache, {
		slug: "packed-course",
	});
	assert.deepEqual(
		cache.getQueryData(["schoolCourses", "detail", "packed-course"]),
		detail,
	);
	await stack.raw.school.prefetchForRoute("catalog", cache);
	assert.equal(
		cache.getQueryData(["schoolCourses", "list", {}]).items[0].id,
		course.id,
	);
	assert.equal(typeof detail.createdAt, "string");
	cache.clear();
	assert.equal(
		(await request(`/courses/${course.id}/enroll`, "POST")).status,
		401,
	);
	assert.equal(
		(
			await request(
				`/courses/${course.id}/enroll`,
				"POST",
				undefined,
				"student",
			)
		).status,
		200,
	);
	assert.equal(
		JSON.stringify(
			await (
				await request(`/lessons/${quiz.id}`, "GET", undefined, "student")
			).json(),
		).includes("correctAnswer"),
		false,
	);
	assert.equal(
		(
			await request(
				`/lessons/${quiz.id}/progress`,
				"POST",
				{ completed: true },
				"student",
			)
		).status,
		400,
	);
	await request(
		`/lessons/${text.id}/progress`,
		"POST",
		{ positionSecs: 27, completed: true },
		"student",
	);
	assert.equal(
		(
			await (
				await request(`/lessons/${text.id}`, "GET", undefined, "student")
			).json()
		).progress.positionSecs,
		27,
	);
	const score = await (
		await request(
			`/lessons/${quiz.id}/quiz`,
			"POST",
			{ answers: [{ questionId: "q1", answer: 0 }], score: 0, passed: false },
			"student",
		)
	).json();
	assert.equal(score.score, 100);
	assert.equal(score.passed, true);
	assert.equal(
		(
			await request(
				`/lessons/${quiz.id}/quiz`,
				"POST",
				{ answers: [{ questionId: "q1", answer: 0 }] },
				"student",
			)
		).status,
		409,
	);
	const completed = await (
		await request("/me", "GET", undefined, "student")
	).json();
	assert.equal(completed.items[0].certificateId, "packed-certificate");
	assert.equal(completed.items[0].progressPct, 100);
	assert.equal((await request("/certificates/packed-certificate")).status, 200);
	assert.deepEqual(
		await (await request("/me", "GET", undefined, "other")).json(),
		{ items: [] },
	);
	await stack.trusted.school.updateCourse({
		id: course.id,
		data: { price: 100 },
	});
	assert.equal(
		(await request(`/courses/${course.id}/enroll`, "POST", undefined, "other"))
			.status,
		402,
	);
	const contentType = await stack.adapter.findOne({
		model: "contentType",
		where: [{ field: "slug", value: "school-course" }],
	});
	await stack.adapter.create({
		model: "contentItem",
		forceAllowId: true,
		data: {
			id: "existing-v5-course",
			contentTypeId: contentType.id,
			slug: "existing-course",
			data: JSON.stringify(
				courseSchema.parse({
					title: "Existing course",
					slug: "existing-course",
					instructorId: "teacher",
					status: "published",
				}),
			),
			createdAt: new Date("2025-01-01T00:00:00Z"),
			updatedAt: new Date("2025-01-01T00:00:00Z"),
		},
	});
	await stack.adapter.create({
		model: "schoolEnrollment",
		forceAllowId: true,
		data: {
			id: "existing-v5-enrollment",
			courseId: "existing-v5-course",
			userId: "existing-student",
			enrollmentKey: JSON.stringify(["existing-v5-course", "existing-student"]),
			status: "enrolled",
			progressPct: 25,
			enrolledAt: new Date("2025-02-01T00:00:00Z"),
		},
	});
	const existingCourse = await (
		await request("/catalog/existing-course")
	).json();
	assert.equal(existingCourse.id, "existing-v5-course");
	assert.equal(existingCourse.createdAt, "2025-01-01T00:00:00.000Z");
	const existingEnrollment = await (
		await request("/me", "GET", undefined, "existing-student")
	).json();
	assert.equal(existingEnrollment.items[0].id, "existing-v5-enrollment");
	assert.equal(existingEnrollment.items[0].progressPct, 25);
	// A pre-extraction lesson retains its table identity and JSON resource data.
	await stack.adapter.create({
		model: "schoolLesson",
		forceAllowId: true,
		data: {
			id: "existing-v5-lesson",
			courseId: course.id,
			title: "Existing lesson",
			type: "text",
			content: "Existing content",
			durationMins: 1,
			order: 2,
			isFreePreview: true,
			resources:
				'[{"label":"Reference","url":"https://example.test/reference"}]',
		},
	});
	const existing = await (await request("/lessons/existing-v5-lesson")).json();
	assert.equal(existing.lesson.id, "existing-v5-lesson");
	assert.equal(existing.lesson.resources[0].label, "Reference");
}
await verify({
	...core,
	...auth,
	...serverAuth,
	...school,
	...cms,
	...schoolAuth,
	...cmsAuth,
});
await verify({
	...require("@btst/stack/api"),
	...require("@btst/stack/authorization"),
	...require("@btst/stack/authorization/server"),
	...require("@btst/plugin-school/api"),
	...require("@btst/plugin-cms/api"),
	...require("@btst/plugin-school/permissions"),
	...require("@btst/plugin-cms/permissions"),
});
console.log(
	"Packed School/CMS ESM+CJS access, CMS validation, quiz scoring, progress, certificates, paid enrollment, existing data and SSG passed",
);
