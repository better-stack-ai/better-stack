"use client";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Button } from "@workspace/ui/components/button";
import { usePluginSiteNavigation } from "@btst/stack/context";
import {
	useSuspenseCourse,
	useLesson,
	useLessonProgress,
	useSubmitQuiz,
} from "../../hooks";
import { SCHOOL_PLUGIN_ID } from "../../constants";
import {
	SchoolShell,
	Curriculum,
	ErrorMessage,
	CompletedLabel,
} from "./school-shared";
import type { QuizAttempt } from "../../../types";

export function LessonPlayerPage({
	slug,
	lessonId,
}: {
	slug: string;
	lessonId: string;
}) {
	const { data: course } = useSuspenseCourse(slug);
	const { data } = useLesson(lessonId);
	const save = useLessonProgress();
	const { Link, resolve } = usePluginSiteNavigation(SCHOOL_PLUGIN_ID);
	const lastSaved = useRef(0);
	const { lesson, enrollment, progress } = data;
	useEffect(() => {
		if (enrollment && lesson.type === "text")
			void save
				.mutateAsync({
					id: lesson.id,
					positionSecs: progress?.positionSecs ?? 0,
				})
				.catch(() => {});
	}, [lesson.id, enrollment?.id]);
	if (lesson.courseId !== course.id)
		throw new Error("This lesson does not belong to this course.");
	const next =
		course.lessons[
			course.lessons.findIndex((item) => item.id === lessonId) + 1
		];
	const savePosition = (position: number) => {
		if (!enrollment) return;
		lastSaved.current = position;
		void save
			.mutateAsync({ id: lessonId, positionSecs: position })
			.catch(() => {});
	};
	return (
		<SchoolShell title={course.title}>
			<div className="school-player-grid">
				<aside>
					<Link href={resolve("learn", slug).href}>Course overview</Link>
					<Curriculum
						course={course}
						activeLessonId={lessonId}
						enrollment={enrollment}
					/>
				</aside>
				<article className="school-lesson">
					<div className="school-lesson-heading">
						<h2>{lesson.title}</h2>
						{progress?.completed && <CompletedLabel />}
					</div>
					{lesson.isFreePreview && !enrollment && (
						<p className="school-preview-note">
							Free preview.{" "}
							<Link href={resolve("learn", slug).href}>
								Enroll to save your progress.
							</Link>
						</p>
					)}
					{lesson.type === "video" && lesson.videoUrl && (
						<video
							key={lesson.id}
							controls
							preload="metadata"
							className="school-video"
							aria-label={lesson.title}
							onLoadedMetadata={(event) => {
								if (progress?.positionSecs)
									event.currentTarget.currentTime = progress.positionSecs;
							}}
							onPause={(event) => savePosition(event.currentTarget.currentTime)}
							onTimeUpdate={(event) => {
								if (
									Math.abs(
										event.currentTarget.currentTime - lastSaved.current,
									) >= 10
								)
									savePosition(event.currentTarget.currentTime);
							}}
						>
							<source src={lesson.videoUrl} />
							<track kind="captions" />
							Your browser does not support video playback.{" "}
							<a href={lesson.videoUrl}>Open the lesson video</a>.
						</video>
					)}
					{lesson.type === "quiz" ? (
						<LessonQuiz lessonId={lessonId} />
					) : (
						<div className="school-lesson-content">
							<ReactMarkdown>{lesson.content}</ReactMarkdown>
						</div>
					)}
					{lesson.resources.length > 0 && (
						<section className="school-section">
							<h3>Lesson resources</h3>
							<ul>
								{lesson.resources.map((resource) => (
									<li key={resource.url}>
										<a
											href={resource.url}
											target="_blank"
											rel="noopener noreferrer"
											download
										>
											{resource.label}
										</a>
									</li>
								))}
							</ul>
						</section>
					)}
					<ErrorMessage error={save.error} />
					{enrollment && lesson.type !== "quiz" && !progress?.completed && (
						<Button
							disabled={save.isPending}
							onClick={() =>
								void save
									.mutateAsync({ id: lessonId, completed: true })
									.catch(() => {})
							}
						>
							{save.isPending ? "Saving…" : "Mark lesson complete"}
						</Button>
					)}
					{next &&
						(progress?.completed || lesson.type === "quiz" || save.data) && (
							<p className="school-next-lesson">
								<Link href={resolve("learn", slug, "lessons", next.id).href}>
									Next lesson: {next.title}
								</Link>
							</p>
						)}
					{enrollment?.certificateId && (
						<p>
							<Link
								href={
									resolve("learn", "certificates", enrollment.certificateId)
										.href
								}
							>
								View your certificate
							</Link>
						</p>
					)}
				</article>
			</div>
		</SchoolShell>
	);
}

