"use client";
import { useState, type FormEvent } from "react";
import { Button } from "@workspace/ui/components/button";
import { useIdentity, usePluginSiteNavigation } from "@btst/stack/context";
import {
	useSuspenseCourse,
	useMyCourses,
	useEnroll,
	school,
} from "../../hooks";
import { SCHOOL_PLUGIN_ID } from "../../constants";
import {
	SchoolShell,
	ErrorMessage,
	Curriculum,
	priceLabel,
	Progress,
} from "./school-shared";

export function CourseDetailPage({ slug }: { slug: string }) {
	const { data: course } = useSuspenseCourse(slug);
	const { identity } = useIdentity();
	const mine = useMyCourses(!!identity);
	const ownEnrollment = mine.data?.find((item) => item.courseId === course.id);
	const cancelled = ownEnrollment?.status === "cancelled";
	const enrollment = cancelled ? undefined : ownEnrollment;
	const enroll = useEnroll();
	const review = school.schoolCourses.review.use();
	const { Link, navigate, resolve } = usePluginSiteNavigation(SCHOOL_PLUGIN_ID);
	const [body, setBody] = useState("");
	const [rating, setRating] = useState(5);
	const firstLesson = enrollment?.lastLessonId ?? course.lessons[0]?.id;
	const start = async () => {
		try {
			await enroll.mutateAsync(course.id);
			if (firstLesson) await navigate("learn", slug, "lessons", firstLesson);
		} catch {
			/* Mutation error is displayed below. */
		}
	};
	const submitReview = async (event: FormEvent) => {
		event.preventDefault();
		try {
			await review.mutateAsync({ id: course.id, rating, body });
			setBody("");
		} catch {
			/* Mutation error is displayed below. */
		}
	};
	return (
		<SchoolShell title={course.title} description={course.description}>
			<div className="school-detail-grid">
				<div>
					{course.coverImage && (
						<img
							src={course.coverImage}
							alt=""
							className="school-detail-cover"
						/>
					)}
					<h2>What you’ll learn</h2>
					<Curriculum course={course} enrollment={enrollment} />
					<section className="school-section">
						<h2>Your instructor</h2>
						<h3>{course.instructorName || "Course instructor"}</h3>
						<p className="school-text">
							{course.instructorBio ||
								"Learn through the lessons and resources in this course."}
						</p>
					</section>
					{course.tags.length > 0 && (
						<ul className="school-tags" aria-label="Course topics">
							{course.tags.map((tag) => (
								<li key={tag}>{tag}</li>
							))}
						</ul>
					)}
				</div>
				<aside className="school-enrollment-panel">
					<strong className="school-price">{priceLabel(course)}</strong>
					<dl className="school-course-facts">
						<div>
							<dt>Level</dt>
							<dd>{course.difficulty}</dd>
						</div>
						<div>
							<dt>Lessons</dt>
							<dd>{course.lessonCount}</dd>
						</div>
						<div>
							<dt>Duration</dt>
							<dd>{course.durationMins} min</dd>
						</div>
					</dl>
					{enrollment ? (
						<>
							<Progress value={enrollment.progressPct} />
							{firstLesson && (
								<Button asChild>
									<Link
										href={resolve("learn", slug, "lessons", firstLesson).href}
									>
										Continue learning
									</Link>
								</Button>
							)}
							{enrollment.certificateId && (
								<Link
									href={
										resolve("learn", "certificates", enrollment.certificateId)
											.href
									}
								>
									View certificate
								</Link>
							)}
						</>
					) : cancelled ? (
						<p role="status">
							Enrollment cancelled. This enrollment cannot be restarted.
						</p>
					) : (
						<Button onClick={() => void start()} disabled={enroll.isPending}>
							{enroll.isPending
								? "Enrolling…"
								: course.price
									? "Enroll in course"
									: "Enroll for free"}
						</Button>
					)}
					<ErrorMessage error={enroll.error} />
					{!enrollment && !cancelled && (
						<p className="school-muted">
							{course.price
								? "Enrollment continues after payment is confirmed."
								: "Sign in to save your progress."}
						</p>
					)}
				</aside>
			</div>
			<section className="school-section">
				<h2>Student reviews</h2>
				{course.reviews.length ? (
					<div className="school-reviews">
						{course.reviews.map((item) => (
							<blockquote key={item.id}>
								<span aria-label={`${item.rating} out of 5 stars`}>
									{"★".repeat(item.rating)}
									{"☆".repeat(5 - item.rating)}
								</span>
								<p>{item.body}</p>
							</blockquote>
						))}
					</div>
				) : (
					<p className="school-muted">No reviews yet.</p>
				)}
				{enrollment && (
					<form
						onSubmit={(event) => void submitReview(event)}
						className="school-form school-review-form"
					>
						<h3>Share your experience</h3>
						<label>
							Rating
							<select
								value={rating}
								onChange={(e) => setRating(Number(e.target.value))}
							>
								{[5, 4, 3, 2, 1].map((value) => (
									<option key={value} value={value}>
										{value} out of 5
									</option>
								))}
							</select>
						</label>
						<label>
							Your review
							<textarea
								value={body}
								onChange={(e) => setBody(e.target.value)}
								required
								maxLength={5000}
							/>
						</label>
						<ErrorMessage error={review.error} />
						<Button type="submit" disabled={review.isPending}>
							{review.isPending ? "Saving…" : "Save review"}
						</Button>
					</form>
				)}
			</section>
		</SchoolShell>
	);
}
