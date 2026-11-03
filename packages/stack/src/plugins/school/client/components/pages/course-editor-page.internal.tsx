"use client";
import { useState, type FormEvent } from "react";
import { ArrowDown, ArrowUp, GripVertical, Plus, Trash2 } from "lucide-react";
import { Button } from "@workspace/ui/components/button";
import { useIdentity, usePluginSiteNavigation } from "@btst/stack/context";
import { school, useCourseEditor, useCourseStudents } from "../../hooks";
import { SCHOOL_PLUGIN_ID } from "../../constants";
import type { CourseInput } from "@btst/stack/plugins/school/query-keys";
import type { CourseDetail, Section } from "../../../types";
import { SchoolShell, ErrorMessage, Progress } from "./school-shared";

export function CourseEditorPage({ id }: { id: string }) {
	const query = useCourseEditor(id);
	if (query.error) throw query.error;
	if (id !== "new" && !query.data)
		return (
			<p className="school-shell" role="status">
				Loading course…
			</p>
		);
	return (
		<SchoolShell
			title={id === "new" ? "Create a course" : "Edit course"}
			description="Give your students a clear path from their first lesson to completion."
		>
			<CourseForm key={query.data?.id ?? "new"} course={query.data} />
		</SchoolShell>
	);
}

function CourseForm({ course }: { course?: CourseDetail }) {
	const { identity } = useIdentity();
	const { navigate, Link, resolve } = usePluginSiteNavigation(SCHOOL_PLUGIN_ID);
	const create = school.schoolCourses.create.use();
	const update = school.schoolCourses.update.use();
	const remove = school.schoolCourses.delete.use();
	const [saved, setSaved] = useState(false);
	const [tags, setTags] = useState(course?.tags.join(", ") ?? "");
	const [values, setValues] = useState<CourseInput>(
		course ?? {
			title: "",
			slug: "",
			instructorId: identity?.id ?? "",
			description: "",
			instructorName: "",
			instructorBio: "",
			coverImage: "",
			category: "",
			tags: [],
			difficulty: "beginner",
			durationMins: 0,
			price: 0,
			currency: "USD",
			status: "draft",
			featured: false,
		},
	);
	const set = <K extends keyof CourseInput>(key: K, value: CourseInput[K]) => {
		setSaved(false);
		setValues((old) => ({ ...old, [key]: value }));
	};
	const submit = async (event: FormEvent) => {
		event.preventDefault();
		try {
			const body = {
				...values,
				tags: tags
					.split(",")
					.map((tag) => tag.trim())
					.filter(Boolean),
				instructorId: values.instructorId || identity?.id || "",
			};
			if (course) {
				await update.mutateAsync({ id: course.id, data: body });
				setSaved(true);
			} else {
				const created = await create.mutateAsync(body);
				await navigate("learn", "instructor", "courses", created.id);
			}
		} catch {
			/* The mutation's error is displayed beside the form. */
		}
	};
	const deleteCourse = async () => {
		if (
			!course ||
			!window.confirm(
				`Archive “${course.title}”? You can publish it again from the course editor.`,
			)
		)
			return;
		try {
			await remove.mutateAsync(course.id);
			await navigate("learn", "instructor");
		} catch {
			/* The mutation's error is displayed below. */
		}
	};
	return (
		<>
			<form onSubmit={(event) => void submit(event)} className="school-form">
				<div className="school-form-grid">
					<label>
						Course title
						<input
							value={values.title}
							onChange={(e) => set("title", e.target.value)}
							required
							maxLength={200}
						/>
					</label>
					<label>
						Course address
						<input
							value={values.slug}
							onChange={(e) => set("slug", e.target.value)}
							required
							pattern="[a-z0-9]+(-[a-z0-9]+)*"
							placeholder="intro-to-typescript"
						/>
						<span className="school-muted">
							Lowercase words separated by hyphens.
						</span>
					</label>
				</div>
				<label>
					Description
					<textarea
						value={values.description}
						onChange={(e) => set("description", e.target.value)}
						rows={4}
						maxLength={100000}
					/>
				</label>
				<div className="school-form-grid">
					<label>
						Instructor name
						<input
							value={values.instructorName}
							onChange={(e) => set("instructorName", e.target.value)}
							maxLength={200}
						/>
					</label>
					<label>
						Cover image URL
						<input
							type="url"
							value={values.coverImage ?? ""}
							onChange={(e) => set("coverImage", e.target.value)}
							placeholder="https://…"
						/>
					</label>
				</div>
				<label>
					Instructor bio
					<textarea
						value={values.instructorBio}
						onChange={(e) => set("instructorBio", e.target.value)}
						rows={3}
						maxLength={10000}
					/>
				</label>
				<div className="school-form-grid">
					<label>
						Category
						<input
							value={values.category}
							onChange={(e) => set("category", e.target.value)}
							maxLength={100}
						/>
					</label>
					<label>
						Tags
						<input
							value={tags}
							onChange={(e) => {
								setTags(e.target.value);
								setSaved(false);
							}}
							placeholder="TypeScript, Web development"
						/>
					</label>
				</div>
				<div className="school-form-grid school-form-grid-three">
					<label>
						Difficulty
						<select
							value={values.difficulty}
							onChange={(e) =>
								set("difficulty", e.target.value as CourseInput["difficulty"])
							}
						>
							<option value="beginner">Beginner</option>
							<option value="intermediate">Intermediate</option>
							<option value="advanced">Advanced</option>
						</select>
					</label>
					<label>
						Duration (minutes)
						<input
							type="number"
							min={0}
							step={1}
							value={values.durationMins}
							onChange={(e) => set("durationMins", Number(e.target.value))}
						/>
					</label>
					<label>
						Status
						<select
							value={values.status}
							onChange={(e) =>
								set("status", e.target.value as CourseInput["status"])
							}
						>
							<option value="draft">Draft</option>
							<option value="published">Published</option>
							<option value="archived">Archived</option>
						</select>
					</label>
				</div>
				<div className="school-form-grid">
					<label>
						Price (cents)
						<input
							type="number"
							min={0}
							step={1}
							value={values.price}
							onChange={(e) => set("price", Number(e.target.value))}
						/>
						<span className="school-muted">Use 0 for a free course.</span>
					</label>
					<label>
						Currency
						<input
							value={values.currency}
							onChange={(e) => set("currency", e.target.value.toUpperCase())}
							required
							pattern="[A-Z]{3}"
							maxLength={3}
						/>
					</label>
				</div>
				<label className="school-checkbox">
					<input
						type="checkbox"
						checked={values.featured}
						onChange={(e) => set("featured", e.target.checked)}
					/>
					Feature this course in the catalog
				</label>
				<ErrorMessage error={create.error ?? update.error ?? remove.error} />
				<div className="school-toolbar">
					<div className="school-actions">
						<Button
							type="submit"
							disabled={create.isPending || update.isPending}
						>
							{create.isPending || update.isPending
								? "Saving…"
								: course
									? "Save course"
									: "Create course"}
						</Button>
						{saved && <span role="status">Course saved.</span>}
						{course?.status === "published" && (
							<Link href={resolve("learn", course.slug).href}>View course</Link>
						)}
					</div>
					{course && (
						<Button
							type="button"
							variant="destructive"
							disabled={remove.isPending}
							onClick={() => void deleteCourse()}
						>
							Archive course
						</Button>
					)}
				</div>
			</form>
			{course && (
				<>
					<CurriculumEditor course={course} />
					<StudentsPanel courseId={course.id} />
				</>
			)}
		</>
	);
}

