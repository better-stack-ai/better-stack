import { describe, expect, it } from "vitest";
import {
	createJobPostingStructuredData,
	serializeJobPostingStructuredData,
} from "../structured-data";
import type { Job } from "../types";

describe("JobPosting structured data", () => {
	it("preserves job content while escaping HTML script boundaries and Unicode separators", () => {
		const job: Job = {
			id: "job-1",
			slug: "frontend-engineer",
			title: "Frontend engineer",
			department: "Engineering",
			location: "Toronto",
			employmentType: "full-time",
			remote: true,
			description:
				"</script><script>alert('job')</script>\u2028line\u2029paragraph",
			requirements: "TypeScript",
			status: "published",
			closingDate: "2030-01-07",
			createdAt: "2030-01-01T00:00:00Z",
			updatedAt: "2030-01-01T00:00:00Z",
		};
		const data = createJobPostingStructuredData(job, {
			organization: { name: "Example employer" },
			url: "https://example.com/jobs/frontend-engineer",
		});
		const json = serializeJobPostingStructuredData(data);
		expect(json).not.toContain("<");
		expect(json).not.toContain("\u2028");
		expect(json).not.toContain("\u2029");
		expect(JSON.parse(json)).toEqual(data);
		expect(data).toMatchObject({
			"@type": "JobPosting",
			employmentType: "FULL_TIME",
			validThrough: "2030-01-07T23:59:59Z",
			hiringOrganization: { name: "Example employer" },
		});
	});
});
