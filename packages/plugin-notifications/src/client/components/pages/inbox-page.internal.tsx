"use client";

import { useState } from "react";
import { PermissionAccess, usePluginSiteNavigation } from "@btst/stack/context";
import { notificationsPermissions } from "../../../permissions";
import { NOTIFICATIONS_PLUGIN_ID } from "../../constants";
import {
	useMarkAllNotificationsAsRead,
	useSuspenseNotifications,
} from "../../hooks";
import { NotificationList } from "../notification-list";
import { NotificationsPage, useNotificationsLabels } from "../shared";

export function InboxPage() {
	const [status, setStatus] = useState<"all" | "unread">("all");
	const [offset, setOffset] = useState(0);
	const params = {
		...(status === "unread" ? { status } : {}),
		limit: 25,
		offset,
	};
	const { data, refetch, isFetching } = useSuspenseNotifications(params);
	const markAll = useMarkAllNotificationsAsRead();
	const { Link, resolve } = usePluginSiteNavigation(NOTIFICATIONS_PLUGIN_ID);
	const labels = useNotificationsLabels();
	return (
		<NotificationsPage
			title={labels.title}
			action={
				<Link href={resolve("notifications/preferences").href}>
					{labels.preferences}
				</Link>
			}
		>
			<div className="nt-toolbar">
				<div className="nt-tabs" aria-label="Filter notifications">
					{(["all", "unread"] as const).map((value) => (
						<button
							type="button"
							key={value}
							aria-pressed={status === value}
							onClick={() => {
								setStatus(value);
								setOffset(0);
							}}
						>
							{value === "all" ? "All" : "Unread"}
						</button>
					))}
				</div>
				<div className="nt-actions">
					<button
						type="button"
						disabled={isFetching}
						onClick={() => void refetch()}
					>
						Refresh
					</button>
					<PermissionAccess
						permission={notificationsPermissions.inbox.markAllAsRead()}
					>
						<button
							type="button"
							disabled={!data.unreadCount || markAll.isPending}
							onClick={() => markAll.mutate()}
						>
							{labels.markAllAsRead}
						</button>
					</PermissionAccess>
				</div>
			</div>
			<p className="nt-count">{data.unreadCount} unread</p>
			{markAll.error && (
				<p className="nt-error" role="alert">
					{markAll.error.message}
				</p>
			)}
			<NotificationList items={data.items} empty={labels.empty} />
			{(offset > 0 || offset + 25 < data.total) && (
				<nav className="nt-pagination" aria-label="Notification pages">
					<button
						type="button"
						disabled={offset === 0}
						onClick={() => setOffset(Math.max(0, offset - 25))}
					>
						Previous
					</button>
					<button
						type="button"
						disabled={offset + 25 >= data.total}
						onClick={() => setOffset(offset + 25)}
					>
						Next
					</button>
				</nav>
			)}
		</NotificationsPage>
	);
}
