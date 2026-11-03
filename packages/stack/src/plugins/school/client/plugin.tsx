import { lazy, type ComponentType } from "react";
import {
	defineClientPlugin,
	createApiClient,
	isConnectionError,
} from "@btst/stack/plugins/client";
import { defineRoute, defineRoutes } from "@btst/yar";
import type { SchoolApiRouter } from "../api";
import {
	createSchoolQueryKeys,
	type SchoolIdentityPartition,
} from "../query-keys";
import type { SchoolPluginOverrides } from "./overrides";
import { SCHOOL_PLUGIN_ID } from "./constants";

const Catalog = lazy(() =>
	import("./components/pages/course-list-page").then((m) => ({
		default: m.CourseListPageComponent,
	})),
);
const Course = lazy(() =>
	import("./components/pages/course-detail-page").then((m) => ({
		default: m.CourseDetailPageComponent,
	})),
);
const Lesson = lazy(() =>
	import("./components/pages/lesson-player-page").then((m) => ({
		default: m.LessonPlayerPageComponent,
	})),
);
const Quiz = lazy(() =>
	import("./components/pages/quiz-page").then((m) => ({
		default: m.QuizPageComponent,
	})),
);
const Certificate = lazy(() =>
	import("./components/pages/certificate-page").then((m) => ({
		default: m.CertificatePageComponent,
	})),
);
const MyCourses = lazy(() =>
	import("./components/pages/my-courses-page").then((m) => ({
		default: m.MyCoursesPageComponent,
	})),
);
const Instructor = lazy(() =>
	import("./components/pages/instructor-dashboard-page").then((m) => ({
		default: m.InstructorDashboardPageComponent,
	})),
);
const CourseEditor = lazy(() =>
	import("./components/pages/course-editor-page").then((m) => ({
		default: m.CourseEditorPageComponent,
	})),
);
const LessonEditor = lazy(() =>
	import("./components/pages/lesson-editor-page").then((m) => ({
		default: m.LessonEditorPageComponent,
	})),
);

/** School page replacements retain the built-in loaders and metadata. */
export interface SchoolPageComponents {
	catalog?: ComponentType;
	course?: ComponentType<{ slug: string }>;
	lesson?: ComponentType<{ slug: string; lessonId: string }>;
	quiz?: ComponentType<{ slug: string; lessonId: string }>;
	certificate?: ComponentType<{ certificateId: string }>;
	myCourses?: ComponentType;
	instructorDashboard?: ComponentType;
	courseEditor?: ComponentType<{ id: string }>;
	lessonEditor?: ComponentType<{ id: string; lessonId: string }>;
}
/** Client-only School choices; shared origins and QueryClient belong on createClientStack. */
export interface SchoolClientConfig {
	/** Identity snapshot for protected SSR query caches. */
	identityPartition?: SchoolIdentityPartition;
	/** Replace individual pages. */
	pageComponents?: SchoolPageComponents;
	/** Catalog search description. */
	seo?: { description?: string };
	/** Server loader lifecycle hooks. */
	hooks?: {
		beforeLoad?: (route: string) => Promise<void> | void;
		afterLoad?: (route: string) => Promise<void> | void;
		onErrorLoad?: (error: unknown, route: string) => Promise<void> | void;
	};
}

