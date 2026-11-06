// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { LessonEditorPage } from "../client/components/pages/lesson-editor-page.internal";
import type { SchoolPluginOverrides } from "../client/overrides";
const state = vi.hoisted(() => ({
	context: null as any,
	mutate: vi.fn(),
	overrides: {} as SchoolPluginOverrides,
}));
vi.mock("@btst/stack/page-context", () => ({
	useRegisterPageAIContext: (context: unknown) => {
		state.context = context;
	},
}));
vi.mock("@btst/stack/context", async (original) => ({
	...(await original<any>()),
	usePluginOverrides: () => state.overrides,
	usePluginSiteNavigation: () => ({
		Link: (props: any) => <a {...props} />,
		resolve: () => ({ href: "/" }),
		navigate: vi.fn(),
	}),
}));
vi.mock("../client/hooks", () => ({
	useCourseEditor: () => ({
		data: { id: "c1", title: "Course", lessons: [], sections: [] },
	}),
	useLessonEditor: () => ({
		data: {
			id: "l1",
			courseId: "c1",
			title: "Keep title",
			type: "text",
			content: "Old",
			resources: [],
		},
	}),
	school: {
		schoolLessons: {
			create: { use: () => ({ mutateAsync: state.mutate }) },
			update: { use: () => ({ mutateAsync: state.mutate }) },
		},
	},
}));
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const host = document.createElement("div");
document.body.append(host);
const root = createRoot(host);
afterEach(async () => {
	await act(async () => root.render(null));
	state.overrides = {};
	vi.clearAllMocks();
});
it("preserves AI lesson drafts when selecting Media and applying another partial draft", async () => {
	state.overrides = {
		imagePicker: ({ onSelect }) => (
			<button type="button" onClick={() => onSelect("/uploads/lesson.png")}>
				Pick image
			</button>
		),
	};
	await act(async () =>
		root.render(<LessonEditorPage id="c1" lessonId="l1" />),
	);
	await act(async () => {
		await state.context.clientTools.draftSchoolLesson({ content: "AI notes" });
	});
	await act(async () => {
		[...host.querySelectorAll("button")]
			.find((button) => button.textContent === "Pick image")!
			.click();
	});
	await act(async () => {
		await state.context.clientTools.draftSchoolLesson({ title: "AI title" });
	});
	expect(host.querySelector("textarea")?.value).toBe(
		"AI notes\n\n![Image](/uploads/lesson.png)",
	);
	expect(host.querySelector("input")?.value).toBe("AI title");
	expect(state.mutate).not.toHaveBeenCalled();
});
it("drafts validated lesson content and scored quiz questions without saving", async () => {
	await act(async () =>
		root.render(<LessonEditorPage id="c1" lessonId="l1" />),
	);
	await act(async () =>
		expect(
			await state.context.clientTools.draftSchoolLesson({
				content: "New content",
			}),
		).toMatchObject({ success: true }),
	);
	expect(host.querySelector("textarea")?.value).toBe("New content");
	expect(host.querySelector("input")?.value).toBe("Keep title");
	const question = {
		id: "q1",
		question: "2 + 2?",
		options: ["3", "4"],
		correctAnswer: 1,
	};
	await act(async () =>
		expect(
			await state.context.clientTools.draftSchoolLesson({
				quiz: { questions: [{ ...question, correctAnswer: 9 }] },
			}),
		).toMatchObject({ success: false }),
	);
	await act(async () =>
		expect(
			await state.context.clientTools.draftSchoolLesson({
				quiz: { questions: [question] },
			}),
		).toMatchObject({ success: true }),
	);
	expect(host.textContent).toContain("Quiz questions");
	expect(
		[...host.querySelectorAll("input")].map((element) => element.value),
	).toContain("2 + 2?");
	expect(state.mutate).not.toHaveBeenCalled();
});
