"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import { ArrowLeft, Plus, Settings, Trash2, Pencil } from "lucide-react";
import { Button } from "@workspace/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@workspace/ui/components/dialog";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog";
import {
	useBoard,
	useBoardMutations,
	useColumnMutations,
	useTaskMutations,
} from "../../hooks/kanban-hooks";
import { usePluginOverrides } from "@btst/stack/context";
import type { KanbanPluginOverrides } from "../../overrides";
import { KanbanBoard } from "../shared/kanban-board";
import { ColumnForm } from "../forms/column-form";
import { BoardForm } from "../forms/board-form";
import { TaskForm } from "../forms/task-form";
import { PageWrapper } from "../shared/page-wrapper";
import { EmptyState } from "../shared/empty-state";
import type { SerializedTask, SerializedColumn } from "../../../types";

interface BoardPageProps {
	boardId: string;
}

type ModalState =
	| { type: "none" }
	| { type: "addColumn" }
	| { type: "editColumn"; columnId: string }
	| { type: "deleteColumn"; columnId: string }
	| { type: "editBoard" }
	| { type: "deleteBoard" }
	| { type: "addTask"; columnId: string }
	| { type: "editTask"; columnId: string; taskId: string };

export function BoardPage({ boardId }: BoardPageProps) {
	const { data: board, error, refetch } = useBoard(boardId);
	const { Link: OverrideLink, navigate: overrideNavigate } =
		usePluginOverrides<KanbanPluginOverrides>("kanban");
	const navigate =
		overrideNavigate ||
		((path: string) => {
			window.location.href = path;
		});
	const Link = OverrideLink || "a";

	const { deleteBoard, isDeleting } = useBoardMutations();
	const { deleteColumn, reorderColumns } = useColumnMutations();
	const { deleteTask, moveTask, reorderTasks } = useTaskMutations();

	const [modalState, setModalState] = useState<ModalState>({ type: "none" });
	const [kanbanState, setKanbanState] = useState<
		Record<string, SerializedTask[]>
	>({});

	// Convert board data to kanban format
	const serverKanbanData = useMemo(() => {
		if (!board?.columns) return {};
		return board.columns.reduce(
			(acc, column) => {
				acc[column.id] = column.tasks || [];
				return acc;
			},
			{} as Record<string, SerializedTask[]>,
		);
	}, [board?.columns]);

	useEffect(() => {
		setKanbanState(serverKanbanData);
	}, [serverKanbanData]);

	const closeModal = useCallback(() => {
		setModalState({ type: "none" });
	}, []);

	const handleDeleteBoard = useCallback(async () => {
		await deleteBoard(boardId);
		navigate("/pages/kanban");
	}, [deleteBoard, boardId, navigate]);

	const handleKanbanChange = useCallback(
		async (newData: Record<string, SerializedTask[]>) => {
			setKanbanState(newData);

			if (!board) return;

			// Detect column reorder
			const oldKeys = Object.keys(kanbanState);
			const newKeys = Object.keys(newData);
			const isColumnMove =
				oldKeys.length === newKeys.length &&
				oldKeys.join("") !== newKeys.join("");

			if (isColumnMove) {
				// Column reorder - use atomic batch endpoint with transaction support
				await reorderColumns(board.id, newKeys);
			} else {
				// Task changes - detect cross-column moves and within-column reorders
				const crossColumnMoves: Array<{
					taskId: string;
					targetColumnId: string;
					targetOrder: number;
				}> = [];
				const columnsToReorder: Map<string, string[]> = new Map();
				const targetColumnsOfCrossMove = new Set<string>();

				for (const [columnId, tasks] of Object.entries(newData)) {
					const oldTasks = kanbanState[columnId] || [];
					let hasOrderChanges = false;

					for (let i = 0; i < tasks.length; i++) {
						const task = tasks[i];
						if (!task) continue;

						if (task.columnId !== columnId) {
							// Task moved from another column - needs cross-column move
							crossColumnMoves.push({
								taskId: task.id,
								targetColumnId: columnId,
								targetOrder: i,
							});
							targetColumnsOfCrossMove.add(columnId);
						} else if (task.order !== i) {
							// Task order changed within same column
							hasOrderChanges = true;
						}
					}

					// Check if tasks were removed from this column (moved elsewhere)
					const newTaskIds = new Set(tasks.map((t) => t.id));
					const tasksRemoved = oldTasks.some((t) => !newTaskIds.has(t.id));

					// If order changes within column (not a target of cross-column move),
					// use atomic reorder
					if (
						hasOrderChanges &&
						!targetColumnsOfCrossMove.has(columnId) &&
						!tasksRemoved
					) {
						columnsToReorder.set(
							columnId,
							tasks.map((t) => t.id),
						);
					}
				}

				// Handle cross-column moves first (these need individual moveTask calls)
				for (const move of crossColumnMoves) {
					await moveTask(move.taskId, move.targetColumnId, move.targetOrder);
				}

				// Then handle within-column reorders atomically
				for (const [columnId, taskIds] of columnsToReorder) {
					await reorderTasks(columnId, taskIds);
				}

				// Reorder target columns of cross-column moves to fix order collisions
				// The moveTask only sets the moved task's order, so other tasks need reordering
				for (const targetColumnId of targetColumnsOfCrossMove) {
					const tasks = newData[targetColumnId];
					if (tasks) {
						await reorderTasks(
							targetColumnId,
							tasks.map((t) => t.id),
						);
					}
				}
			}

			refetch();
		},
		[board, kanbanState, reorderColumns, moveTask, reorderTasks, refetch],
	);

	if (error) {
		throw error;
	}

	if (!board) {
		return (
			<EmptyState
				title="Board not found"
				description="The board you're looking for doesn't exist or you don't have access to it."
				action={
					<Button onClick={() => navigate("/pages/kanban")}>
						<ArrowLeft className="mr-2 h-4 w-4" />
						Back to Boards
					</Button>
				}
			/>
		);
	}

	const orderedColumns = useMemo(() => {
		if (!board.columns) return [];
		const columnMap = new Map(board.columns.map((c) => [c.id, c]));
		return Object.keys(kanbanState)
			.map((columnId) => {
				const column = columnMap.get(columnId);
				if (!column) return null;
				return {
					...column,
					tasks: kanbanState[columnId] || [],
				};
			})
			.filter(
				(c): c is SerializedColumn & { tasks: SerializedTask[] } => c !== null,
			);
	}, [board.columns, kanbanState]);

	return (
		<PageWrapper data-testid="board-page">
			<div className="flex items-center justify-between mb-8">
				<div className="flex items-center gap-4">
					<Link
						href="/pages/kanban"
						className="text-muted-foreground hover:text-foreground"
					>
						<ArrowLeft className="h-5 w-5" />
					</Link>
					<div>
						<h1 className="text-3xl font-bold" data-testid="page-header">
							{board.name}
						</h1>
						{board.description && (
							<p className="text-muted-foreground mt-1">{board.description}</p>
						)}
					</div>
				</div>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button variant="outline">
							<Settings className="mr-2 h-4 w-4" />
							Actions
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						<DropdownMenuItem
							onClick={() => setModalState({ type: "addColumn" })}
						>
							<Plus className="mr-2 h-4 w-4" />
							Add Column
						</DropdownMenuItem>
						<DropdownMenuItem
							onClick={() => setModalState({ type: "editBoard" })}
						>
							<Pencil className="mr-2 h-4 w-4" />
							Edit Board
						</DropdownMenuItem>
						<DropdownMenuSeparator />
						<DropdownMenuItem
							onClick={() => setModalState({ type: "deleteBoard" })}
							className="text-red-600 focus:text-red-600"
						>
							<Trash2 className="mr-2 h-4 w-4" />
							Delete Board
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>

			{orderedColumns.length > 0 ? (
				<KanbanBoard
					columns={orderedColumns}
					kanbanState={kanbanState}
					onKanbanChange={handleKanbanChange}
					onAddTask={(columnId) => setModalState({ type: "addTask", columnId })}
					onEditTask={(columnId, taskId) =>
						setModalState({ type: "editTask", columnId, taskId })
					}
					onEditColumn={(columnId) =>
						setModalState({ type: "editColumn", columnId })
					}
					onDeleteColumn={(columnId) =>
						setModalState({ type: "deleteColumn", columnId })
					}
				/>
			) : (
				<EmptyState
					title="No columns yet"
					description="Create your first column to start organizing tasks."
					action={
						<Button onClick={() => setModalState({ type: "addColumn" })}>
							<Plus className="mr-2 h-4 w-4" />
							Add Column
						</Button>
					}
				/>
			)}

			{/* Add Column Modal */}
			<Dialog
				open={modalState.type === "addColumn"}
				onOpenChange={(open: boolean) => !open && closeModal()}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Add Column</DialogTitle>
						<DialogDescription>
							Add a new column to this board.
						</DialogDescription>
					</DialogHeader>
					<ColumnForm
						boardId={boardId}
						onClose={closeModal}
						onSuccess={() => {
							closeModal();
							refetch();
						}}
					/>
				</DialogContent>
			</Dialog>

			{/* Edit Column Modal */}
			<Dialog
				open={modalState.type === "editColumn"}
				onOpenChange={(open: boolean) => !open && closeModal()}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Edit Column</DialogTitle>
						<DialogDescription>Update the column details.</DialogDescription>
					</DialogHeader>
					{modalState.type === "editColumn" && (
						<ColumnForm
							boardId={boardId}
							columnId={modalState.columnId}
							column={board.columns?.find((c) => c.id === modalState.columnId)}
							onClose={closeModal}
							onSuccess={() => {
								closeModal();
								refetch();
							}}
						/>
					)}
				</DialogContent>
			</Dialog>

			{/* Delete Column Modal */}
			<AlertDialog
				open={modalState.type === "deleteColumn"}
				onOpenChange={(open: boolean) => !open && closeModal()}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete Column</AlertDialogTitle>
						<AlertDialogDescription>
							Are you sure you want to delete this column? All tasks in this
							column will be permanently removed.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							onClick={async () => {
								if (modalState.type === "deleteColumn") {
									await deleteColumn(modalState.columnId);
									closeModal();
									refetch();
								}
							}}
							className="bg-red-600 hover:bg-red-700"
						>
							Delete
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			{/* Edit Board Modal */}
			<Dialog
				open={modalState.type === "editBoard"}
				onOpenChange={(open: boolean) => !open && closeModal()}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Edit Board</DialogTitle>
						<DialogDescription>Update board details.</DialogDescription>
					</DialogHeader>
					<BoardForm
						board={board}
						onClose={closeModal}
						onSuccess={() => {
							closeModal();
							refetch();
						}}
					/>
				</DialogContent>
			</Dialog>

			{/* Delete Board Modal */}
			<AlertDialog
				open={modalState.type === "deleteBoard"}
				onOpenChange={(open: boolean) => !open && closeModal()}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete Board</AlertDialogTitle>
						<AlertDialogDescription>
							Are you sure you want to delete this board? This action cannot be
							undone. All columns and tasks will be permanently removed.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							onClick={handleDeleteBoard}
							disabled={isDeleting}
							className="bg-red-600 hover:bg-red-700"
						>
							{isDeleting ? "Deleting..." : "Delete"}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			{/* Add Task Modal */}
			<Dialog
				open={modalState.type === "addTask"}
				onOpenChange={(open: boolean) => !open && closeModal()}
			>
				<DialogContent className="max-w-2xl">
					<DialogHeader>
						<DialogTitle>Add Task</DialogTitle>
						<DialogDescription>Create a new task.</DialogDescription>
					</DialogHeader>
					{modalState.type === "addTask" && (
						<TaskForm
							columnId={modalState.columnId}
							columns={board.columns || []}
							onClose={closeModal}
							onSuccess={() => {
								closeModal();
								refetch();
							}}
						/>
					)}
				</DialogContent>
			</Dialog>

			{/* Edit Task Modal */}
			<Dialog
				open={modalState.type === "editTask"}
				onOpenChange={(open: boolean) => !open && closeModal()}
			>
				<DialogContent className="max-w-2xl">
					<DialogHeader>
						<DialogTitle>Edit Task</DialogTitle>
						<DialogDescription>Update task details.</DialogDescription>
					</DialogHeader>
					{modalState.type === "editTask" && (
						<TaskForm
							columnId={modalState.columnId}
							taskId={modalState.taskId}
							task={board.columns
								?.find((c) => c.id === modalState.columnId)
								?.tasks?.find((t) => t.id === modalState.taskId)}
							columns={board.columns || []}
							onClose={closeModal}
							onSuccess={() => {
								closeModal();
								refetch();
							}}
							onDelete={async () => {
								await deleteTask(modalState.taskId);
								closeModal();
								refetch();
							}}
						/>
					)}
				</DialogContent>
			</Dialog>
		</PageWrapper>
	);
}
