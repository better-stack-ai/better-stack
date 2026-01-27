"use client";

import { memo, useMemo } from "react";
import * as Kanban from "@workspace/ui/components/kanban";
import { cn } from "@workspace/ui/lib/utils";
import { ColumnContent } from "./column-content";
import type { SerializedColumn, SerializedTask } from "../../../types";

interface KanbanBoardProps {
	columns: (SerializedColumn & { tasks: SerializedTask[] })[];
	kanbanState: Record<string, SerializedTask[]>;
	onKanbanChange: (newData: Record<string, SerializedTask[]>) => void;
	onAddTask: (columnId: string) => void;
	onEditTask: (columnId: string, taskId: string) => void;
	onEditColumn: (columnId: string) => void;
	onDeleteColumn: (columnId: string) => void;
}

function KanbanBoardComponent({
	columns,
	kanbanState,
	onKanbanChange,
	onAddTask,
	onEditTask,
	onEditColumn,
	onDeleteColumn,
}: KanbanBoardProps) {
	const orderedColumns = useMemo(() => {
		const columnMap = new Map(columns.map((c) => [c.id, c]));
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
	}, [columns, kanbanState]);

	const mdClass = useMemo(() => {
		const gridClassMap: Record<number, string> = {
			1: "md:grid-cols-1",
			2: "md:grid-cols-2",
			3: "md:grid-cols-3",
			4: "md:grid-cols-4",
			5: "md:grid-cols-5",
			6: "md:grid-cols-6",
		};
		return gridClassMap[orderedColumns.length] || "md:grid-cols-6";
	}, [orderedColumns.length]);

	return (
		<Kanban.Root
			orientation="horizontal"
			value={kanbanState}
			onValueChange={onKanbanChange}
			getItemValue={(item: SerializedTask) => item.id}
		>
			<Kanban.Board
				className={cn(
					"flex flex-col gap-4 md:auto-rows-fr md:grid-cols-1 md:grid min-h-[400px]",
					mdClass,
				)}
			>
				{orderedColumns.map((column) => (
					<ColumnContent
						key={column.id}
						column={column}
						onAddTask={() => onAddTask(column.id)}
						onEditTask={(taskId) => onEditTask(column.id, taskId)}
						onEditColumn={() => onEditColumn(column.id)}
						onDeleteColumn={() => onDeleteColumn(column.id)}
					/>
				))}
			</Kanban.Board>
			<Kanban.Overlay>
				<div className="size-full rounded-md bg-primary/10" />
			</Kanban.Overlay>
		</Kanban.Root>
	);
}

export const KanbanBoard = memo(KanbanBoardComponent);
