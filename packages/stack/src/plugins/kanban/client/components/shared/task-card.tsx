"use client";

import { memo } from "react";
import { GripVertical } from "lucide-react";
import { Button } from "@workspace/ui/components/button";
import { Badge } from "@workspace/ui/components/badge";
import * as Kanban from "@workspace/ui/components/kanban";
import { format } from "date-fns";
import type { SerializedTask } from "../../../types";
import { getPriorityConfig } from "../../../utils";
import { useResolveUser } from "../../hooks/kanban-hooks";
import { UserAvatar } from "./user-avatar";
import { useCan, usePluginOverrides, useTranslate } from "@btst/stack/context";
import type { KanbanPluginOverrides } from "../../overrides";

interface TaskCardProps {
	boardId: string;
	columnId: string;
	task: SerializedTask;
	canMove: boolean;
	onClick: () => void;
}

function TaskCardComponent({
	boardId,
	columnId,
	task,
	canMove,
	onClick,
}: TaskCardProps) {
	const t = useTranslate();
	const { localization } = usePluginOverrides<KanbanPluginOverrides>("kanban");
	const { can: canEdit, isPending: isCheckingEdit } = useCan({
		resource: "kanban:task",
		action: "update",
		params: { id: task.id, boardId, columnId },
	});
	const priorityConfig = getPriorityConfig(task.priority);
	const { data: assignee } = useResolveUser(task.assigneeId);
	const priorityLabels = {
		LOW: localization?.priorityLow ?? t("kanban.common.priorityLow", "Low"),
		MEDIUM:
			localization?.priorityMedium ??
			t("kanban.common.priorityMedium", "Medium"),
		HIGH: localization?.priorityHigh ?? t("kanban.common.priorityHigh", "High"),
		URGENT:
			localization?.priorityUrgent ??
			t("kanban.common.priorityUrgent", "Urgent"),
	};
	const editable = !isCheckingEdit && canEdit;

	return (
		<Kanban.Item value={task.id} asChild>
			<div
				className={`rounded-md border bg-card p-3 shadow-xs transition-shadow ${editable ? "cursor-pointer hover:shadow-md" : "cursor-default"}`}
				onClick={editable ? onClick : undefined}
			>
				<div className="flex flex-col gap-2">
					<div className="flex items-center gap-2">
						<Kanban.ItemHandle asChild disabled={!canMove}>
							<Button
								variant="ghost"
								size="icon"
								className="h-6 w-6"
								onClick={(e: React.MouseEvent) => e.stopPropagation()}
							>
								<GripVertical className="h-3 w-3" />
							</Button>
						</Kanban.ItemHandle>
						<span
							className={`line-clamp-1 font-medium text-base flex-1 text-left ${editable ? "cursor-pointer hover:text-primary" : "cursor-default"}`}
							title={task.title}
						>
							{task.title}
						</span>
						<Badge
							variant={priorityConfig.variant}
							className={`pointer-events-none h-5 rounded-sm px-1.5 text-[11px] capitalize ${priorityConfig.className}`}
						>
							{priorityLabels[task.priority] ?? priorityConfig.label}
						</Badge>
					</div>

					<div className="flex items-center justify-between text-muted-foreground text-xs">
						{task.assigneeId ? (
							<div className="flex items-center gap-1.5">
								<UserAvatar user={assignee ?? null} size="sm" />
								<span className="line-clamp-1">
									{assignee?.name ||
										(localization?.assigned ??
											t("kanban.common.assigned", "Assigned"))}
								</span>
							</div>
						) : (
							<div className="flex items-center gap-1.5">
								<UserAvatar user={null} size="sm" />
								<span className="line-clamp-1">
									{localization?.unassigned ??
										t("kanban.common.unassigned", "Unassigned")}
								</span>
							</div>
						)}
						<time className="tabular-nums">
							{format(new Date(task.createdAt), "MMM d")}
						</time>
					</div>
				</div>
			</div>
		</Kanban.Item>
	);
}

export const TaskCard = memo(TaskCardComponent);
