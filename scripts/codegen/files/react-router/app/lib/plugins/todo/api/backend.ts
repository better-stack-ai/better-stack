import {
	createEndpoint,
	defineBackendPlugin,
	defineOperation,
	OperationHttpError,
} from "@btst/stack/plugins/api";
import { z } from "zod";
import { todoPermissions } from "../permissions";
import { todosSchema as dbSchema } from "../schema";
import { serializeTodo, type StoredTodo } from "../types";

const createTodoSchema = z.object({
	title: z.string().min(1, "Title is required"),
	completed: z.boolean().optional().default(false),
});

const updateTodoSchema = z.object({
	title: z.string().min(1).optional(),
	completed: z.boolean().optional(),
});

const todoIdSchema = z.object({ id: z.string().min(1) });
const updateTodoOperationSchema = todoIdSchema.extend({
	data: updateTodoSchema,
});

/** Generated Todo backend using the same operation for every server transport. */
export const todosBackendPlugin = () =>
	defineBackendPlugin({
		id: "todos",
		dbPlugin: dbSchema,
		operations: (adapter) => ({
			listTodos: defineOperation({
				input: z.object({}),
				permission: todoPermissions.todo.read,
				facts: () => undefined,
				execute: async () =>
					(
						await adapter.findMany<StoredTodo>({
							model: "todo",
							sortBy: { field: "createdAt", direction: "desc" },
						})
					).map(serializeTodo),
			}),
			createTodo: defineOperation({
				input: createTodoSchema,
				permission: todoPermissions.todo.create,
				facts: () => undefined,
				execute: async ({ input }) =>
					serializeTodo(
						await adapter.create<StoredTodo>({
							model: "todo",
							data: {
								title: input.title,
								completed: input.completed,
								createdAt: new Date(),
							},
						}),
					),
			}),
			updateTodo: defineOperation({
				input: updateTodoOperationSchema,
				permission: todoPermissions.todo.update,
				facts: ({ input }) => ({ id: input.id }),
				execute: async ({ input }) => {
					const updated = await adapter.update<StoredTodo>({
						model: "todo",
						where: [{ field: "id", value: input.id }],
						update: input.data,
					});
					if (!updated) {
						throw new OperationHttpError(
							404,
							"Todo not found",
							"TODO_NOT_FOUND",
						);
					}
					return serializeTodo(updated);
				},
			}),
			deleteTodo: defineOperation({
				input: todoIdSchema,
				permission: todoPermissions.todo.delete,
				facts: ({ input }) => ({ id: input.id }),
				execute: async ({ input }) => {
					await adapter.delete({
						model: "todo",
						where: [{ field: "id", value: input.id }],
					});
					return { success: true } as const;
				},
			}),
		}),
		routes: (_adapter, _context, operations) => ({
			listTodos: createEndpoint(
				"/todos",
				{ method: "GET", requireRequest: true },
				operations.listTodos.route(() => ({})),
			),
			createTodo: createEndpoint(
				"/todos",
				{ method: "POST", body: createTodoSchema, requireRequest: true },
				operations.createTodo.route((ctx) => ctx.body),
			),
			updateTodo: createEndpoint(
				"/todos/:id",
				{ method: "PUT", body: updateTodoSchema, requireRequest: true },
				operations.updateTodo.route((ctx) => ({
					id: ctx.params.id,
					data: ctx.body,
				})),
			),
			deleteTodo: createEndpoint(
				"/todos/:id",
				{ method: "DELETE", requireRequest: true },
				operations.deleteTodo.route((ctx) => ({ id: ctx.params.id })),
			),
		}),
	});

export type TodosApiRouter = ReturnType<
	ReturnType<typeof todosBackendPlugin>["routes"]
>;
