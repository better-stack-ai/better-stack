import { createMemoryAdapter as createRawMemoryAdapter } from "@btst/adapter-memory";
import type { Adapter } from "@btst/stack/plugins/api";
import { AsyncLocalStorage } from "node:async_hooks";

function serializeAdapter(adapter: Adapter): Adapter {
	let tail = Promise.resolve();
	const lockContext = new AsyncLocalStorage<{ active: boolean }>();
	const withLock = async <T>(run: () => Promise<T>): Promise<T> => {
		// Existing plugin transactions sometimes call the outer adapter. Re-enter
		// only from that transaction's async context; concurrent callers still queue.
		if (lockContext.getStore()?.active) return run();

		let release = () => {};
		const previous = tail;
		tail = new Promise<void>((resolve) => {
			release = resolve;
		});
		await previous;
		try {
			return await run();
		} finally {
			release();
		}
	};

	return {
		...adapter,
		id: "serialized-memory",
		create: ((input) =>
			withLock(() => adapter.create(input))) as Adapter["create"],
		findOne: ((input) =>
			withLock(() => adapter.findOne(input))) as Adapter["findOne"],
		findMany: ((input) =>
			withLock(() => adapter.findMany(input))) as Adapter["findMany"],
		count: (input) => withLock(() => adapter.count(input)),
		update: ((input) =>
			withLock(() => adapter.update(input))) as Adapter["update"],
		updateMany: (input) => withLock(() => adapter.updateMany(input)),
		delete: ((input) =>
			withLock(() => adapter.delete(input))) as Adapter["delete"],
		deleteMany: (input) => withLock(() => adapter.deleteMany(input)),
		consumeOne: ((input) =>
			withLock(() => adapter.consumeOne(input))) as Adapter["consumeOne"],
		transaction: ((callback) =>
			withLock(() =>
				adapter.transaction(async (tx) => {
					const context = { active: true };
					try {
						return await lockContext.run(context, () => callback(tx));
					} finally {
						context.active = false;
					}
				}),
			)) as Adapter["transaction"],
	};
}

/** Memory adapter with serialized calls for deterministic full-stack E2E use. */
export function createMemoryAdapter(
	...args: Parameters<typeof createRawMemoryAdapter>
) {
	const createAdapter = createRawMemoryAdapter(...args);
	return (...options: Parameters<typeof createAdapter>) =>
		serializeAdapter(createAdapter(...options));
}
