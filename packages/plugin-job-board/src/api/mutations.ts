import type { DBAdapter as Adapter } from "@btst/db";
import { jobSchema } from "../schemas";
import type { JobContentItem } from "../types";

/**
 * Archive only expired published postings. Callers own authorization and lifecycle;
 * the original JSON guard prevents overwriting a concurrent CMS edit or republish.
 */
export async function archiveExpiredJobs(
	adapter: Adapter,
	items: readonly JobContentItem[],
	now = new Date(),
): Promise<number> {
	const today = now.toISOString().slice(0, 10);
	let archived = 0;
	for (const item of items) {
		const parsed = jobSchema.safeParse(item.parsedData);
		if (
			!parsed.success ||
			parsed.data.status !== "published" ||
			!parsed.data.closingDate ||
			parsed.data.closingDate >= today
		)
			continue;
		archived += await adapter.updateMany({
			model: "contentItem",
			where: [
				{ field: "id", value: item.id, operator: "eq" },
				{ field: "data", value: item.data, operator: "eq" },
			],
			update: {
				data: JSON.stringify({ ...item.parsedData, status: "archived" }),
				updatedAt: now,
			},
		});
	}
	return archived;
}
