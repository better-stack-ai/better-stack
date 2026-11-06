"use client";
import { Button } from "@workspace/ui/components/button";
import { usePluginSiteNavigation } from "@btst/stack/context";
import { school, useSuspenseMyCourses } from "../../hooks";
import { SCHOOL_PLUGIN_ID } from "../../constants";
import {
	SchoolShell,
	ErrorMessage,
	EmptyMessage,
	CourseCard,
	CompletedLabel,
} from "./school-shared";

export function MyCoursesPage() {
	const { data: enrollments } = useSuspenseMyCourses();
	const cancel = school.schoolCourses.cancel.use();
	const retryCertificate = school.schoolCourses.retryCertificate.use();
	const { Link, resolve } = usePluginSiteNavigation(SCHOOL_PLUGIN_ID);
	const active = enrollments.filter(
		(enrollment) => enrollment.status !== "cancelled",
	);
	return (
		<SchoolShell title="My courses" description="Pick up where you left off.">
			{active.length ? (
				<div className="school-course-grid">
					{active.map((enrollment) => {
						const next = enrollment.lastLessonId ?? enrollment.lessons[0]?.id;
						return (
							<div className="school-enrolled-course" key={enrollment.id}>
								<CourseCard
									course={enrollment.course}
									enrollment={enrollment}
								/>
								<div className="school-enrolled-actions">
									{enrollment.status === "completed" ? (
										<CompletedLabel />
									) : enrollment.status === "pending_payment" ? (
										<Button asChild>
											<Link
												href={resolve("learn", enrollment.course.slug).href}
											>
												Continue payment
											</Link>
										</Button>
									) : (
										next && (
											<Button asChild>
												<Link
													href={
														resolve(
															"learn",
															enrollment.course.slug,
															"lessons",
															next,
														).href
													}
												>
													Continue learning
												</Link>
											</Button>
										)
									)}
									{enrollment.status === "enrolled" && (
										<Button
											type="button"
											variant="ghost"
											disabled={cancel.isPending}
											onClick={() => {
												if (
													window.confirm(
														`Cancel your enrollment in “${enrollment.course.title}”? Your progress will be kept, but you will lose lesson access. This enrollment cannot be restarted.`,
													)
												)
													void cancel
														.mutateAsync(enrollment.courseId)
														.catch(() => {});
											}}
										>
											Cancel enrollment
										</Button>
									)}
									{enrollment.certificatePending && (
										<Button
											type="button"
											variant="outline"
											disabled={retryCertificate.isPending}
											onClick={() =>
												void retryCertificate
													.mutateAsync(enrollment.courseId)
													.catch(() => {})
											}
										>
											{retryCertificate.isPending
												? "Retrying certificate…"
												: "Retry certificate"}
										</Button>
									)}
									{enrollment.certificateId && (
										<Link
											href={
												resolve(
													"learn",
													"certificates",
													enrollment.certificateId,
												).href
											}
										>
											View certificate
										</Link>
									)}
								</div>
							</div>
						);
					})}
				</div>
			) : (
				<EmptyMessage>
					<h2>Your first lesson starts here</h2>
					<p>
						Enroll in a course to keep your lessons and progress in one place.
					</p>
					<Link href={resolve("learn").href}>Browse courses</Link>
				</EmptyMessage>
			)}
			<ErrorMessage error={cancel.error ?? retryCertificate.error} />
		</SchoolShell>
	);
}
