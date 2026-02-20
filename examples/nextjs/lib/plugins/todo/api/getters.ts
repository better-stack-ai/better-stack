import type { Adapter } from "@btst/stack/plugins/api"
import type { Todo } from "../types"

/**
 * Retrieve all todos, sorted newest-first.
 * Pure DB function — no HTTP context. Safe for server-side and SSG use.
 */
export async function listTodos(adapter: Adapter): Promise<Todo[]> {
    return adapter.findMany<Todo>({
        model: "todo",
        sortBy: { field: "createdAt", direction: "desc" },
    }) as Promise<Todo[]>
}

/**
 * Retrieve a single todo by ID.
 * Returns null if the todo does not exist.
 */
export async function getTodoById(
    adapter: Adapter,
    id: string,
): Promise<Todo | null> {
    return adapter.findOne<Todo>({
        model: "todo",
        where: [{ field: "id", value: id, operator: "eq" }],
    })
}
