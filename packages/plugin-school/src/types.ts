import type { PaymentAdapter, PaymentCheckout } from "@btst/stack/payments";
import type { z } from "zod";
import type {
	courseSchema,
	courseFiltersSchema,
	lessonSchema,
	quizSchema,
} from "./schemas";
/** CMS-backed course with serialized timestamps and curriculum count. */
export type Course = z.output<typeof courseSchema> & {
	id: string;
	createdAt: string;
	updatedAt: string;
	lessonCount: number;
};
export type CourseFilters = z.input<typeof courseFiltersSchema>;
export type Quiz = z.output<typeof quizSchema>;
/** Student-safe quiz question; answer keys are removed from lesson responses. */
export type PublicQuiz = Omit<Quiz, "questions"> & {
	questions: Omit<Quiz["questions"][number], "correctAnswer">[];
};
export type Section = {
	id: string;
	courseId: string;
	title: string;
	order: number;
};
export type Lesson = Omit<z.output<typeof lessonSchema>, "quiz"> & {
	id: string;
	courseId: string;
	quiz?: Quiz | PublicQuiz | null;
};
export type LessonSummary = Pick<
	Lesson,
	| "id"
	| "courseId"
	| "title"
	| "sectionId"
	| "type"
	| "durationMins"
	| "order"
	| "isFreePreview"
>;
export type Enrollment = {
	id: string;
	courseId: string;
	userId: string;
	status: "pending_payment" | "enrolled" | "completed" | "cancelled";
	progressPct: number;
	lastLessonId?: string | null;
	certificateId?: string | null;
	paymentRef?: string | null;
	enrolledAt: string;
	completedAt?: string | null;
};
export type LessonProgress = {
	id: string;
	enrollmentId: string;
	lessonId: string;
	completed: boolean;
	completedAt?: string | null;
	positionSecs: number;
};
export type QuizAttempt = {
	id: string;
	lessonId: string;
	userId: string;
	answers: { questionId: string; answer: number }[];
	score: number;
	passed: boolean;
	attemptedAt: string;
};
export type Review = {
	id: string;
	courseId: string;
	userId: string;
	rating: number;
	body: string;
	createdAt: string;
};
export type CourseDetail = Course & {
	sections: Section[];
	lessons: LessonSummary[];
	reviews: Review[];
	enrollment: null;
};
/** Enrollment, payment, assessment, and completion lifecycle callbacks. */
export interface SchoolPluginHooks {
	/** Runs before enrollment. Returning false rejects the request. */
	onBeforeEnroll?: (
		userId: string,
		course: Course,
	) => Promise<boolean> | boolean;
	/** Runs after the enrollment has been persisted. */
	onAfterEnroll?: (
		enrollment: Enrollment,
		course: Course,
	) => Promise<void> | void;
	/** Generate a certificate after completion; the returned unique ID is stored on the enrollment. */
	onCourseComplete?: (
		enrollment: Enrollment,
		course: Course,
	) => Promise<{ certificateId: string }> | { certificateId: string };
	/** Runs after a scored quiz attempt is persisted. */
	onQuizSubmit?: (attempt: QuizAttempt, lesson: Lesson) => Promise<void> | void;
}
/** School backend configuration. */
export interface SchoolBackendOptions {
	/** Enrollment and completion lifecycle callbacks. */
	hooks?: SchoolPluginHooks;
	/** Default quiz pass percentage, used when a quiz has no override. @default 70 */
	quizPassMark?: number;
	/** Enable certificate generation and public verification. @default true */
	certificatesEnabled?: boolean;
	/** Shared provider for asynchronous paid enrollments; access is granted only by verified webhooks. */
	paymentAdapter?: PaymentAdapter;
}
/** Validated authoring input shapes used by instructor forms. */
export type CourseInput = z.input<typeof courseSchema>;
export type LessonInput = z.input<typeof lessonSchema>;
export type CatalogFilters = CourseFilters;
export type StudentCoursesResult = {
	items: (Enrollment & {
		course: Course;
		lessons: LessonSummary[];
		/** A configured certificate provider has not yet issued this completed course's certificate. */
		certificatePending: boolean;
	})[];
};
export type LessonResult = {
	lesson: Lesson;
	enrollment: Enrollment | null;
	progress: LessonProgress | null;
	attempts: QuizAttempt[];
};
export type CourseStudentsResult = {
	items: Enrollment[];
	analytics: {
		totalEnrolled: number;
		totalCompleted: number;
		completionRate: number;
		enrollmentsOverTime: { date: string; count: number }[];
	};
};
export type CertificateResult = {
	certificateId: string;
	courseTitle: string;
	completedAt?: string | null;
};

/** Enrollment response; checkout credentials are returned only to the enrolling student. */
export type EnrollmentCheckout = Enrollment & { checkout?: PaymentCheckout };
