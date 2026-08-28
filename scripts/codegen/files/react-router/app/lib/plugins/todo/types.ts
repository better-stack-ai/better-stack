export type Todo = {
	id: string;
	title: string;
	completed: boolean;
	createdAt: string;
};

export type StoredTodo = Omit<Todo, "createdAt"> & { createdAt: Date };

export function serializeTodo(todo: StoredTodo): Todo {
	return { ...todo, createdAt: todo.createdAt.toISOString() };
}
