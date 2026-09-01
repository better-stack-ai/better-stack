import type { Adapter } from "@btst/stack/plugins/api";
import type { StoredTodo } from "../types";

/**
 * Retrieve all todos, sorted newest-first.
 * Pure DB function — no HTTP context. Safe for server-side and SSG use.
 */
export async function listTodos(adapter: Adapter): Promise<StoredTodo[]> {
	return adapter.findMany<StoredTodo>({
		model: "todo",
		sortBy: { field: "createdAt", direction: "desc" },
	}) as Promise<StoredTodo[]>;
}

/**
 * Retrieve a single todo by ID.
 * Returns null if the todo does not exist.
 */
export async function getTodoById(
	adapter: Adapter,
	id: string,
): Promise<StoredTodo | null> {
	return adapter.findOne<StoredTodo>({
		model: "todo",
		where: [{ field: "id", value: id, operator: "eq" }],
	});
}
