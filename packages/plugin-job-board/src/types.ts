import type { z } from "zod";
import type { jobSchema } from "./schemas";

/** Validated fields managed through the CMS job-posting content type. */
export type JobData = z.output<typeof jobSchema>;
/** Employment terms supported by a job posting. */
export type EmploymentType = JobData["employmentType"];
/** Public job projection; active application forms are resolved only on detail reads. */
export type Job = JobData & {
	id: string;
	slug: string;
	createdAt: string;
	updatedAt: string;
	applicationFormSlug?: string;
};

/** Public filters. Closing dates remain open through the specified UTC day. */
export interface JobsFilters {
	department?: string;
	location?: string;
	employmentType?: EmploymentType;
	remote?: boolean;
	search?: string;
	limit?: number;
	offset?: number;
}

/** Available filter terms derived exclusively from published, unexpired jobs. */
export type JobTaxonomies = {
	departments: string[];
	locations: string[];
	employmentTypes: EmploymentType[];
};

/** A filtered page and the full public taxonomy catalog. */
export type JobsPage = {
	items: Job[];
	total: number;
	limit: number;
	offset: number;
	taxonomies: JobTaxonomies;
};

/** Existing CMS record fields needed for safe job projection and optimistic archival. */
export interface JobContentItem {
	id: string;
	slug: string;
	data: string;
	parsedData: Record<string, unknown>;
	createdAt: string;
	updatedAt: string;
}
