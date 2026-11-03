import type { DBAdapter as Adapter } from "@btst/db";
import type { FlagRecord } from "../types";
import { serializeFlag } from "./serializers";

/** Read every definition. Callers own authorization. */
export async function listFlags(adapter: Adapter, includeArchived = false) {
	const rows: FlagRecord[] = [];
	for (let offset = 0; ; offset += 1000) {
		const batch = await adapter.findMany<FlagRecord>({
			model: "flag",
			limit: 1000,
			offset,
			sortBy: { field: "createdAt", direction: "desc" },
		});
		rows.push(...batch);
		if (batch.length < 1000) break;
	}
	return rows
		.filter((flag) => includeArchived || !flag.archivedAt)
		.map(serializeFlag);
}

/** Read a definition, including archived flags. Callers own authorization. */
export async function getFlagByKey(adapter: Adapter, key: string) {
	return adapter.findOne<FlagRecord>({
		model: "flag",
		where: [{ field: "key", value: key, operator: "eq" }],
	});
}
