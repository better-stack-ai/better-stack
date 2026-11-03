"use client";
import { useState, type FormEvent } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@workspace/ui/components/button";
import { usePluginSiteNavigation } from "@btst/stack/context";
import { school, useCourseEditor, useLessonEditor } from "../../hooks";
import { SCHOOL_PLUGIN_ID } from "../../constants";
import type { LessonInput } from "@btst/stack/plugins/school/query-keys";
import type { CourseDetail, Lesson, Quiz } from "../../../types";
import { SchoolShell, ErrorMessage } from "./school-shared";

export function LessonEditorPage({
	id,
	lessonId,
}: {
	id: string;
	lessonId: string;
}) {
	const course = useCourseEditor(id);
	const lesson = useLessonEditor(lessonId);
	if (course.error) throw course.error;
	if (lesson.error) throw lesson.error;
	if (!course.data || (lessonId !== "new" && !lesson.data))
		return (
			<p className="school-shell" role="status">
				Loading lesson…
			</p>
		);
	if (lesson.data && lesson.data.courseId !== id)
		throw new Error("This lesson does not belong to this course.");
	return (
		<SchoolShell
			title={lessonId === "new" ? "Add a lesson" : "Edit lesson"}
			description={course.data.title}
		>
			<LessonForm
				key={lesson.data?.id ?? "new"}
				course={course.data}
				lesson={lesson.data}
			/>
		</SchoolShell>
	);
}
const blankQuestion = () => ({
	id: crypto.randomUUID(),
	question: "",
	options: ["", ""],
	correctAnswer: 0,
});

