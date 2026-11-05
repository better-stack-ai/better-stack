import type { DBAdapter as Adapter } from "@btst/db";
import { getAllContentItems } from "@btst/plugin-cms/api";
import { getFormById } from "@btst/plugin-form-builder/api";
import { JOB_BOARD_TYPE_SLUG } from "../schemas";
import type { Job, JobContentItem } from "../types";
import { toPublicJobs } from "../utils";

/** Lower-level CMS read, including drafts. Callers own authorization and publication filtering. */
export async function getStoredJobItems(
	adapter: Adapter,
): Promise<JobContentItem[]> {
	const items: JobContentItem[] = [];
	for (let offset = 0; ; offset += 500) {
		const page = await getAllContentItems(adapter, JOB_BOARD_TYPE_SLUG, {
			limit: 500,
			offset,
		});
		items.push(...page.items);
		if (page.items.length < 500) return items;
	}
}

/** Read-only published, unexpired jobs for direct server use; does not run lifecycle or archive writes. */
export async function getAllJobs(
	adapter: Adapter,
	now = new Date(),
): Promise<Job[]> {
	return toPublicJobs(await getStoredJobItems(adapter), now);
}

/** Resolve a public job's associated active form without publishing form administration data. */
export async function resolveJobApplication(
	adapter: Adapter,
	job: Job,
): Promise<Job> {
	if (!job.applicationFormId) return job;
	const form = await getFormById(adapter, job.applicationFormId);
	return form?.status === "active"
		? { ...job, applicationFormSlug: form.slug }
		: job;
}
