"use client";

import { Bell } from "lucide-react";
import {
	PermissionAccess,
	useIdentity,
	usePluginSiteNavigation,
} from "@btst/stack/context";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@workspace/ui/components/popover";
import { notificationsPermissions } from "../../permissions";
import { NOTIFICATIONS_PLUGIN_ID } from "../constants";
import { useNotifications } from "../hooks";
import { NotificationList } from "./notification-list";
import { useNotificationsLabels } from "./shared";

export interface NotificationBellProps {
	className?: string;
}

/** Embeds the current user's unread count and recent inbox in application navigation. */
export function NotificationBell(props: NotificationBellProps) {
	const { identity, isPending, error } = useIdentity();
	if (!identity || isPending || error) return null;
	return (
		<PermissionAccess permission={notificationsPermissions.inbox.read()}>
			<NotificationBellContent {...props} />
		</PermissionAccess>
	);
}

function NotificationBellContent({ className }: NotificationBellProps) {
	const { data, isPending, error } = useNotifications({ limit: 5, offset: 0 });
	const { Link, resolve } = usePluginSiteNavigation(NOTIFICATIONS_PLUGIN_ID);
	const labels = useNotificationsLabels();
	return (
		<Popover>
			<PopoverTrigger asChild>
				<button
					type="button"
					className={`notification-bell ${className ?? ""}`}
					aria-label="Notifications"
				>
					<Bell size={20} aria-hidden="true" />
					{!!data?.unreadCount && (
						<span
							className="nt-badge"
							aria-label={`${data.unreadCount} unread notifications`}
						>
							{data.unreadCount > 99 ? "99+" : data.unreadCount}
						</span>
					)}
				</button>
			</PopoverTrigger>
			<PopoverContent
				className="notifications-popover"
				align="end"
				aria-label="Recent notifications"
			>
				<header className="nt-header">
					<h2>{labels.title}</h2>
					<Link href={resolve("notifications/preferences").href}>
						{labels.preferences}
					</Link>
				</header>
				{isPending ? (
					<p role="status">Loading notifications…</p>
				) : error ? (
					<p role="alert">{error.message}</p>
				) : (
					<NotificationList items={data?.items ?? []} empty={labels.empty} />
				)}
				<Link className="nt-inbox-link" href={resolve("notifications").href}>
					View all notifications
				</Link>
			</PopoverContent>
		</Popover>
	);
}
