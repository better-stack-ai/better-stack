import { useCreateTodo, useDeleteTodo, useTodos, useToggleTodo } from "./hooks";
import type { TodosPluginOverrides } from "./overrides";
import type { Todo } from "../types";
import { useBasePath, usePluginOverrides } from "@btst/stack/context";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "~/components/ui/empty";
import { cn } from "~/lib/utils";
import { ListIcon, Loader2Icon, PlusCircleIcon, TrashIcon } from "lucide-react";
import { Field, FieldGroup, FieldLabel } from "~/components/ui/field";
import { toast } from "sonner";
import { Input } from "~/components/ui/input";
import { Item } from "~/components/ui/item";
import { Label } from "~/components/ui/label";
import { Skeleton } from "~/components/ui/skeleton";
import { Suspense } from "react";

export function TodosListPage() {
	return (
		<div
			className="mx-auto max-w-2xl p-6 flex flex-col gap-6 items-center justify-center"
			data-test-id="todos-list-page"
		>
			<h1 className="mb-6 font-bold text-3xl" data-test-id="todos-list-title">
				Todos
			</h1>
			<Suspense fallback={<TodosListPageSkeleton />}>
				<TodosList />
			</Suspense>
		</div>
	);
}

function TodosList() {
	const { data: todos } = useTodos();
	const toggleTodoMutation = useToggleTodo({
		onSuccess: () => {
			toast.success("Todo has been toggled");
		},
		onError: () => {
			toast.error("Error toggling todo");
		},
	});
	const deleteTodoMutation = useDeleteTodo({
		onSuccess: () => {
			toast.success("Todo has been deleted");
		},
		onError: () => {
			toast.error("Error deleting todo");
		},
	});
	const { Link } = usePluginOverrides<TodosPluginOverrides>("todos");
	const basePath = useBasePath();

	return (
		<>
			<div className="space-y-2 w-full" data-test-id="todos-list">
				{todos?.map((todo: Todo) => (
					<Item
						key={todo.id}
						className="flex items-center gap-3 border border-border rounded-md p-3"
						data-test-id={`todo-item-${todo.id}`}
					>
						<Checkbox
							id={todo.id}
							value={todo.id}
							checked={todo.completed}
							data-test-id={`todo-checkbox-${todo.id}`}
							onCheckedChange={() => {
								toggleTodoMutation.mutate({
									id: todo.id,
									completed: !todo.completed,
								});
							}}
						/>
						<Label
							htmlFor={todo.id}
							className={cn(
								"flex-1",
								todo.completed && "text-muted-foreground line-through",
							)}
							data-test-id={`todo-title-${todo.id}`}
						>
							{todo.title}
						</Label>
						<Button
							variant="destructive"
							className="hover:cursor-pointer"
							data-test-id={`todo-delete-${todo.id}`}
							onClick={() => deleteTodoMutation.mutate(todo.id)}
						>
							{deleteTodoMutation.isPending ? <Loader2Icon /> : <TrashIcon />}
							Delete
						</Button>
					</Item>
				))}

				{todos?.length === 0 && (
					<Empty data-test-id="todos-empty">
						<EmptyHeader>
							<EmptyMedia variant="icon">
								<ListIcon />
							</EmptyMedia>
							<EmptyTitle>No Todos</EmptyTitle>
							<EmptyDescription>No todos found</EmptyDescription>
						</EmptyHeader>
						<EmptyContent>
							<Button asChild>
								<Link
									href={`${basePath}/todos/add`}
									data-test-id="todos-add-link"
								>
									Add a todo
								</Link>
							</Button>
						</EmptyContent>
					</Empty>
				)}
			</div>

			{todos && todos.length > 0 && (
				<Button asChild>
					<Link href={`${basePath}/todos/add`} data-test-id="todos-add-link">
						<PlusCircleIcon />
						Add Todo
					</Link>
				</Button>
			)}
		</>
	);
}

export function AddTodoPage() {
	const createTodoMutation = useCreateTodo();
	const { Link, navigate } = usePluginOverrides<TodosPluginOverrides>("todos");
	const basePath = useBasePath();

	const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		const form = e.currentTarget;
		const formData = new FormData(form);
		const title = formData.get("title") as string;

		try {
			await createTodoMutation.mutateAsync({ title });
			toast.success("Todo has been added");
			navigate?.(basePath + "/todos");
		} catch (error) {
			toast.error("Error adding todo");
			console.error(error);
		}

		form.reset();
	};

	return (
		<div className="mx-auto max-w-2xl p-6" data-test-id="add-todo-page">
			<h1 className="mb-6 font-bold text-3xl" data-test-id="add-todo-title">
				Add Todo
			</h1>

			<form
				onSubmit={handleSubmit}
				className="space-y-4"
				data-test-id="add-todo-form"
			>
				<FieldGroup>
					<Field>
						<FieldLabel htmlFor="title">Title</FieldLabel>
						<Input
							id="title"
							type="text"
							name="title"
							placeholder="Buy groceries"
							required
							data-test-id="add-todo-title-input"
						/>
					</Field>
				</FieldGroup>

				<div className="flex gap-2">
					<Button
						type="submit"
						className="hover:cursor-pointer"
						disabled={createTodoMutation.isPending}
						data-test-id="add-todo-submit"
					>
						{createTodoMutation.isPending ? "Saving..." : "Save"}
					</Button>

					<Button variant="outline" asChild>
						<Link href={`${basePath}/todos`} data-test-id="add-todo-cancel">
							Cancel
						</Link>
					</Button>
				</div>
			</form>
		</div>
	);
}

function TodosListPageSkeleton() {
	return (
		<div className="flex flex-col gap-2 w-full">
			{Array.from({ length: 3 }).map((_, index) => (
				<Item
					key={`todo-skeleton-${index}`}
					className="flex items-center gap-3 border border-border rounded-md p-3 w-full"
				>
					<Skeleton className="h-5 w-5 rounded" />
					<Skeleton className="h-4 flex-1" />
					<Skeleton className="h-8 w-24" />
				</Item>
			))}
		</div>
	);
}
