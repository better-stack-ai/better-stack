"use client";
import { Button } from "@workspace/ui/components/button";
import { usePluginSiteNavigation } from "@btst/stack/context";
import { useInstructorCourses } from "../../hooks";
import { SCHOOL_PLUGIN_ID } from "../../constants";
import { SchoolShell, EmptyMessage } from "./school-shared";

export function InstructorDashboardPage() {
	const { data: courses } = useInstructorCourses();
	const { Link, resolve } = usePluginSiteNavigation(SCHOOL_PLUGIN_ID);
	return (
		<SchoolShell
			title="Instructor dashboard"
			description="Build your curriculum and follow your students’ progress."
		>
			<div className="school-toolbar">
				<p>
					{courses.length} {courses.length === 1 ? "course" : "courses"}
				</p>
				<Button asChild>
					<Link href={resolve("learn", "instructor", "courses", "new").href}>
						Create course
					</Link>
				</Button>
			</div>
			{courses.length ? (
				<div className="school-table-wrap">
					<table className="school-table">
						<thead>
							<tr>
								<th>Course</th>
								<th>Status</th>
								<th>Lessons</th>
								<th>
									<span className="sr-only">Actions</span>
								</th>
							</tr>
						</thead>
						<tbody>
							{courses.map((course) => (
								<tr key={course.id}>
									<td>
										<strong>{course.title}</strong>
										<p className="school-muted">{course.category}</p>
									</td>
									<td>
										<span className="school-pill">{course.status}</span>
									</td>
									<td>{course.lessonCount}</td>
									<td>
										<Link
											href={
												resolve("learn", "instructor", "courses", course.id)
													.href
											}
											aria-label={`Edit ${course.title}`}
										>
											Edit course
										</Link>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			) : (
				<EmptyMessage>
					<h2>Start teaching</h2>
					<p>
						Create a course, add your lessons, then publish it to the catalog.
					</p>
				</EmptyMessage>
			)}
		</SchoolShell>
	);
}