function LessonForm({
	course,
	lesson,
}: {
	course: CourseDetail;
	lesson?: Lesson;
}) {
	const { navigate, Link, resolve } = usePluginSiteNavigation(SCHOOL_PLUGIN_ID);
	const create = school.schoolLessons.create.use();
	const update = school.schoolLessons.update.use();
	const [saved, setSaved] = useState(false);
	const [values, setValues] = useState<LessonInput>({
		title: lesson?.title ?? "",
		type: lesson?.type ?? "text",
		sectionId: lesson?.sectionId ?? null,
		content: lesson?.content ?? "",
		videoUrl: lesson?.videoUrl ?? "",
		durationMins: lesson?.durationMins ?? 0,
		order:
			lesson?.order ??
			Math.max(-1, ...course.lessons.map((item) => item.order)) + 1,
		isFreePreview: lesson?.isFreePreview ?? false,
		resources: lesson?.resources ?? [],
		quiz: lesson?.quiz
			? {
					...lesson.quiz,
					questions: lesson.quiz.questions.map((question) => ({
						...question,
						correctAnswer:
							"correctAnswer" in question ? question.correctAnswer : 0,
					})),
				}
			: null,
	});
	const [quiz, setQuiz] = useState<Quiz>(
		() => values.quiz ?? { questions: [blankQuestion()] },
	);
	const set = <K extends keyof LessonInput>(key: K, value: LessonInput[K]) => {
		setSaved(false);
		setValues((old) => ({ ...old, [key]: value }));
	};
	const setQuestion = (
		index: number,
		data: Partial<Quiz["questions"][number]>,
	) =>
		setQuiz((old) => ({
			...old,
			questions: old.questions.map((question, i) =>
				i === index ? { ...question, ...data } : question,
			),
		}));
	const submit = async (event: FormEvent) => {
		event.preventDefault();
		try {
			const body = { ...values, quiz: values.type === "quiz" ? quiz : null };
			if (lesson) {
				await update.mutateAsync({ id: lesson.id, data: body });
				setSaved(true);
			} else {
				await create.mutateAsync({ id: course.id, data: body });
				await navigate("learn", "instructor", "courses", course.id);
			}
		} catch {
			/* Validation and operation errors are rendered below. */
		}
	};
	return (
		<form onSubmit={(event) => void submit(event)} className="school-form">
			<Link href={resolve("learn", "instructor", "courses", course.id).href}>
				Back to course
			</Link>
			<label>
				Lesson title
				<input
					value={values.title}
					onChange={(e) => set("title", e.target.value)}
					required
					maxLength={200}
				/>
			</label>
			<div className="school-form-grid">
				<label>
					Lesson type
					<select
						value={values.type}
						onChange={(e) => set("type", e.target.value as LessonInput["type"])}
					>
						<option value="text">Text</option>
						<option value="video">Video</option>
						<option value="quiz">Quiz</option>
					</select>
				</label>
				<label>
					Section
					<select
						value={values.sectionId ?? ""}
						onChange={(e) => set("sectionId", e.target.value || null)}
					>
						<option value="">No section</option>
						{course.sections.map((section) => (
							<option key={section.id} value={section.id}>
								{section.title}
							</option>
						))}
					</select>
				</label>
			</div>
			<div className="school-form-grid">
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
				<label className="school-checkbox">
					<input
						type="checkbox"
						checked={values.isFreePreview}
						onChange={(e) => set("isFreePreview", e.target.checked)}
					/>
					Allow free preview
				</label>
			</div>
			{values.type === "video" && (
				<label>
					Video URL
					<input
						type="url"
						value={values.videoUrl ?? ""}
						onChange={(e) => set("videoUrl", e.target.value)}
						required
						placeholder="https://…"
					/>
					<span className="school-muted">
						Use a directly playable video URL.
					</span>
				</label>
			)}
			{values.type !== "quiz" && (
				<label>
					{values.type === "video"
						? "Lesson notes or transcript"
						: "Lesson content"}
					<textarea
						value={values.content}
						onChange={(e) => set("content", e.target.value)}
						rows={14}
						maxLength={100000}
					/>
					<span className="school-muted">
						Markdown formatting is supported.
					</span>
				</label>
			)}
			{values.type === "quiz" && (
				<section className="school-quiz-author">
					<h2>Quiz questions</h2>
					<div className="school-form-grid">
						<label>
							Pass mark (%)
							<input
								type="number"
								min={0}
								max={100}
								value={quiz.passMark ?? ""}
								placeholder="School default"
								onChange={(e) =>
									setQuiz((old) => ({
										...old,
										passMark:
											e.target.value === ""
												? undefined
												: Number(e.target.value),
									}))
								}
							/>
						</label>
						<label>
							Maximum attempts
							<input
								type="number"
								min={1}
								max={100}
								step={1}
								value={quiz.maxAttempts ?? ""}
								placeholder="Unlimited"
								onChange={(e) =>
									setQuiz((old) => ({
										...old,
										maxAttempts:
											e.target.value === ""
												? undefined
												: Number(e.target.value),
									}))
								}
							/>
						</label>
					</div>
					{quiz.questions.map((question, index) => (
						<fieldset className="school-author-question" key={question.id}>
							<legend>Question {index + 1}</legend>
							<label>
								Question
								<input
									value={question.question}
									onChange={(e) =>
										setQuestion(index, { question: e.target.value })
									}
									required
									maxLength={2000}
								/>
							</label>
							{question.options.map((option, optionIndex) => (
								<label key={optionIndex}>
									Option {optionIndex + 1}
									<input
										value={option}
										onChange={(e) =>
											setQuestion(index, {
												options: question.options.map((value, i) =>
													i === optionIndex ? e.target.value : value,
												),
											})
										}
										required
										maxLength={1000}
									/>
								</label>
							))}
							<div className="school-actions">
								<Button
									type="button"
									variant="outline"
									disabled={question.options.length >= 10}
									onClick={() =>
										setQuestion(index, { options: [...question.options, ""] })
									}
								>
									Add option
								</Button>
								{question.options.length > 2 && (
									<Button
										type="button"
										variant="ghost"
										onClick={() =>
											setQuestion(index, {
												options: question.options.slice(0, -1),
												correctAnswer: Math.min(
													question.correctAnswer,
													question.options.length - 2,
												),
											})
										}
									>
										Remove last option
									</Button>
								)}
							</div>
							<label>
								Correct answer
								<select
									value={question.correctAnswer}
									onChange={(e) =>
										setQuestion(index, {
											correctAnswer: Number(e.target.value),
										})
									}
								>
									{question.options.map((option, i) => (
										<option key={i} value={i}>
											Option {i + 1}
											{option ? `: ${option}` : ""}
										</option>
									))}
								</select>
							</label>
							{quiz.questions.length > 1 && (
								<Button
									type="button"
									variant="ghost"
									onClick={() =>
										setQuiz((old) => ({
											...old,
											questions: old.questions.filter((_, i) => i !== index),
										}))
									}
								>
									<Trash2 aria-hidden="true" size={16} />
									Remove question
								</Button>
							)}
						</fieldset>
					))}
					<Button
						type="button"
						variant="outline"
						disabled={quiz.questions.length >= 100}
						onClick={() =>
							setQuiz((old) => ({
								...old,
								questions: [...old.questions, blankQuestion()],
							}))
						}
					>
						<Plus aria-hidden="true" size={16} />
						Add question
					</Button>
				</section>
			)}
			<section>
				<h2>Downloadable resources</h2>
				{values.resources?.map((resource, index) => (
					<div key={index} className="school-resource-row">
						<label>
							Resource label
							<input
								value={resource.label}
								onChange={(e) =>
									set(
										"resources",
										values.resources?.map((value, i) =>
											i === index ? { ...value, label: e.target.value } : value,
										),
									)
								}
								required
								maxLength={200}
							/>
						</label>
						<label>
							Resource URL
							<input
								type="url"
								value={resource.url}
								onChange={(e) =>
									set(
										"resources",
										values.resources?.map((value, i) =>
											i === index ? { ...value, url: e.target.value } : value,
										),
									)
								}
								required
							/>
						</label>
						<Button
							type="button"
							variant="ghost"
							aria-label={`Remove resource ${index + 1}`}
							onClick={() =>
								set(
									"resources",
									values.resources?.filter((_, i) => i !== index),
								)
							}
						>
							<Trash2 aria-hidden="true" size={16} />
						</Button>
					</div>
				))}
				<Button
					type="button"
					variant="outline"
					disabled={(values.resources?.length ?? 0) >= 30}
					onClick={() =>
						set("resources", [
							...(values.resources ?? []),
							{ label: "", url: "" },
						])
					}
				>
					<Plus aria-hidden="true" size={16} />
					Add resource
				</Button>
			</section>
			<ErrorMessage error={create.error ?? update.error} />
			<div className="school-actions">
				<Button type="submit" disabled={create.isPending || update.isPending}>
					{create.isPending || update.isPending ? "Saving…" : "Save lesson"}
				</Button>
				{saved && <span role="status">Lesson saved.</span>}
			</div>
		</form>
	);
}
