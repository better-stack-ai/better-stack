import { createDbPlugin } from "@btst/db";
/** School learning records; course content belongs to CMS contentItem. */
export const schoolSchema = createDbPlugin("school", {
	schoolSection: {
		modelName: "schoolSection",
		fields: {
			courseId: { type: "string", required: true },
			title: { type: "string", required: true },
			order: { type: "number", required: true },
		},
	},
	schoolLesson: {
		modelName: "schoolLesson",
		fields: {
			courseId: { type: "string", required: true },
			sectionId: { type: "string", required: false },
			title: { type: "string", required: true },
			type: { type: "string", required: true },
			content: { type: "string", required: false },
			videoUrl: { type: "string", required: false },
			durationMins: { type: "number", defaultValue: 0 },
			order: { type: "number", required: true },
			isFreePreview: { type: "boolean", defaultValue: false },
			resources: { type: "string", required: true },
			quiz: { type: "string", required: false },
		},
	},
	schoolEnrollment: {
		modelName: "schoolEnrollment",
		fields: {
			courseId: { type: "string", required: true },
			userId: { type: "string", required: true },
			enrollmentKey: { type: "string", required: true, unique: true },
			status: { type: "string", defaultValue: "enrolled" },
			progressPct: { type: "number", defaultValue: 0 },
			lastLessonId: { type: "string", required: false },
			certificateId: { type: "string", required: false, unique: true },
			paymentRef: { type: "string", required: false },
			enrolledAt: { type: "date", defaultValue: () => new Date() },
			completedAt: { type: "date", required: false },
		},
	},
	schoolLessonProgress: {
		modelName: "schoolLessonProgress",
		fields: {
			enrollmentId: { type: "string", required: true },
			lessonId: { type: "string", required: true },
			progressKey: { type: "string", required: true, unique: true },
			completed: { type: "boolean", defaultValue: false },
			completedAt: { type: "date", required: false },
			positionSecs: { type: "number", defaultValue: 0 },
		},
	},
	schoolQuizAttempt: {
		modelName: "schoolQuizAttempt",
		fields: {
			lessonId: { type: "string", required: true },
			userId: { type: "string", required: true },
			answers: { type: "string", required: true },
			score: { type: "number", required: true },
			passed: { type: "boolean", required: true },
			attemptedAt: { type: "date", defaultValue: () => new Date() },
		},
	},
	schoolReview: {
		modelName: "schoolReview",
		fields: {
			courseId: { type: "string", required: true },
			userId: { type: "string", required: true },
			reviewKey: { type: "string", required: true, unique: true },
			rating: { type: "number", required: true },
			body: { type: "string", required: true },
			createdAt: { type: "date", defaultValue: () => new Date() },
		},
	},
});
