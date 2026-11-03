"use client";
import { useState } from "react";
import { useSuspenseCourses } from "../../hooks";
import type { CatalogFilters } from "../../../query-keys";
import { SchoolShell, CourseCard, EmptyMessage } from "./school-shared";

export function CourseListPage() {
	const [filters, setFilters] = useState<CatalogFilters>({});
	const { data } = useSuspenseCourses(filters);
	const set = <K extends keyof CatalogFilters>(
		key: K,
		value: CatalogFilters[K],
	) => setFilters((old) => ({ ...old, [key]: value }));
	return (
		<SchoolShell
			title="Find your next course"
			description="Learn something useful, one lesson at a time."
		>
			<div className="school-filters" role="search" aria-label="Filter courses">
				<label>
					Search
					<input
						type="search"
						placeholder="Search courses"
						value={filters.query ?? ""}
						onChange={(e) => set("query", e.target.value || undefined)}
					/>
				</label>
				<label>
					Category
					<input
						placeholder="All categories"
						value={filters.category ?? ""}
						onChange={(e) => set("category", e.target.value || undefined)}
					/>
				</label>
				<label>
					Difficulty
					<select
						value={filters.difficulty ?? ""}
						onChange={(e) =>
							set(
								"difficulty",
								(e.target.value || undefined) as CatalogFilters["difficulty"],
							)
						}
					>
						<option value="">All levels</option>
						<option value="beginner">Beginner</option>
						<option value="intermediate">Intermediate</option>
						<option value="advanced">Advanced</option>
					</select>
				</label>
				<label>
					Duration
					<select
						value={filters.maxDurationMins ?? ""}
						onChange={(e) =>
							set(
								"maxDurationMins",
								e.target.value ? Number(e.target.value) : undefined,
							)
						}
					>
						<option value="">Any duration</option>
						<option value="30">Up to 30 min</option>
						<option value="60">Up to 1 hour</option>
						<option value="180">Up to 3 hours</option>
					</select>
				</label>
				<label>
					Price
					<select
						value={filters.pricing ?? ""}
						onChange={(e) =>
							set(
								"pricing",
								(e.target.value || undefined) as CatalogFilters["pricing"],
							)
						}
					>
						<option value="">Any price</option>
						<option value="free">Free</option>
						<option value="paid">Paid</option>
					</select>
				</label>
			</div>
			<p className="school-result-count">
				{data.total} {data.total === 1 ? "course" : "courses"}
			</p>
			{data.items.length ? (
				<div className="school-course-grid">
					{data.items.map((course) => (
						<CourseCard key={course.id} course={course} />
					))}
				</div>
			) : (
				<EmptyMessage>
					No courses match these filters. Try a different category or
					difficulty.
				</EmptyMessage>
			)}
		</SchoolShell>
	);
}
