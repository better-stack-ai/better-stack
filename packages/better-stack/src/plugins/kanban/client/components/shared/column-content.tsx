"use client";

import { memo } from "react";
import { GripVertical, MoreVertical, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@workspace/ui/components/button";
import { Badge } from "@workspace/ui/components/badge";
import * as Kanban from "@workspace/ui/components/kanban";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu";
import { TaskCard } from "./task-card";
import type { SerializedColumn, SerializedTask } from "../../../types";

interface ColumnContentProps {
	column: SerializedColumn & { tasks: SerializedTask[] };
	onAddTask: () => void;
	onEditTask: (taskId: string) => void;
	onEditColumn: () => void;
	onDeleteColumn: () => void;
}

function ColumnContentComponent({
	column,
	onAddTask,
	onEditTask,
	onEditColumn,
	onDeleteColumn,
}: ColumnContentProps) {
	const hasTasks = column.tasks && column.tasks.length > 0;

	return (
		<Kanban.Column key={column.id} value={column.id}>
			<div className="flex items-center">
				<Kanban.ColumnHandle asChild>
					<Button variant="ghost" size="icon">
						<GripVertical className="h-4 w-4" />
					</Button>
				</Kanban.ColumnHandle>
				<div className="flex items-center gap-2 flex-1">
					<span className="font-bold text-lg line-clamp-1 flex-1 text-left">
						{column.title}
					</span>
					<Badge variant="outline" className="pointer-events-none rounded-sm">
						{column.tasks?.length || 0}
					</Badge>
				</div>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button variant="ghost" size="icon">
							<MoreVertical className="h-4 w-4" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						<DropdownMenuItem onClick={onEditColumn}>
							<Pencil className="mr-2 h-4 w-4" />
							Edit Column
						</DropdownMenuItem>
						<DropdownMenuItem onClick={onAddTask}>
							<Plus className="mr-2 h-4 w-4" />
							Add Task
						</DropdownMenuItem>
						<DropdownMenuSeparator />
						<DropdownMenuItem
							onClick={onDeleteColumn}
							className="text-red-600 focus:text-red-600"
						>
							<Trash2 className="mr-2 h-4 w-4" />
							Delete Column
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
			<div className="p-0.5 space-y-2">
				{hasTasks ? (
					column.tasks.map((task) => (
						<TaskCard
							key={task.id}
							task={task}
							onClick={() => onEditTask(task.id)}
						/>
					))
				) : (
					<div className="flex flex-col items-center justify-center py-1 md:py-8 text-center">
						<div className="rounded-full bg-muted p-4 mb-3 hidden md:block">
							<Plus className="h-5 w-5 text-muted-foreground" />
						</div>
						<div className="space-y-1 mb-2 md:space-y-2 md:mb-4">
							<p className="text-sm text-muted-foreground">No tasks yet</p>
							<p className="text-xs text-muted-foreground">
								Add a task to get started
							</p>
						</div>
						<Button onClick={onAddTask} size="sm">
							<Plus className="mr-2 h-4 w-4" />
							Add Task
						</Button>
					</div>
				)}
			</div>
		</Kanban.Column>
	);
}

export const ColumnContent = memo(ColumnContentComponent);