export const schoolClientPlugin = (config: SchoolClientConfig = {}) =>
	defineClientPlugin<SchoolPluginOverrides>()({
		id: SCHOOL_PLUGIN_ID,
		resolve: (runtime) => {
			const client = createApiClient<SchoolApiRouter>({
				baseURL: runtime.api.baseURL,
				basePath: runtime.api.basePath,
				headers: runtime.api.headers,
				credentials: runtime.api.credentials,
			});
			const queries = createSchoolQueryKeys(client);
			const identity = config.identityPartition;
			const load = async (
				route: string,
				query?: {
					queryKey: readonly unknown[];
					queryFn: () => Promise<unknown>;
				},
			) => {
				if (typeof window !== "undefined") return;
				try {
					await config.hooks?.beforeLoad?.(route);
					if (query) {
						await runtime.queryClient.prefetchQuery({ ...query, retry: false });
						const error = runtime.queryClient.getQueryState(
							query.queryKey,
						)?.error;
						if (error) throw error;
					}
					await config.hooks?.afterLoad?.(route);
				} catch (error) {
					if (isConnectionError(error))
						console.warn(
							"[btst/school] Use stack.raw.school.prefetchForRoute() for catalog/course SSG without an HTTP server.",
						);
					try {
						await config.hooks?.onErrorLoad?.(error, route);
					} catch {
						/* Loader reporting must not reject rendering. */
					}
				}
			};
			return {
				routes: () =>
					defineRoutes(
						{
							catalog: defineRoute("/learn", {
								page: Catalog,
								loader: () => load("catalog", queries.schoolCourses.list()),
								meta: () => [
									{ title: "Courses" },
									{
										name: "description",
										content:
											config.seo?.description ??
											"Find your next course and learn at your own pace.",
									},
								],
							}),
							myCourses: defineRoute("/learn/me", {
								page: MyCourses,
								loader: () =>
									load("myCourses", queries.schoolMe.list(identity)),
								meta: () => [
									{ title: "My courses" },
									{ name: "robots", content: "noindex" },
								],
							}),
							instructorDashboard: defineRoute("/learn/instructor", {
								page: Instructor,
								loader: () =>
									load(
										"instructorDashboard",
										queries.schoolInstructor.list(identity),
									),
								meta: () => [
									{ title: "Instructor dashboard" },
									{ name: "robots", content: "noindex" },
								],
							}),
							courseEditor: defineRoute("/learn/instructor/courses/:id", {
								page: ({ params }) => <CourseEditor id={params.id} />,
								loader: ({ params }) =>
									load(
										"courseEditor",
										params.id === "new"
											? undefined
											: queries.schoolCourses.edit(params.id, identity),
									),
								meta: () => [
									{ title: "Edit course" },
									{ name: "robots", content: "noindex" },
								],
							}),
							lessonEditor: defineRoute(
								"/learn/instructor/courses/:id/lessons/:lessonId",
								{
									page: ({ params }) => (
										<LessonEditor id={params.id} lessonId={params.lessonId} />
									),
									loader: ({ params }) =>
										load(
											"lessonEditor",
											params.lessonId === "new"
												? undefined
												: queries.schoolLessons.edit(params.lessonId, identity),
										),
									meta: () => [
										{ title: "Edit lesson" },
										{ name: "robots", content: "noindex" },
									],
								},
							),
							certificate: defineRoute("/learn/certificates/:certificateId", {
								page: ({ params }) => (
									<Certificate certificateId={params.certificateId} />
								),
								loader: ({ params }) =>
									load(
										"certificate",
										queries.schoolCertificates.detail(params.certificateId),
									),
								meta: () => [{ title: "Certificate verification" }],
							}),
							course: defineRoute("/learn/:slug", {
								page: ({ params }) => <Course slug={params.slug} />,
								loader: ({ params }) =>
									load("course", queries.schoolCourses.detail(params.slug)),
								meta: ({ params }) => [
									{
										title:
											runtime.queryClient.getQueryData<{ title: string }>(
												queries.schoolCourses.detail(params.slug).queryKey,
											)?.title ?? "Course",
									},
								],
							}),
							lesson: defineRoute("/learn/:slug/lessons/:lessonId", {
								page: ({ params }) => (
									<Lesson slug={params.slug} lessonId={params.lessonId} />
								),
								loader: ({ params }) =>
									load(
										"lesson",
										queries.schoolLessons.detail(params.lessonId, identity),
									),
								meta: () => [
									{ title: "Lesson" },
									{ name: "robots", content: "noindex" },
								],
							}),
							quiz: defineRoute("/learn/:slug/lessons/:lessonId/quiz", {
								page: ({ params }) => (
									<Quiz slug={params.slug} lessonId={params.lessonId} />
								),
								loader: ({ params }) =>
									load(
										"quiz",
										queries.schoolLessons.detail(params.lessonId, identity),
									),
								meta: () => [
									{ title: "Quiz" },
									{ name: "robots", content: "noindex" },
								],
							}),
						},
						{ pages: config.pageComponents },
					),
			};
		},
	});
