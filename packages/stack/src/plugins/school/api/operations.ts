import type { DBAdapter as Adapter } from "@btst/db";
import { defineOperation, OperationHttpError } from "@btst/stack/plugins/api";
import { z } from "zod";
import { schoolPermissions as permissions } from "../permissions";
import {
	courseSchema,
	courseUpdateSchema,
	courseFiltersSchema,
	lessonSchema,
	lessonUpdateSchema,
	progressSchema,
	quizSubmissionSchema,
	reviewSchema,
	sectionSchema,
	sectionUpdateSchema,
	quizSchema,
} from "../schemas";
import type {
	Course,
	Enrollment,
	Lesson,
	SchoolBackendOptions,
	Section,
} from "../types";
import * as getters from "./getters";
import * as mutations from "./mutations";
import { serializeSchoolRecord } from "./serializers";

// Serialize conflicting learning updates for one adapter. Database transactions still
// own rollback; payment providers receive a stable key across processes and retries.
const learningQueues = new WeakMap<Adapter, Promise<unknown>>();
async function learningWrite<T>(
	adapter: Adapter,
	run: () => Promise<T>,
): Promise<T> {
	const previous = learningQueues.get(adapter) ?? Promise.resolve();
	const current = previous.catch(() => {}).then(run);
	learningQueues.set(adapter, current);
	try {
		return await current;
	} finally {
		if (learningQueues.get(adapter) === current) learningQueues.delete(adapter);
	}
}

const requireIdentity = ({
	identity,
	request,
}: {
	identity: { id: string } | null;
	request?: Request;
}) => {
	if (request && !identity) fail(401, "Sign in to continue");
};
const idInput = z.object({ id: z.string().min(1) });
const ownInput = z.object({ userId: z.string().min(1).optional() });
const fail = (status: number, message: string): never => {
	throw new OperationHttpError(status, message, "SCHOOL_OPERATION_ERROR");
};
const userId = (
	identity: { id: string } | null,
	trustedId?: string,
	request?: Request,
) =>
	identity?.id ??
	(!request && trustedId ? trustedId : fail(401, "Sign in to continue"));
async function requireCourse(
	adapter: Omit<Adapter, "transaction">,
	id: string,
): Promise<Course> {
	return (
		(await getters.getCourse(adapter, id)) ?? fail(404, "Course not found")
	);
}
async function requireLesson(
	adapter: Omit<Adapter, "transaction">,
	id: string,
): Promise<Lesson> {
	return (
		(await getters.getLesson(adapter, id)) ?? fail(404, "Lesson not found")
	);
}
const factsFor = (course: Course) => ({
	courseId: course.id,
	instructorId: course.instructorId,
	status: course.status,
});
async function lessonFacts(adapter: Adapter, id: string) {
	const lesson = await requireLesson(adapter, id);
	return {
		...factsFor(await requireCourse(adapter, lesson.courseId)),
		lessonId: id,
	};
}
async function activeEnrollment(
	adapter: Omit<Adapter, "transaction">,
	courseId: string,
	owner: string,
) {
	const course = await requireCourse(adapter, courseId);
	if (course.status !== "published") fail(404, "Course not found");
	const enrollment = await getters.getEnrollment(adapter, courseId, owner);
	if (!enrollment || enrollment.status === "cancelled")
		fail(403, "Enroll in this course to continue");
	return enrollment!;
}
async function validateSection(
	adapter: Adapter,
	courseId: string,
	sectionId?: string | null,
) {
	if (sectionId) {
		const section = await adapter.findOne<Section>({
			model: "schoolSection",
			where: getters.whereId(sectionId),
		});
		if (!section || section.courseId !== courseId)
			fail(400, "Section must belong to this course");
	}
}
async function assertUniqueSlug(adapter: Adapter, slug: string, id?: string) {
	if (
		(await getters.getStoredCourses(adapter)).some(
			(c) => c.slug === slug && c.id !== id,
		)
	)
		fail(409, "A course already uses this slug");
}

