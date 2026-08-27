import { createMemoryAdapter as createRawMemoryAdapter } from "@btst/adapter-memory";
import type { Adapter } from "@btst/stack/plugins/api";

function serializeAdapter(adapter: Adapter): Adapter {
	let tail = Promise.resolve();
	const withLock = async <T>(run: () => Promise<T>): Promise<T> => {
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
			withLock(() => adapter.transaction(callback))) as Adapter["transaction"],
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