function CurriculumEditor({ course }: { course: CourseDetail }) {
	const { Link, resolve } = usePluginSiteNavigation(SCHOOL_PLUGIN_ID);
	const createSection = school.schoolSections.create.use();
	const reorder = school.schoolCourses.reorder.use();
	const deleteLesson = school.schoolLessons.delete.use();
	const [sectionTitle, setSectionTitle] = useState("");
	const [dragged, setDragged] = useState<string | null>(null);
	const addSection = async (event: FormEvent) => {
		event.preventDefault();
		try {
			await createSection.mutateAsync({
				id: course.id,
				title: sectionTitle,
				order: course.sections.length,
			});
			setSectionTitle("");
		} catch {
			/* Error rendered below. */
		}
	};
	const move = (id: string, targetIndex: number) => {
		const ids = course.lessons.map((lesson) => lesson.id);
		const current = ids.indexOf(id);
		if (
			current < 0 ||
			current === targetIndex ||
			targetIndex < 0 ||
			targetIndex >= ids.length
		)
			return;
		ids.splice(current, 1);
		ids.splice(targetIndex, 0, id);
		void reorder.mutateAsync({ id: course.id, lessonIds: ids }).catch(() => {});
	};
	return (
		<section className="school-section">
			<div className="school-toolbar">
				<div>
					<h2>Curriculum</h2>
					<p className="school-muted">
						Drag lessons to reorder them, or use the move buttons.
					</p>
				</div>
				<Button asChild>
					<Link
						href={
							resolve(
								"learn",
								"instructor",
								"courses",
								course.id,
								"lessons",
								"new",
							).href
						}
					>
						<Plus aria-hidden="true" size={16} />
						Add lesson
					</Link>
				</Button>
			</div>
			<div className="school-section-editor">
				{course.sections.map((section) => (
					<SectionEditor key={section.id} section={section} />
				))}
			</div>
			<form
				onSubmit={(event) => void addSection(event)}
				className="school-inline-form"
			>
				<label>
					New section
					<input
						value={sectionTitle}
						onChange={(e) => setSectionTitle(e.target.value)}
						required
						maxLength={200}
						placeholder="Getting started"
					/>
				</label>
				<Button
					type="submit"
					variant="outline"
					disabled={createSection.isPending}
				>
					Add section
				</Button>
			</form>
			<ol className="school-edit-lessons">
				{course.lessons.map((lesson, index) => (
					<li
						key={lesson.id}
						draggable={!reorder.isPending}
						onDragStart={() => setDragged(lesson.id)}
						onDragEnd={() => setDragged(null)}
						onDragOver={(event) => event.preventDefault()}
						onDrop={(event) => {
							event.preventDefault();
							if (dragged) move(dragged, index);
							setDragged(null);
						}}
					>
						<GripVertical aria-hidden="true" size={18} />
						<div className="school-edit-lesson-title">
							<Link
								href={
									resolve(
										"learn",
										"instructor",
										"courses",
										course.id,
										"lessons",
										lesson.id,
									).href
								}
							>
								{lesson.title}
							</Link>
							<span className="school-muted">
								{course.sections.find(
									(section) => section.id === lesson.sectionId,
								)?.title ?? "No section"}{" "}
								/ {lesson.type}
								{lesson.isFreePreview ? " / Free preview" : ""}
							</span>
						</div>
						<div className="school-actions">
							<Button
								type="button"
								size="icon"
								variant="ghost"
								aria-label={`Move ${lesson.title} up`}
								disabled={index === 0 || reorder.isPending}
								onClick={() => move(lesson.id, index - 1)}
							>
								<ArrowUp size={16} />
							</Button>
							<Button
								type="button"
								size="icon"
								variant="ghost"
								aria-label={`Move ${lesson.title} down`}
								disabled={
									index === course.lessons.length - 1 || reorder.isPending
								}
								onClick={() => move(lesson.id, index + 1)}
							>
								<ArrowDown size={16} />
							</Button>
							<Button
								type="button"
								size="icon"
								variant="ghost"
								aria-label={`Delete ${lesson.title}`}
								disabled={deleteLesson.isPending}
								onClick={() => {
									if (window.confirm(`Delete “${lesson.title}”?`))
										void deleteLesson.mutateAsync(lesson.id).catch(() => {});
								}}
							>
								<Trash2 size={16} />
							</Button>
						</div>
					</li>
				))}
			</ol>
			{!course.lessons.length && (
				<p className="school-muted">
					Add your first lesson to start building the curriculum.
				</p>
			)}
			<ErrorMessage
				error={createSection.error ?? reorder.error ?? deleteLesson.error}
			/>
		</section>
	);
}
function SectionEditor({ section }: { section: Section }) {
	const update = school.schoolSections.update.use();
	const remove = school.schoolSections.delete.use();
	const [title, setTitle] = useState(section.title);
	return (
		<form
			className="school-inline-form"
			onSubmit={(event) => {
				event.preventDefault();
				void update.mutateAsync({ id: section.id, title }).catch(() => {});
			}}
		>
			<label>
				Section title
				<input
					value={title}
					onChange={(e) => setTitle(e.target.value)}
					required
					maxLength={200}
				/>
			</label>
			<Button
				type="submit"
				variant="outline"
				disabled={update.isPending || title === section.title}
			>
				Rename
			</Button>
			<Button
				type="button"
				variant="ghost"
				aria-label={`Delete section ${section.title}`}
				disabled={remove.isPending}
				onClick={() => {
					if (
						window.confirm(
							`Delete section “${section.title}”? Lessons will be kept.`,
						)
					)
						void remove.mutateAsync(section.id).catch(() => {});
				}}
			>
				<Trash2 size={16} />
			</Button>
			<ErrorMessage error={update.error ?? remove.error} />
		</form>
	);
}
function StudentsPanel({ courseId }: { courseId: string }) {
	const query = useCourseStudents(courseId);
	return (
		<section className="school-section">
			<h2>Students and progress</h2>
			<ErrorMessage error={query.error} />
			{query.data && (
				<>
					<div className="school-analytics">
						<p>
							<strong>{query.data.analytics.totalEnrolled}</strong> enrollments
						</p>
						<p>
							<strong>{query.data.analytics.totalCompleted}</strong> completed
						</p>
						<p>
							<strong>
								{Math.round(query.data.analytics.completionRate)}%
							</strong>{" "}
							completion rate
						</p>
					</div>
					<div className="school-table-wrap">
						<table className="school-table">
							<thead>
								<tr>
									<th>Student</th>
									<th>Status</th>
									<th>Progress</th>
									<th>Enrolled</th>
								</tr>
							</thead>
							<tbody>
								{query.data.items.map((student) => (
									<tr key={student.id}>
										<td>{student.userId}</td>
										<td>{student.status}</td>
										<td>
											<Progress value={student.progressPct} />
										</td>
										<td>
											{new Date(student.enrolledAt).toLocaleDateString(
												"en-US",
												{ timeZone: "UTC" },
											)}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
					{!query.data.items.length && (
						<p className="school-muted">
							Student progress will appear here after the first enrollment.
						</p>
					)}
					{query.data.analytics.enrollmentsOverTime.length > 0 && (
						<details>
							<summary>Enrollments over time</summary>
							<table className="school-table">
								<thead>
									<tr>
										<th>Date</th>
										<th>Enrollments</th>
									</tr>
								</thead>
								<tbody>
									{query.data.analytics.enrollmentsOverTime.map((day) => (
										<tr key={day.date}>
											<td>{day.date}</td>
											<td>{day.count}</td>
										</tr>
									))}
								</tbody>
							</table>
						</details>
					)}
				</>
			)}
		</section>
	);
}