/** Apply one learning update atomically; quiz completion is only granted by a passing attempt. */
async function recordProgress(
	adapter: Omit<Adapter, "transaction">,
	enrollment: Enrollment,
	lesson: Lesson,
	input: { completed?: boolean; positionSecs?: number },
) {
	const previous = await getters.getProgress(adapter, enrollment.id, lesson.id);
	const completed = previous?.completed || input.completed === true;
	const data = {
		completed,
		positionSecs: input.positionSecs ?? previous?.positionSecs ?? 0,
		completedAt: completed
			? previous?.completedAt
				? new Date(previous.completedAt)
				: new Date()
			: null,
	};
	if (previous)
		await adapter.update({
			model: "schoolLessonProgress",
			where: getters.whereId(previous.id),
			update: data,
		});
	else
		await adapter.create({
			model: "schoolLessonProgress",
			data: {
				...data,
				enrollmentId: enrollment.id,
				lessonId: lesson.id,
				progressKey: JSON.stringify([enrollment.id, lesson.id]),
			},
		});
	const lessons = await getters.listLessons(adapter, lesson.courseId);
	const progress = await adapter.findMany<{
		lessonId: string;
		completed: boolean;
	}>({
		model: "schoolLessonProgress",
		where: getters.whereField("enrollmentId", enrollment.id),
	});
	const done = lessons.filter((item) =>
		progress.some((p) => p.lessonId === item.id && p.completed),
	).length;
	const isComplete =
		enrollment.status === "completed" ||
		Boolean(enrollment.certificateId) ||
		(lessons.length > 0 && done === lessons.length);
	await adapter.update({
		model: "schoolEnrollment",
		where: getters.whereId(enrollment.id),
		update: {
			lastLessonId: lesson.id,
			progressPct: isComplete
				? 100
				: lessons.length
					? Math.floor((done / lessons.length) * 100)
					: 0,
			status: isComplete ? "completed" : "enrolled",
			completedAt: isComplete
				? enrollment.completedAt
					? new Date(enrollment.completedAt)
					: new Date()
				: null,
		},
	});
	return (await getters.getEnrollment(
		adapter,
		lesson.courseId,
		enrollment.userId,
	))!;
}
/** One maintained operation inventory shared by HTTP, request operations, and trusted jobs. */
export function createSchoolOperations(
	adapter: Adapter,
	options: SchoolBackendOptions,
) {
	async function completeCertificate(enrollment: Enrollment) {
		if (
			options.certificatesEnabled === false ||
			!options.hooks?.onCourseComplete
		)
			return enrollment;
		return adapter.transaction(async (tx) => {
			const current =
				(await getters.getEnrollment(
					tx,
					enrollment.courseId,
					enrollment.userId,
				)) ?? fail(404, "Enrollment not found");
			if (current.status !== "completed" || current.certificateId)
				return current;
			const course = await requireCourse(tx, current.courseId);
			const result = await options.hooks!.onCourseComplete!(current, course);
			if (!result.certificateId?.trim())
				fail(500, "Certificate hook must return a certificate ID");
			await tx.update({
				model: "schoolEnrollment",
				where: getters.whereId(current.id),
				update: { certificateId: result.certificateId },
			});
			return (await getters.getEnrollment(
				tx,
				current.courseId,
				current.userId,
			))!;
		});
	}

	const listCourses = defineOperation({
		input: courseFiltersSchema,
		permission: permissions.course.read,
		facts: () => ({ scope: "catalog" as const }),
		execute: ({ input }) => getters.listCourses(adapter, input),
	});
	const getCourse = defineOperation({
		input: z.object({ slug: z.string().min(1) }),
		permission: permissions.course.read,
		facts: () => ({ scope: "catalog" as const }),
		execute: async ({ input }) => {
			const course =
				(await getters.getCourseBySlug(adapter, input.slug)) ??
				fail(404, "Course not found");
			return getters.getCourseDetail(adapter, course);
		},
	});
	const getInstructorCourse = defineOperation({
		input: idInput,
		permission: permissions.course.manage,
		facts: async ({ input }) =>
			factsFor(await requireCourse(adapter, input.id)),
		before: requireIdentity,
		execute: async ({ input }) =>
			getters.getCourseDetail(adapter, await requireCourse(adapter, input.id)),
	});
	const listInstructorCourses = defineOperation({
		input: ownInput,
		permission: permissions.course.read,
		facts: () => ({ scope: "instructor" as const }),
		execute: async ({ input, identity, request }) => {
			const owner = userId(identity, input.userId, request);
			return {
				items: (await getters.getStoredCourses(adapter)).filter(
					(c) => c.instructorId === owner,
				),
			};
		},
	});
	const createCourse = defineOperation({
		input: courseSchema,
		permission: permissions.course.create,
		facts: ({ input }) => ({ instructorId: input.instructorId }),
		before: requireIdentity,
		execute: async ({ input, identity }) => {
			const data = courseSchema.parse({
				...input,
				instructorId: identity?.id ?? input.instructorId,
			});
			await assertUniqueSlug(adapter, data.slug);
			return mutations.createCourse(adapter, data);
		},
	});
	const updateCourse = defineOperation({
		input: z.object({ id: z.string().min(1), data: courseUpdateSchema }),
		permission: permissions.course.manage,
		facts: async ({ input }) =>
			factsFor(await requireCourse(adapter, input.id)),
		before: requireIdentity,
		execute: async ({ input, facts }) => {
			const old = await requireCourse(adapter, input.id);
			if (old.instructorId !== facts.instructorId)
				fail(409, "Course changed; reload before saving");
			const data = courseSchema.parse({
				...old,
				...input.data,
				instructorId: old.instructorId,
			});
			await assertUniqueSlug(adapter, data.slug, old.id);
			return mutations.updateCourse(adapter, old.id, data);
		},
	});
	const deleteCourse = defineOperation({
		input: idInput,
		permission: permissions.course.manage,
		facts: async ({ input }) =>
			factsFor(await requireCourse(adapter, input.id)),
		before: requireIdentity,
		execute: async ({ input }) => {
			const course = await requireCourse(adapter, input.id);
			await mutations.updateCourse(adapter, input.id, {
				...course,
				status: "archived",
			});
			return { success: true };
		},
	});
	const createSection = defineOperation({
		input: z.object({ courseId: z.string().min(1), data: sectionSchema }),
		permission: permissions.course.manage,
		facts: async ({ input }) =>
			factsFor(await requireCourse(adapter, input.courseId)),
		before: requireIdentity,
		execute: ({ input }) =>
			mutations.createSection(adapter, input.courseId, { ...input.data }),
	});
	async function sectionFacts(id: string) {
		const section =
			(await adapter.findOne<Section>({
				model: "schoolSection",
				where: getters.whereId(id),
			})) ?? fail(404, "Section not found");
		return factsFor(await requireCourse(adapter, section.courseId));
	}
	const updateSection = defineOperation({
		input: z.object({ id: z.string().min(1), data: sectionUpdateSchema }),
		permission: permissions.course.manage,
		facts: ({ input }) => sectionFacts(input.id),
		before: requireIdentity,
		execute: async ({ input }) =>
			(await adapter.update<Section>({
				model: "schoolSection",
				where: getters.whereId(input.id),
				update: { ...input.data },
			}))!,
	});
	const deleteSection = defineOperation({
		input: idInput,
		permission: permissions.course.manage,
		facts: ({ input }) => sectionFacts(input.id),
		before: requireIdentity,
		execute: async ({ input }) => {
			await adapter.updateMany({
				model: "schoolLesson",
				where: getters.whereField("sectionId", input.id),
				update: { sectionId: null },
			});
			await adapter.delete({
				model: "schoolSection",
				where: getters.whereId(input.id),
			});
			return { success: true };
		},
	});
	const createLesson = defineOperation({
		input: z.object({ courseId: z.string().min(1), data: lessonSchema }),
		permission: permissions.course.manage,
		facts: async ({ input }) =>
			factsFor(await requireCourse(adapter, input.courseId)),
		before: requireIdentity,
		execute: async ({ input }) => {
			await validateSection(adapter, input.courseId, input.data.sectionId);
			return mutations.createLesson(
				adapter,
				input.courseId,
				lessonSchema.parse(input.data),
			);
		},
	});
	const updateLesson = defineOperation({
		input: z.object({ id: z.string().min(1), data: lessonUpdateSchema }),
		permission: permissions.course.manage,
		facts: async ({ input }) =>
			factsFor(
				await requireCourse(
					adapter,
					(await requireLesson(adapter, input.id)).courseId,
				),
			),
		before: requireIdentity,
		execute: async ({ input }) => {
			const lesson = await requireLesson(adapter, input.id);
			const data = lessonSchema.parse({ ...lesson, ...input.data });
			await validateSection(adapter, lesson.courseId, data.sectionId);
			return mutations.updateLesson(adapter, input.id, data);
		},
	});
	const getEditableLesson = defineOperation({
		input: idInput,
		permission: permissions.course.manage,
		facts: async ({ input }) =>
			factsFor(
				await requireCourse(
					adapter,
					(await requireLesson(adapter, input.id)).courseId,
				),
			),
		before: requireIdentity,
		execute: ({ input }) => requireLesson(adapter, input.id),
	});
	const deleteLesson = defineOperation({
		input: idInput,
		permission: permissions.course.manage,
		facts: async ({ input }) =>
			factsFor(
				await requireCourse(
					adapter,
					(await requireLesson(adapter, input.id)).courseId,
				),
			),
		before: requireIdentity,
		execute: ({ input }) =>
			learningWrite(adapter, () =>
				adapter.transaction(async (tx) => {
					const lesson = await requireLesson(tx, input.id);
					await tx.updateMany({
						model: "schoolEnrollment",
						where: [
							...getters.whereField("courseId", lesson.courseId),
							...getters.whereField("lastLessonId", lesson.id),
						],
						update: { lastLessonId: null },
					});
					await tx.delete({
						model: "schoolLesson",
						where: getters.whereId(lesson.id),
					});
					return { success: true };
				}),
			),
	});
	const reorderLessons = defineOperation({
		input: z.object({
			id: z.string().min(1),
			lessonIds: z.array(z.string().min(1)).max(1000),
		}),
		permission: permissions.course.manage,
		facts: async ({ input }) =>
			factsFor(await requireCourse(adapter, input.id)),
		before: requireIdentity,
		execute: async ({ input }) => {
			const lessons = await getters.listLessons(adapter, input.id);
			if (
				input.lessonIds.length !== lessons.length ||
				new Set(input.lessonIds).size !== lessons.length ||
				input.lessonIds.some((id) => !lessons.some((l) => l.id === id))
			)
				fail(
					400,
					"Reordering must contain every lesson in this course exactly once",
				);
			await adapter.transaction(async (tx) => {
				for (const [order, id] of input.lessonIds.entries())
					await tx.update({
						model: "schoolLesson",
						where: getters.whereId(id),
						update: { order },
					});
			});
			return { success: true };
		},
	});
	const enroll = defineOperation({
		input: idInput.extend({ userId: z.string().optional() }),
		permission: permissions.enrollment.enroll,
		facts: async ({ input }) =>
			factsFor(await requireCourse(adapter, input.id)),
		execute: ({ input, identity, request }) =>
			learningWrite(adapter, async () => {
				const owner = userId(identity, input.userId, request);
				const result = await adapter.transaction(async (tx) => {
					const course = await requireCourse(tx, input.id);
					if (course.status !== "published") fail(404, "Course not found");
					const existing = await getters.getEnrollment(tx, course.id, owner);
					if (existing && existing.status !== "cancelled")
						return { enrollment: existing, created: false, course };
					if (existing) fail(409, "This enrollment has been cancelled");
					if ((await options.hooks?.onBeforeEnroll?.(owner, course)) === false)
						fail(403, "Enrollment was declined");
					let paymentRef: string | undefined;
					if (course.price > 0) {
						if (!options.paymentAdapter)
							fail(402, "Paid enrollment requires a payment adapter");
						const payment = await options.paymentAdapter!.createPayment({
							userId: owner,
							course,
							idempotencyKey: JSON.stringify([course.id, owner]),
						});
						if (!payment?.paymentRef) fail(402, "Payment was not confirmed");
						paymentRef = payment!.paymentRef;
					}
					return {
						enrollment: await mutations.createEnrollment(
							tx,
							course.id,
							owner,
							paymentRef,
						),
						created: true,
						course,
					};
				});
				if (result.created)
					await options.hooks?.onAfterEnroll?.(
						result.enrollment,
						result.course,
					);
				return result.enrollment;
			}),
	});
	const cancelEnrollment = defineOperation({
		input: idInput.extend({ userId: z.string().optional() }),
		permission: permissions.enrollment.enroll,
		facts: async ({ input }) =>
			factsFor(await requireCourse(adapter, input.id)),
		execute: ({ input, identity, request }) =>
			learningWrite(adapter, () =>
				adapter.transaction(async (tx) => {
					const owner = userId(identity, input.userId, request);
					const enrollment =
						(await getters.getEnrollment(tx, input.id, owner)) ??
						fail(404, "Enrollment not found");
					if (enrollment.status === "completed")
						fail(409, "Completed enrollments cannot be cancelled");
					await tx.update({
						model: "schoolEnrollment",
						where: getters.whereId(enrollment.id),
						update: { status: "cancelled" },
					});
					return (await getters.getEnrollment(tx, input.id, owner))!;
				}),
			),
	});

	const getMyCourses = defineOperation({
		input: ownInput,
		permission: permissions.enrollment.read,
		facts: () => ({ scope: "own" as const }),
		execute: async ({ input, identity, request }) => {
			const owner = userId(identity, input.userId, request);
			const enrollments = await getters.getEnrollments(
				adapter,
				"userId",
				owner,
			);
			const items = [];
			for (const enrollment of enrollments) {
				const course = await getters.getCourse(adapter, enrollment.courseId);
				if (
					course &&
					(course.status === "published" ||
						enrollment.status === "completed") &&
					enrollment.status !== "cancelled"
				)
					items.push({
						...enrollment,
						course,
						lessons: (await getters.listLessons(adapter, course.id)).map(
							getters.lessonSummary,
						),
					});
			}
			return { items };
		},
	});
	const getLesson = defineOperation({
		input: idInput.extend({ userId: z.string().optional() }),
		permission: permissions.lesson.read,
		facts: async ({ input }) => ({
			...(await lessonFacts(adapter, input.id)),
			isFreePreview: (await requireLesson(adapter, input.id)).isFreePreview,
		}),
		execute: async ({ input, identity, request }) => {
			const lesson = await requireLesson(adapter, input.id);
			const course = await requireCourse(adapter, lesson.courseId);
			if (course.status !== "published") fail(404, "Lesson not found");
			const owner = identity?.id ?? (!request ? input.userId : undefined);
			const enrollment = owner
				? await getters.getEnrollment(adapter, lesson.courseId, owner)
				: null;
			if (
				!lesson.isFreePreview &&
				(!enrollment || enrollment.status === "cancelled")
			)
				fail(403, "Enroll in this course to continue");
			return {
				lesson: getters.publicLesson(lesson),
				enrollment,
				progress: enrollment
					? await getters.getProgress(adapter, enrollment.id, lesson.id)
					: null,
				attempts: owner
					? await getters.getQuizAttempts(adapter, lesson.id, owner)
					: [],
			};
		},
	});
	const saveProgress = defineOperation({
		input: idInput.extend({
			data: progressSchema,
			userId: z.string().optional(),
		}),
		permission: permissions.lesson.complete,
		facts: ({ input }) => lessonFacts(adapter, input.id),
		execute: ({ input, identity, request }) =>
			learningWrite(adapter, async () => {
				const owner = userId(identity, input.userId, request);
				const result = await adapter.transaction(async (tx) => {
					const lesson = await requireLesson(tx, input.id);
					const enrollment = await activeEnrollment(tx, lesson.courseId, owner);
					if (
						input.data.completed &&
						lesson.type === "quiz" &&
						!(await getters.getQuizAttempts(tx, lesson.id, owner)).some(
							(a) => a.passed,
						)
					)
						fail(400, "Pass the quiz before completing this lesson");
					return recordProgress(tx, enrollment, lesson, input.data);
				});
				return completeCertificate(result);
			}),
	});
	const submitQuiz = defineOperation({
		input: idInput.extend({
			data: quizSubmissionSchema,
			userId: z.string().optional(),
		}),
		permission: permissions.quiz.submit,
		facts: ({ input }) => lessonFacts(adapter, input.id),
		execute: ({ input, identity, request }) =>
			learningWrite(adapter, async () => {
				const owner = userId(identity, input.userId, request);
				const result = await adapter.transaction(async (tx) => {
					const lesson = await requireLesson(tx, input.id);
					if (lesson.type !== "quiz" || !lesson.quiz)
						fail(400, "This lesson is not a quiz");
					const quiz = quizSchema.parse(lesson.quiz);
					const enrollment = await activeEnrollment(tx, lesson.courseId, owner);
					const answerMap = new Map(
						input.data.answers.map((a) => [a.questionId, a.answer]),
					);
					if (
						answerMap.size !== input.data.answers.length ||
						answerMap.size !== quiz.questions.length ||
						quiz.questions.some(
							(q) =>
								!answerMap.has(q.id) ||
								answerMap.get(q.id)! >= q.options.length,
						)
					)
						fail(
							400,
							"Answer each quiz question exactly once using a valid option",
						);
					const attempts = await getters.getQuizAttempts(tx, lesson.id, owner);
					if (quiz.maxAttempts && attempts.length >= quiz.maxAttempts)
						fail(409, "No quiz attempts remain");
					const score = Math.round(
						(quiz.questions.filter(
							(q) => answerMap.get(q.id) === q.correctAnswer,
						).length /
							quiz.questions.length) *
							100,
					);
					const passed = score >= (quiz.passMark ?? options.quizPassMark ?? 70);
					const attempt = await mutations.createQuizAttempt(tx, {
						lessonId: lesson.id,
						userId: owner,
						answers: input.data.answers.map((a) => ({ ...a })),
						score,
						passed,
					});
					const updated = passed
						? await recordProgress(tx, enrollment, lesson, { completed: true })
						: null;
					return { attempt, enrollment: updated, lesson };
				});
				if (result.enrollment) await completeCertificate(result.enrollment);
				await options.hooks?.onQuizSubmit?.(
					result.attempt,
					getters.publicLesson(result.lesson),
				);
				return result.attempt;
			}),
	});
	const listQuizAttempts = defineOperation({
		input: idInput.extend({ userId: z.string().optional() }),
		permission: permissions.quiz.submit,
		facts: ({ input }) => lessonFacts(adapter, input.id),
		execute: async ({ input, identity, request }) => {
			const owner = userId(identity, input.userId, request);
			const lesson = await requireLesson(adapter, input.id);
			await activeEnrollment(adapter, lesson.courseId, owner);
			return { items: await getters.getQuizAttempts(adapter, input.id, owner) };
		},
	});
	const listStudents = defineOperation({
		input: idInput,
		permission: permissions.enrollment.read,
		facts: async ({ input }) => ({
			...factsFor(await requireCourse(adapter, input.id)),
			scope: "students" as const,
		}),
		before: requireIdentity,
		execute: async ({ input }) => {
			const items = await getters.getEnrollments(adapter, "courseId", input.id);
			const totalCompleted = items.filter(
				(e) => e.status === "completed",
			).length;
			const dates = new Map<string, number>();
			for (const item of items) {
				const date = item.enrolledAt.slice(0, 10);
				dates.set(date, (dates.get(date) ?? 0) + 1);
			}
			return {
				items,
				analytics: {
					totalEnrolled: items.length,
					totalCompleted,
					completionRate: items.length
						? Math.round((totalCompleted / items.length) * 100)
						: 0,
					enrollmentsOverTime: [...dates.entries()].map(([date, count]) => ({
						date,
						count,
					})),
				},
			};
		},
	});
	const verifyCertificate = defineOperation({
		input: idInput,
		permission: permissions.certificate.read,
		facts: ({ input }) => ({ certificateId: input.id }),
		execute: async ({ input }) => {
			if (options.certificatesEnabled === false)
				fail(404, "Certificate not found");
			const enrollment = await adapter.findOne<Enrollment>({
				model: "schoolEnrollment",
				where: getters.whereField("certificateId", input.id),
			});
			if (!enrollment || enrollment.status !== "completed")
				fail(404, "Certificate not found");
			const course = await requireCourse(adapter, enrollment!.courseId);
			return serializeSchoolRecord({
				certificateId: input.id,
				courseTitle: course.title,
				completedAt: enrollment!.completedAt,
			});
		},
	});
	const createReview = defineOperation({
		input: idInput.extend({
			data: reviewSchema,
			userId: z.string().optional(),
		}),
		permission: permissions.lesson.complete,
		facts: async ({ input }) => ({
			...factsFor(await requireCourse(adapter, input.id)),
			lessonId: "review",
		}),
		execute: async ({ input, identity, request }) => {
			const owner = userId(identity, input.userId, request);
			await activeEnrollment(adapter, input.id, owner);
			if (
				(await getters.listReviews(adapter, input.id)).some(
					(r) => r.userId === owner,
				)
			)
				fail(409, "You have already reviewed this course");
			return mutations.createReview(adapter, input.id, owner, input.data);
		},
	});
	const listReviews = defineOperation({
		input: idInput,
		permission: permissions.course.read,
		facts: () => ({ scope: "catalog" as const }),
		execute: async ({ input }) => {
			const course = await requireCourse(adapter, input.id);
			if (course.status !== "published") fail(404, "Course not found");
			return { items: await getters.listReviews(adapter, input.id) };
		},
	});
	return {
		listCourses,
		getCourse,
		getInstructorCourse,
		listInstructorCourses,
		createCourse,
		updateCourse,
		deleteCourse,
		createSection,
		updateSection,
		deleteSection,
		createLesson,
		updateLesson,
		getEditableLesson,
		deleteLesson,
		reorderLessons,
		enroll,
		cancelEnrollment,
		getMyCourses,
		getLesson,
		saveProgress,
		submitQuiz,
		listQuizAttempts,
		listStudents,
		verifyCertificate,
		createReview,
		listReviews,
	};
}
