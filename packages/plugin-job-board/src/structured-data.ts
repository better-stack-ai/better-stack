import type { Job } from "./types";
import type { JobBoardOrganization } from "./client/types";

const employmentTypes = {
	"full-time": "FULL_TIME",
	"part-time": "PART_TIME",
	contract: "CONTRACTOR",
	internship: "INTERN",
} as const;

/** Build JobPosting data using only the job and the consumer's actual employer information. */
export function createJobPostingStructuredData(
	job: Job,
	options: { url?: string; organization?: JobBoardOrganization } = {},
) {
	return {
		"@context": "https://schema.org",
		"@type": "JobPosting",
		title: job.title,
		description: job.description,
		datePosted: job.createdAt,
		employmentType: employmentTypes[job.employmentType],
		identifier: { "@type": "PropertyValue", value: job.id },
		...(job.location
			? { jobLocation: { "@type": "Place", address: job.location } }
			: {}),
		...(job.remote ? { jobLocationType: "TELECOMMUTE" } : {}),
		...(job.closingDate
			? { validThrough: `${job.closingDate}T23:59:59Z` }
			: {}),
		...(options.url ? { url: options.url } : {}),
		...(options.organization
			? {
					hiringOrganization: {
						"@type": "Organization",
						...options.organization,
					},
				}
			: {}),
	};
}

/** Escape script-significant characters before inserting JSON-LD into an HTML script element. */
export function serializeJobPostingStructuredData(
	data: ReturnType<typeof createJobPostingStructuredData>,
) {
	return JSON.stringify(data)
		.replace(/</g, "\\u003c")
		.replace(/\u2028/g, "\\u2028")
		.replace(/\u2029/g, "\\u2029");
}
