"use client";

import {
	createResource,
	type Resource,
} from "@btst/stack/plugins/client/hooks";
import { useIdentity, useIdentitySourceGeneration } from "@btst/stack/context";
import {
	schoolResources,
	type CatalogFilters,
	type SchoolResources,
} from "../../query-keys";
import { SCHOOL_PLUGIN_ID } from "../constants";

export const school: Resource<SchoolResources> = createResource({
	plugin: SCHOOL_PLUGIN_ID,
	resources: schoolResources,
});

function useIdentityPartition() {
	const { identity, isPending, error } = useIdentity();
	const generation = useIdentitySourceGeneration();
	if (isPending) return `pending:${generation}` as const;
	if (error) return `error:${generation}` as const;
	return identity ?? undefined;
}

export const useCourses = (filters?: CatalogFilters) =>
	school.schoolCourses.list.use([filters]);
export const useSuspenseCourses = (filters?: CatalogFilters) =>
	school.schoolCourses.list.useSuspense([filters]);
export const useCourse = (slug: string) =>
	school.schoolCourses.detail.use([slug]);
export const useSuspenseCourse = (slug: string) =>
	school.schoolCourses.detail.useSuspense([slug]);
export const useCourseEditor = (id: string) =>
	school.schoolCourses.edit.use([id, useIdentityPartition()], {
		enabled: id !== "new",
	});
export const useMyCourses = (enabled = true) =>
	school.schoolMe.list.use([useIdentityPartition()], { enabled });
export const useSuspenseMyCourses = () =>
	school.schoolMe.list.useSuspense([useIdentityPartition()]);
export const useInstructorCourses = () =>
	school.schoolInstructor.list.useSuspense([useIdentityPartition()]);
export const useCourseStudents = (id: string) =>
	school.schoolStudents.list.use([id, useIdentityPartition()]);
export const useLesson = (id: string) =>
	school.schoolLessons.detail.useSuspense([id, useIdentityPartition()]);
export const useLessonEditor = (id: string) =>
	school.schoolLessons.edit.use([id, useIdentityPartition()], {
		enabled: id !== "new",
	});
export const useQuizAttempts = (id: string) =>
	school.schoolLessons.attempts.use([id, useIdentityPartition()]);
export const useCertificate = (id: string) =>
	school.schoolCertificates.detail.useSuspense([id]);
export const useEnroll = () => school.schoolCourses.enroll.use();
export const useLessonProgress = () => school.schoolLessons.progress.use();
export const useSubmitQuiz = () => school.schoolLessons.quiz.use();
