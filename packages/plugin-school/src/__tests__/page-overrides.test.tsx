import { CourseListPage } from "../client/components/pages/course-list-page.internal";
import { MyCoursesPage } from "../client/components/pages/my-courses-page.internal";
import { CourseDetailPage } from "../client/components/pages/course-detail-page.internal";
import { LessonPlayerPage } from "../client/components/pages/lesson-player-page.internal";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SchoolPluginOverrides } from "../client/overrides";
import {
	CourseCard,
	Curriculum,
} from "../client/components/pages/school-shared";

const state = vi.hoisted(() => ({ overrides: {} as SchoolPluginOverrides }));
vi.mock("@btst/stack/context", () => ({
	usePluginOverrides: () => state.overrides,
	useIdentity: () => ({ identity: null }),
	usePluginSiteNavigation: () => ({
		Link: "a",
		resolve: (...parts: string[]) => ({ href: `/pages/${parts.join("/")}` }),
	}),
	PermissionAccess: ({ children }: { children: ReactNode }) => children,
}));
import { courseSchema } from "../schemas";
const course = {
	...courseSchema.parse({
		title: "TypeScript course",
		slug: "typescript",
		instructorId: "teacher",
		status: "published",
	}),
	id: "course-1",
	lessonCount: 4,
	createdAt: "2026-11-06",
	updatedAt: "2026-11-06",
};
const enrollment = {
	id: "enrollment-1",
	courseId: course.id,
	userId: "student",
	status: "enrolled" as const,
	progressPct: 25,
	enrolledAt: "2026-11-06",
};
const props = { course, enrollment };
const pages = ["catalog", "myCourses"] as const;
const render = (page?: (typeof pages)[number]) =>
	renderToStaticMarkup(<CourseCard {...props} page={page} />);

beforeEach(() => {
	state.overrides = {};
});

describe("school page-scoped CourseCard", () => {
	it("selects the explicit page and forwards the existing presentation props", () => {
		for (const page of pages) {
			const slot = vi.fn((_: unknown) => (
				<section data-slot-override={page}>Custom presentation</section>
			));
			state.overrides = { pageOverrides: { [page]: { CourseCard: slot } } };
			expect(render(page)).toContain(`data-slot-override="${page}"`);
			const presentationProps = props;
			expect(slot.mock.calls[0]?.[0]).toEqual(presentationProps);
			for (const other of pages.filter((key) => key !== page)) {
				expect(render(other)).not.toContain("data-slot-override");
				expect(render(other)).toContain("TypeScript course");
			}
			expect(render()).not.toContain("data-slot-override");
			expect(render()).toContain("TypeScript course");
		}
	});
	it("preserves built-in presentation when no slot is configured or a page entry is empty", () => {
		for (const page of pages) {
			const unchanged = render(page);
			expect(unchanged).toContain("TypeScript course");
			state.overrides = { pageOverrides: { [page]: {} } };
			expect(render(page)).toBe(unchanged);
		}
	});
});

describe("school page-scoped Curriculum", () => {
	const courseDetail = {
		...course,
		sections: [],
		lessons: [],
		reviews: [],
		enrollment: null,
	};
	const renderCurriculum = (page?: "course" | "lesson") =>
		renderToStaticMarkup(
			<Curriculum
				course={courseDetail}
				activeLessonId="lesson-1"
				enrollment={enrollment}
				page={page}
			/>,
		);
	it("isolates course and lesson outlines and forwards enrollment and active lesson", () => {
		for (const page of ["course", "lesson"] as const) {
			const slot = vi.fn((_: unknown) => <aside data-outline={page} />);
			state.overrides = { pageOverrides: { [page]: { Curriculum: slot } } };
			expect(renderCurriculum(page)).toContain(`data-outline="${page}"`);
			expect(slot.mock.calls[0]?.[0]).toEqual({
				course: courseDetail,
				activeLessonId: "lesson-1",
				enrollment,
			});
			expect(
				renderCurriculum(page === "course" ? "lesson" : "course"),
			).toContain('aria-label="Curriculum"');
			expect(renderCurriculum()).toContain('aria-label="Curriculum"');
		}
	});
	it("preserves default and empty-entry outlines", () => {
		const unchanged = renderCurriculum("course");
		state.overrides = { pageOverrides: { course: {}, lesson: {} } };
		expect(renderCurriculum("course")).toBe(unchanged);
		expect(renderCurriculum("lesson")).toBe(unchanged);
	});
});

vi.mock("../client/hooks", () => ({
	useSuspenseCourses: () => ({ data: { items: [course], total: 1 } }),
	useSuspenseMyCourses: () => ({
		data: [{ ...enrollment, course, lessons: [] }],
	}),
	useSuspenseCourse: () => ({
		data: {
			...course,
			sections: [],
			lessons: [],
			reviews: [],
			enrollment: null,
		},
	}),
	useMyCourses: () => ({ data: [] }),
	useEnroll: () => ({}),
	useLesson: () => ({
		data: {
			lesson: {
				id: "lesson-1",
				courseId: course.id,
				title: "Type narrowing",
				type: "text",
				content: "Lesson text",
				isFreePreview: true,
				resources: [],
			},
			enrollment: null,
			progress: null,
		},
	}),
	useLessonProgress: () => ({}),
	useSubmitQuiz: () => ({}),
	school: {
		schoolCourses: {
			cancel: { use: () => ({}) },
			retryCertificate: { use: () => ({}) },
			review: { use: () => ({}) },
		},
	},
}));
it("built-in learner pages supply the four explicit scopes", () => {
	state.overrides = {
		pageOverrides: {
			catalog: { CourseCard: () => <article data-built-in="catalog" /> },
			myCourses: { CourseCard: () => <article data-built-in="myCourses" /> },
			course: { Curriculum: () => <aside data-built-in="course" /> },
			lesson: { Curriculum: () => <aside data-built-in="lesson" /> },
		},
	};
	for (const [page, element] of [
		["catalog", <CourseListPage />],
		["myCourses", <MyCoursesPage />],
		["course", <CourseDetailPage slug="typescript" />],
		["lesson", <LessonPlayerPage slug="typescript" lessonId="lesson-1" />],
	] as const) {
		const html = renderToStaticMarkup(element);
		expect(html).toContain(`data-built-in="${page}"`);
		for (const other of ["catalog", "myCourses", "course", "lesson"].filter(
			(key) => key !== page,
		))
			expect(html).not.toContain(`data-built-in="${other}"`);
	}
});
