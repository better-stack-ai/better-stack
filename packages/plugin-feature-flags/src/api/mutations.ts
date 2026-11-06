import { OperationHttpError } from "@btst/stack/plugins/api";
import { getFlagByKey } from "./getters";
import type { DBAdapter as Adapter } from "@btst/db";
import type { CreateFlagInput, UpdateFlagInput } from "../schemas";
import type { FlagRecord } from "../types";

const createQueues = new WeakMap<Adapter, Promise<unknown>>();

/** Lower-level write; callers own validation, authorization, cache invalidation and lifecycle. */
export async function createFlag(adapter: Adapter, data: CreateFlagInput) {
	const previous = createQueues.get(adapter) ?? Promise.resolve();
	const writing = previous
		.catch(() => {})
		.then(async () => {
			if (await getFlagByKey(adapter, data.key))
				throw new OperationHttpError(
					409,
					"This flag key already exists, including archived flags",
					"FLAG_KEY_EXISTS",
				);
			try {
				return await adapter.create<FlagRecord>({
					model: "flag",
					data: {
						...data,
						description: data.description ?? null,
						type: data.type ?? "boolean",
						enabled: data.enabled ?? false,
						rolloutPct: data.rolloutPct ?? null,
						segments: JSON.stringify(data.segments ?? []),
						variants: JSON.stringify(data.variants ?? []),
						tags: JSON.stringify(data.tags ?? []),
						archivedAt: null,
						createdAt: new Date(),
						updatedAt: new Date(),
					},
				});
			} catch (error) {
				if (await getFlagByKey(adapter, data.key))
					throw new OperationHttpError(
						409,
						"This flag key already exists, including archived flags",
						"FLAG_KEY_EXISTS",
					);
				throw error;
			}
		});
	createQueues.set(adapter, writing);
	try {
		return await writing;
	} finally {
		if (createQueues.get(adapter) === writing) createQueues.delete(adapter);
	}
}

/** Compare-and-set a validated definition. A concurrent edit returns null. */
export async function updateFlag(
	adapter: Adapter,
	current: FlagRecord,
	data: UpdateFlagInput,
	archive = false,
) {
	return adapter.update<FlagRecord>({
		model: "flag",
		where: [
			{ field: "id", value: current.id, operator: "eq" },
			{ field: "updatedAt", value: current.updatedAt, operator: "eq" },
		],
		update: {
			...data,
			...(data.segments ? { segments: JSON.stringify(data.segments) } : {}),
			...(data.variants ? { variants: JSON.stringify(data.variants) } : {}),
			...(data.tags ? { tags: JSON.stringify(data.tags) } : {}),
			...(archive ? { archivedAt: new Date(), enabled: false } : {}),
			updatedAt: new Date(
				Math.max(Date.now(), new Date(current.updatedAt).getTime() + 1),
			),
		},
	});
}
