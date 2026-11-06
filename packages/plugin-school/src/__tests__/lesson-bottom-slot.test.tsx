import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Lesson } from "../types";
import type { SchoolPluginOverrides } from "../client/overrides";
import { LessonPlayerPage } from "../client/components/pages/lesson-player-page.internal";

const state = vi.hoisted(() => ({
	overrides: {} as SchoolPluginOverrides,
	lesson: {
		id: "lesson-1",
		courseId: "course-1",
		title: "Narrowing a union",
		type: "text",
		content: "Use a type guard.",
		order: 0,
		isFreePreview: true,
		resources: [],
	} as Lesson,
}));
vi.mock("@btst/stack/context", () => ({
	usePluginOverrides: () => state.overrides,
	usePluginSiteNavigation: () => ({
		Link: "a",
		resolve: (...parts: string[]) => ({ href: `/pages/${parts.join("/")}` }),
	}),
}));
vi.mock("../client/hooks", () => ({
	useSuspenseCourse: () => ({
		data: { id: "course-1", title: "TypeScript", lessons: [state.lesson] },
	}),
	useLesson: () => ({
		data: {
			lesson: state.lesson,
			enrollment: null,
			progress: null,
			attempts: [],
		},
	}),
	useLessonProgress: () => ({}),
	useSubmitQuiz: () => ({}),
}));
vi.mock("../client/components/pages/school-shared", () => ({
	SchoolShell: ({ children }: { children: React.ReactNode }) => children,
	Curriculum: () => null,
	ErrorMessage: () => null,
	CompletedLabel: () => null,
}));

describe("School lesson bottom slot", () => {
	beforeEach(() => {
		state.overrides = {};
	});
	it("renders a lesson without requiring an override or Comments", () => {
		const html = renderToStaticMarkup(
			createElement(LessonPlayerPage, {
				slug: "typescript",
				lessonId: state.lesson.id,
			}),
		);
		expect(html).toContain("Use a type guard.");
		expect(html).not.toContain("Discussion");
	});
	it.each(["text", "video", "quiz"] as const)(
		"passes the student lesson to the slot below %s content",
		(type) => {
			state.lesson = { ...state.lesson, type };
			const slot = vi.fn((lesson: Lesson) =>
				createElement("section", null, `Discussion: ${lesson.title}`),
			);
			state.overrides = { lessonBottomSlot: slot };
			const html = renderToStaticMarkup(
				createElement(LessonPlayerPage, {
					slug: "typescript",
					lessonId: state.lesson.id,
				}),
			);
			expect(slot).toHaveBeenCalledExactlyOnceWith(state.lesson);
			expect(html).toContain(
				"Discussion: Narrowing a union</section></article>",
			);
		},
	);
});
