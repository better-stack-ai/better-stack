"use client";
import { formatSchoolPrice as priceLabel } from "../../../query-keys";
export { priceLabel };
import type { ReactNode } from "react";
import { BookOpen, CheckCircle2, PlayCircle, HelpCircle } from "lucide-react";
import {
	usePluginOverrides,
	usePluginSiteNavigation,
	PermissionAccess,
} from "@btst/stack/context";
import type { Course, CourseDetail, Enrollment } from "../../../types";
import { schoolPermissions } from "../../../permissions";
import type { SchoolPluginOverrides } from "../../overrides";
import { SCHOOL_PLUGIN_ID } from "../../constants";

export function SchoolShell({
	children,
	title,
	description,
}: {
	children: ReactNode;
	title: string;
	description?: string;
}) {
	const { Link, resolve } = usePluginSiteNavigation(SCHOOL_PLUGIN_ID);
	const { schoolName } =
		usePluginOverrides<SchoolPluginOverrides>(SCHOOL_PLUGIN_ID);
	return (
		<main className="school-shell" data-testid="school-page">
			<nav className="school-nav" aria-label="School">
				<Link href={resolve("learn").href} className="school-brand">
					<BookOpen aria-hidden="true" size={20} />
					{schoolName ?? "School"}
				</Link>
				<div>
					<Link href={resolve("learn").href}>Courses</Link>
					<Link href={resolve("learn", "me").href}>My courses</Link>
					<PermissionAccess
						permission={schoolPermissions.course.read({ scope: "instructor" })}
					>
						<Link href={resolve("learn", "instructor").href}>Teach</Link>
					</PermissionAccess>
				</div>
			</nav>
			<header className="school-heading">
				<h1>{title}</h1>
				{description && <p>{description}</p>}
			</header>
			{children}
		</main>
	);
}
export function ErrorMessage({ error }: { error: unknown }) {
	return error ? (
		<p className="school-error" role="alert">
			{error instanceof Error
				? error.message
				: "The request could not be completed. Please try again."}
		</p>
	) : null;
}
export function EmptyMessage({ children }: { children: ReactNode }) {
	return <div className="school-empty">{children}</div>;
}
export function CourseCard({
	course,
	enrollment,
}: {
	course: Course;
	enrollment?: Enrollment;
}) {
	const { Link, resolve } = usePluginSiteNavigation(SCHOOL_PLUGIN_ID);
	return (
		<article
			className={`school-course${course.featured ? " school-course-featured" : ""}`}
		>
			{course.coverImage && (
				<img
					src={course.coverImage}
					alt=""
					className="school-course-cover"
					loading="lazy"
				/>
			)}
			<div className="school-course-body">
				<div className="school-course-labels">
					{course.category && <span>{course.category}</span>}
					{course.featured && <span className="school-pill">Featured</span>}
				</div>
				<h2>
					{course.status === "published" ? (
						<Link href={resolve("learn", course.slug).href}>
							{course.title}
						</Link>
					) : (
						course.title
					)}
				</h2>
				<p>{course.description}</p>
				{course.instructorName && (
					<span className="school-muted">With {course.instructorName}</span>
				)}
				<div className="school-course-meta">
					<span>{course.difficulty}</span>
					<span>{course.lessonCount} lessons</span>
					<span>{course.durationMins} min</span>
					<strong>{priceLabel(course)}</strong>
				</div>
				{enrollment && <Progress value={enrollment.progressPct} />}
			</div>
		</article>
	);
}
export function Progress({ value }: { value: number }) {
	return (
		<div className="school-progress">
			<progress max={100} value={value} aria-label="Course progress" />
			<span>{Math.round(value)}% complete</span>
		</div>
	);
}
export function Curriculum({
	course,
	activeLessonId,
	enrollment,
}: {
	course: CourseDetail;
	activeLessonId?: string;
	enrollment?: Enrollment | null;
}) {
	const { Link, resolve } = usePluginSiteNavigation(SCHOOL_PLUGIN_ID);
	const groups = [
		...course.sections,
		{
			id: "",
			title: course.sections.length ? "Other lessons" : "Lessons",
			order: 0,
		},
	];
	return (
		<div className="school-curriculum" aria-label="Curriculum">
			{enrollment && <Progress value={enrollment.progressPct} />}
			{groups.map((section) => {
				const lessons = course.lessons.filter(
					(l) => (l.sectionId ?? "") === section.id,
				);
				return lessons.length ? (
					<section key={section.id}>
						<h3>{section.title}</h3>
						<ol>
							{lessons.map((lesson) => {
								const Icon =
									lesson.type === "video"
										? PlayCircle
										: lesson.type === "quiz"
											? HelpCircle
											: BookOpen;
								const href = resolve(
									"learn",
									course.slug,
									"lessons",
									lesson.id,
								).href;
								return (
									<li
										key={lesson.id}
										className={
											lesson.id === activeLessonId
												? "school-current-lesson"
												: ""
										}
									>
										<Icon size={18} aria-hidden="true" />
										{enrollment || lesson.isFreePreview ? (
											<Link
												href={href}
												aria-current={
													lesson.id === activeLessonId ? "page" : undefined
												}
											>
												{lesson.title}
											</Link>
										) : (
											<span>{lesson.title}</span>
										)}
										<span className="school-lesson-meta">
											{lesson.isFreePreview
												? "Preview"
												: lesson.durationMins
													? `${lesson.durationMins} min`
													: lesson.type}
										</span>
									</li>
								);
							})}
						</ol>
					</section>
				) : null;
			})}
			{course.lessons.length === 0 && (
				<p className="school-muted">
					Lessons will appear here when the instructor adds them.
				</p>
			)}
		</div>
	);
}
export function CompletedLabel() {
	return (
		<span className="school-completed">
			<CheckCircle2 aria-hidden="true" size={18} />
			Completed
		</span>
	);
}
