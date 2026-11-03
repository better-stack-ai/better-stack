import type { DBAdapter } from "@btst/db";

type Adapter = Omit<DBAdapter, "transaction">;

/** Read complete collections despite adapter defaults or smaller maximum pages. */
export async function findAllSchoolRecords<T extends Record<string, unknown>>(
	adapter: Adapter,
	options: Pick<Parameters<Adapter["findMany"]>[0], "model" | "where">,
): Promise<T[]> {
	const records: T[] = [];
	for (let offset = 0; ; ) {
		const page = await adapter.findMany<T>({
			...options,
			limit: 100,
			offset,
			sortBy: { field: "id", direction: "asc" },
		});
		if (page.length === 0) return records;
		records.push(...page);
		offset += page.length;
	}
}
