"use client";

import { memo } from "react";
import { GripVertical } from "lucide-react";
import { Button } from "@workspace/ui/components/button";
import { Badge } from "@workspace/ui/components/badge";
import * as Kanban from "@workspace/ui/components/kanban";
import { format } from "date-fns";
import type { SerializedTask } from "../../../types";
import { getPriorityConfig } from "../../../utils";

interface TaskCardProps {
	task: SerializedTask;
	onClick: () => void;
}

function TaskCardComponent({ task, onClick }: TaskCardProps) {
	const priorityConfig = getPriorityConfig(task.priority);

	return (
		<Kanban.Item value={task.id} asChild>
			<div
				className="rounded-md border bg-card p-3 shadow-xs cursor-pointer hover:shadow-md transition-shadow"
				onClick={onClick}
			>
				<div className="flex flex-col gap-2">
					<div className="flex items-center gap-2">
						<Kanban.ItemHandle asChild>
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
							className="line-clamp-1 font-medium text-base flex-1 text-left cursor-pointer hover:text-primary"
							title={task.title}
						>
							{task.title}
						</span>
						<Badge
							variant={priorityConfig.variant}
							className="pointer-events-none h-5 rounded-sm px-1.5 text-[11px] capitalize"
						>
							{priorityConfig.label}
						</Badge>
					</div>

					<div className="flex items-center justify-between text-muted-foreground text-xs">
						{task.assigneeId ? (
							<span className="line-clamp-1">Assigned</span>
						) : (
							<div className="flex items-center gap-1">
								<div className="size-2 rounded-full bg-destructive/20" />
								<span className="line-clamp-1">Unassigned</span>
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
