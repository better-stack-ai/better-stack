import { jobSchema } from "./schemas";
import type {
	EmploymentType,
	Job,
	JobContentItem,
	JobData,
	JobsFilters,
	JobsPage,
	JobTaxonomies,
} from "./types";

/** Keep department labels in one URL segment when a host router decodes paths early. */
export function encodeJobDepartment(department: string): string {
	const encoded =
		department === "." || department === ".."
			? department.replaceAll(".", "%2E")
			: encodeURIComponent(department);
	return encoded.replaceAll("~", "%7E").replaceAll("%", "~");
}

/** Malformed department identifiers have no matching public department. */
export function decodeJobDepartment(identifier: string): string | undefined {
	if (identifier.includes("%")) return undefined;
	try {
		return decodeURIComponent(identifier.replaceAll("~", "%"));
	} catch {
		return undefined;
	}
}

/** A closing date includes its full UTC calendar day. */
export function isJobOpen(
	job: Pick<JobData, "status" | "closingDate">,
	now = new Date(),
): boolean {
	return (
		job.status === "published" &&
		(!job.closingDate || job.closingDate >= now.toISOString().slice(0, 10))
	);
}

/** Parse only declared job fields; unpublished, expired and invalid records stay private. */
export function toPublicJobs(
	items: readonly JobContentItem[],
	now = new Date(),
): Job[] {
	const jobs: Job[] = [];
	for (const item of items) {
		const parsed = jobSchema.safeParse(item.parsedData);
		if (!parsed.success || !isJobOpen(parsed.data, now)) continue;
		jobs.push({
			...parsed.data,
			id: item.id,
			slug: item.slug,
			createdAt: item.createdAt,
			updatedAt: item.updatedAt,
		});
	}
	return jobs;
}

/** Filter terms never reveal unpublished or expired postings. */
export function getJobTaxonomies(jobs: readonly Job[]): JobTaxonomies {
	const terms = (values: string[]) =>
		[...new Set(values)].sort((a, b) => a.localeCompare(b));
	return {
		departments: terms(jobs.map((job) => job.department)),
		locations: terms(jobs.map((job) => job.location)),
		employmentTypes: terms(
			jobs.map((job) => job.employmentType),
		) as EmploymentType[],
	};
}

/** Apply domain filters before pagination so totals and pages describe visible jobs. */
export function paginateJobs(
	jobs: readonly Job[],
	filters: JobsFilters = {},
): JobsPage {
	const text = (value?: string) => value?.trim().toLowerCase();
	const department = text(filters.department);
	const location = text(filters.location);
	const search = text(filters.search);
	const filtered = jobs.filter(
		(job) =>
			(!department || job.department.toLowerCase() === department) &&
			(!location || job.location.toLowerCase() === location) &&
			(!filters.employmentType ||
				job.employmentType === filters.employmentType) &&
			(filters.remote === undefined || job.remote === filters.remote) &&
			(!search ||
				[job.title, job.department, job.location, job.description].some(
					(value) => value.toLowerCase().includes(search),
				)),
	);
	const limit = filters.limit ?? 12;
	const offset = filters.offset ?? 0;
	return {
		items: filtered.slice(offset, offset + limit),
		total: filtered.length,
		limit,
		offset,
		taxonomies: getJobTaxonomies(jobs),
	};
}