export function LessonQuiz({ lessonId }: { lessonId: string }) {
	const { data } = useLesson(lessonId);
	const submit = useSubmitQuiz();
	const [answers, setAnswers] = useState<Record<string, number>>({});
	const [result, setResult] = useState<QuizAttempt | null>(null);
	const quiz = data.lesson.quiz;
	if (!quiz) return <p>This lesson has no quiz.</p>;
	const atLimit =
		!!quiz.maxAttempts && data.attempts.length >= quiz.maxAttempts;
	const send = async (event: React.FormEvent) => {
		event.preventDefault();
		try {
			setResult(
				await submit.mutateAsync({
					id: lessonId,
					answers: quiz.questions.map((question) => ({
						questionId: question.id,
						answer: answers[question.id]!,
					})),
				}),
			);
		} catch {
			/* The operation reports scoring and attempt-limit errors below. */
		}
	};
	return (
		<section className="school-quiz">
			<h3>Check your understanding</h3>
			{quiz.passMark !== undefined && <p>Pass mark: {quiz.passMark}%</p>}
			{quiz.maxAttempts && (
				<p>
					{data.attempts.length} of {quiz.maxAttempts} attempts used
				</p>
			)}
			{result && (
				<div role="status" className="school-quiz-result">
					<strong>
						{result.passed ? "Quiz passed" : "Keep practicing"}: {result.score}%
					</strong>
					<p>
						{result.passed
							? "This lesson is complete. Your course progress has been updated."
							: "Review the lesson before trying again."}
					</p>
				</div>
			)}
			{!data.enrollment && (
				<p>Enroll in this course to submit your answers and save your score.</p>
			)}
			<form onSubmit={(event) => void send(event)}>
				{quiz.questions.map((question, index) => (
					<fieldset
						key={question.id}
						disabled={submit.isPending || atLimit || !data.enrollment}
						className="school-question"
					>
						<legend>
							{index + 1}. {question.question}
						</legend>
						{question.options.map((option, optionIndex) => (
							<label key={optionIndex} className="school-answer">
								<input
									type="radio"
									name={question.id}
									value={optionIndex}
									checked={answers[question.id] === optionIndex}
									onChange={() =>
										setAnswers((old) => ({
											...old,
											[question.id]: optionIndex,
										}))
									}
									required
								/>
								{option}
							</label>
						))}
					</fieldset>
				))}
				<ErrorMessage error={submit.error} />
				{atLimit ? (
					<p>All attempts have been used.</p>
				) : (
					<Button
						type="submit"
						disabled={
							submit.isPending ||
							!data.enrollment ||
							quiz.questions.some(
								(question) => answers[question.id] === undefined,
							)
						}
					>
						{submit.isPending ? "Checking answers…" : "Submit quiz"}
					</Button>
				)}
			</form>
			{data.attempts.length > 0 && (
				<section className="school-section">
					<h3>Your attempts</h3>
					<ol className="school-attempts">
						{data.attempts.map((attempt) => (
							<li key={attempt.id}>
								<span>
									{new Date(attempt.attemptedAt).toLocaleString("en-US", {
										timeZone: "UTC",
										timeZoneName: "short",
									})}
								</span>
								<strong>{attempt.score}%</strong>
								<span>{attempt.passed ? "Passed" : "Not passed"}</span>
							</li>
						))}
					</ol>
				</section>
			)}
		</section>
	);
}
