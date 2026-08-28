"use client";

import { memo } from "react";
import { GripVertical, MoreVertical, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@workspace/ui/components/button";
import { Badge } from "@workspace/ui/components/badge";
import * as Kanban from "@workspace/ui/components/kanban";
import {
	PermissionAccess,
	usePluginOverrides,
	useTranslate,
} from "@btst/stack/context";
import type { KanbanPluginOverrides } from "../../overrides";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu";
import { TaskCard } from "./task-card";
import type { SerializedColumn, SerializedTask } from "../../../types";
import { kanbanPermissions } from "../../../permissions";
import { PermissionAccessAny } from "./permission-access-any";

interface ColumnContentProps {
	boardId: string;
	ownerId?: string;
	organizationId?: string;
	column: SerializedColumn & { tasks: SerializedTask[] };
	onAddTask: () => void;
	onEditTask: (taskId: string) => void;
	onEditColumn: () => void;
	onDeleteColumn: () => void;
}

function ColumnContentComponent({
	boardId,
	ownerId,
	organizationId,
	column,
	onAddTask,
	onEditTask,
	onEditColumn,
	onDeleteColumn,
}: ColumnContentProps) {
	const t = useTranslate();
	const { localization } = usePluginOverrides<KanbanPluginOverrides>("kanban");
	const hasTasks = column.tasks && column.tasks.length > 0;
	const boardFacts = {
		boardId,
		...(ownerId ? { ownerId } : {}),
		...(organizationId ? { organizationId } : {}),
	};
	const columnFacts = { ...boardFacts, columnId: column.id };
	const legacyBoardFacts = {
		boardId,
		...(ownerId ? { ownerId } : {}),
		...(organizationId ? { organizationId } : {}),
	};
	const legacyColumnFacts = { ...legacyBoardFacts, id: column.id };
	const columnActionChecks = [
		{
			permission: kanbanPermissions.column.update(columnFacts),
		},
		{
			permission: kanbanPermissions.task.create(columnFacts),
		},
		{
			permission: kanbanPermissions.column.delete(columnFacts),
		},
	] as const;

	return (
		<Kanban.Column key={column.id} value={column.id}>
			<div className="flex items-center">
				<PermissionAccess
					permission={kanbanPermissions.column.reorder(boardFacts)}
				>
					<Kanban.ColumnHandle asChild>
						<Button variant="ghost" size="icon">
							<GripVertical className="h-4 w-4" />
						</Button>
					</Kanban.ColumnHandle>
				</PermissionAccess>
				<div className="flex items-center gap-2 flex-1">
					<span className="font-bold text-lg line-clamp-1 flex-1 text-left">
						{column.title}
					</span>
					<Badge variant="outline" className="pointer-events-none rounded-sm">
						{column.tasks?.length || 0}
					</Badge>
				</div>
				<PermissionAccessAny checks={columnActionChecks}>
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button variant="ghost" size="icon">
								<MoreVertical className="h-4 w-4" />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							<PermissionAccess
								permission={kanbanPermissions.column.update(columnFacts)}
							>
								<DropdownMenuItem onClick={onEditColumn}>
									<Pencil className="mr-2 h-4 w-4" />
									{localization?.editColumn ??
										t("kanban.list.editColumn", "Edit Column")}
								</DropdownMenuItem>
							</PermissionAccess>
							<PermissionAccess
								permission={kanbanPermissions.task.create(columnFacts)}
							>
								<DropdownMenuItem onClick={onAddTask}>
									<Plus className="mr-2 h-4 w-4" />
									{localization?.addTask ??
										t("kanban.list.addTask", "Add Task")}
								</DropdownMenuItem>
							</PermissionAccess>
							<PermissionAccess
								permission={kanbanPermissions.column.delete(columnFacts)}
							>
								<DropdownMenuSeparator />
								<DropdownMenuItem
									onClick={onDeleteColumn}
									className="text-red-600 focus:text-red-600"
								>
									<Trash2 className="mr-2 h-4 w-4" />
									{localization?.deleteColumn ??
										t("kanban.forms.deleteColumn", "Delete Column")}
								</DropdownMenuItem>
							</PermissionAccess>
						</DropdownMenuContent>
					</DropdownMenu>
				</PermissionAccessAny>
			</div>
			<div className="p-0.5 space-y-2">
				{hasTasks ? (
					column.tasks.map((task) => (
						<TaskCard
							key={task.id}
							boardId={boardId}
							ownerId={ownerId}
							organizationId={organizationId}
							columnId={column.id}
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
							<p className="text-sm text-muted-foreground">
								{localization?.noTasks ??
									t("kanban.common.noTasks", "No tasks yet")}
							</p>
							<p className="text-xs text-muted-foreground">
								{localization?.noTasksDescription ??
									t(
										"kanban.list.noTasksDescription",
										"Add a task to get started",
									)}
							</p>
						</div>
						<PermissionAccess
							permission={kanbanPermissions.task.create(columnFacts)}
						>
							<Button onClick={onAddTask} size="sm">
								<Plus className="mr-2 h-4 w-4" />
								{localization?.addTask ?? t("kanban.list.addTask", "Add Task")}
							</Button>
						</PermissionAccess>
					</div>
				)}
			</div>
		</Kanban.Column>
	);
}

export const ColumnContent = memo(ColumnContentComponent);
