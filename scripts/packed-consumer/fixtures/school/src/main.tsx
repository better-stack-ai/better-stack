import { schoolClientPlugin } from "@btst/plugin-school/client";
import {
	CourseListPageComponent,
	LessonPlayerPageComponent,
} from "@btst/plugin-school/client/components";
import { schoolPermissions } from "@btst/plugin-school/permissions";
import type {
	CourseDetail,
	Lesson,
	Enrollment,
} from "@btst/plugin-school/types";
import "@btst/plugin-school/css";
import { createClientStack } from "@btst/stack/client";
import { StackProvider } from "@btst/stack/context";
import { defineAuthorization } from "@btst/stack/authorization";
import { createClientAuth } from "@btst/stack/authorization/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import { z } from "zod";

const course: CourseDetail = {
	id: "course",
	title: "Packed course",
	slug: "packed-course",
	description: "Learn from the installed School package",
	instructorId: "teacher",
	instructorName: "Teacher",
	instructorBio: "",
	category: "Types",
	tags: [],
	difficulty: "beginner",
	durationMins: 5,
	price: 0,
	currency: "USD",
	status: "published",
	featured: false,
	createdAt: "2026-01-01T00:00:00Z",
	updatedAt: "2026-01-01T00:00:00Z",
	lessonCount: 1,
	sections: [],
	lessons: [
		{
			id: "lesson",
			courseId: "course",
			title: "Useful types",
			type: "text",
			durationMins: 5,
			order: 0,
			isFreePreview: true,
		},
	],
	reviews: [],
	enrollment: null,
};
const lesson: Lesson = {
	id: "lesson",
	courseId: "course",
	title: "Useful types",
	type: "text",
	content: "Read **useful types** from the installed package.",
	durationMins: 5,
	order: 0,
	isFreePreview: true,
	resources: [],
};
const enrollment: Enrollment = {
	id: "enrollment",
	courseId: "course",
	userId: "student",
	status: "enrolled",
	progressPct: 0,
	enrolledAt: "2026-01-01T00:00:00Z",
};
let completed = localStorage.getItem("packed-school-complete") === "true";
globalThis.fetch = async (input, init) => {
	const url = new URL(String(input));
	if (url.pathname.endsWith("/progress")) {
		const body = JSON.parse(String(init?.body));
		if (body.completed) {
			completed = true;
			localStorage.setItem("packed-school-complete", "true");
		}
		return Response.json({ ...enrollment, progressPct: completed ? 100 : 0 });
	}
	if (url.pathname.endsWith("/school/lessons/lesson"))
		return Response.json({
			lesson,
			enrollment,
			progress: {
				id: "progress",
				enrollmentId: enrollment.id,
				lessonId: lesson.id,
				completed,
				positionSecs: 0,
			},
			attempts: [],
		});
	if (url.pathname.includes("/school/catalog/")) return Response.json(course);
	if (url.pathname.endsWith("/school/courses")) {
		const query = url.searchParams.get("query");
		const items =
			!query || course.title.toLowerCase().includes(query.toLowerCase())
				? [course]
				: [];
		return Response.json({ items, total: items.length });
	}
	throw new Error(`Unexpected School request ${url}`);
};
const queryClient = new QueryClient({
	defaultOptions: { queries: { retry: false } },
});
const stack = createClientStack({
	api: { baseURL: "https://example.test", basePath: "/api" },
	site: { baseURL: "https://example.test", basePath: "/pages" },
	queryClient,
	plugins: { school: schoolClientPlugin() },
});
const authorization = defineAuthorization({
	identity: z.object({ id: z.string() }),
	permissions: [schoolPermissions],
	rules: ({ school }) => [
		school.course.read.allow(),
		school.lesson.read.allow(),
		school.lesson.complete.allow(),
	],
});
const root = document.getElementById("root");
if (!root) throw new Error("Missing root");
createRoot(root).render(
	<QueryClientProvider client={queryClient}>
		<StackProvider
			stack={stack}
			router={{ navigate: () => undefined }}
			auth={createClientAuth({
				authorization,
				getIdentity: () => ({ id: "student" }),
			})}
			initialIdentity={{ id: "student" }}
		>
			<CourseListPageComponent />
			<LessonPlayerPageComponent slug="packed-course" lessonId="lesson" />
		</StackProvider>
	</QueryClientProvider>,
);
