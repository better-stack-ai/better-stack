"use client";

import { format } from "date-fns";
import { usePluginOverrides } from "@btst/stack/context";
import type { KanbanPluginOverrides, KanbanUser } from "../../overrides";
import { KANBAN_PLUGIN_ID } from "../../constants";
import type { SerializedTask } from "../../../types";
import { UserAvatar } from "./user-avatar";

/** Task metadata presentation; board permissions and interactions remain package-owned. */
export interface TaskDetailsProps {
	task: SerializedTask;
	assignee: KanbanUser | null;
	assignedLabel: string;
	unassignedLabel: string;
}

export function TaskDetails({
	page,
	...props
}: TaskDetailsProps & { page?: "board" }) {
	if (!page) return <DefaultTaskDetails {...props} />;
	return <ScopedTaskDetails page={page} {...props} />;
}

function ScopedTaskDetails({
	page,
	...props
}: TaskDetailsProps & { page: "board" }) {
	const { pageOverrides } =
		usePluginOverrides<KanbanPluginOverrides>(KANBAN_PLUGIN_ID);
	const Details =
		(page ? pageOverrides?.[page]?.TaskDetails : undefined) ??
		DefaultTaskDetails;
	return <Details {...props} />;
}

function DefaultTaskDetails({
	task,
	assignee,
	assignedLabel,
	unassignedLabel,
}: TaskDetailsProps) {
	return (
		<div className="flex items-center justify-between text-muted-foreground text-xs">
			{task.assigneeId ? (
				<div className="flex items-center gap-1.5">
					<UserAvatar user={assignee ?? null} size="sm" />
					<span className="line-clamp-1">
						{assignee?.name || assignedLabel}
					</span>
				</div>
			) : (
				<div className="flex items-center gap-1.5">
					<UserAvatar user={null} size="sm" />
					<span className="line-clamp-1">{unassignedLabel}</span>
				</div>
			)}
			<time className="tabular-nums">
				{format(new Date(task.createdAt), "MMM d")}
			</time>
		</div>
	);
}
