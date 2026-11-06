"use client";

import {
	PermissionAccess,
	usePluginOverrides,
	usePluginSiteNavigation,
} from "@btst/stack/context";
import { notificationsPermissions } from "../../permissions";
import type { Notification } from "../../types";
import type { NotificationsPluginOverrides } from "../overrides";
import { NOTIFICATIONS_PLUGIN_ID } from "../constants";
import { useArchiveNotification, useMarkNotificationAsRead } from "../hooks";

export function NotificationList({
	page,
	items,
	empty,
}: {
	page?: "inbox";
	items: Notification[];
	empty: string;
}) {
	const { pageOverrides } = usePluginOverrides<NotificationsPluginOverrides>(
		NOTIFICATIONS_PLUGIN_ID,
	);
	const Row =
		(page ? pageOverrides?.[page]?.NotificationRow : undefined) ??
		NotificationRow;
	if (!items.length) return <p className="nt-empty">{empty}</p>;
	return (
		<ul className="nt-list" aria-label="Notifications">
			{items.map((item) => (
				<Row key={item.id} item={item} />
			))}
		</ul>
	);
}

function NotificationRow({ item }: { item: Notification }) {
	const markAsRead = useMarkNotificationAsRead();
	const archive = useArchiveNotification();
	const { Link } = usePluginSiteNavigation(NOTIFICATIONS_PLUGIN_ID);
	const facts = { id: item.id, recipientId: item.recipientId };
	const error = markAsRead.error ?? archive.error;
	return (
		<li className="nt-row" data-unread={!item.readAt}>
			<div className="nt-content">
				<span className="nt-category">{item.category}</span>
				<h2>
					{item.href ? <Link href={item.href}>{item.title}</Link> : item.title}
				</h2>
				<p>{item.body}</p>
				<time dateTime={item.createdAt}>
					{new Date(item.createdAt).toISOString().slice(0, 10)}
				</time>
			</div>
			<div className="nt-actions">
				{!item.readAt && (
					<PermissionAccess
						permission={notificationsPermissions.notification.markAsRead(facts)}
					>
						<button
							type="button"
							disabled={markAsRead.isPending || archive.isPending}
							onClick={() => markAsRead.mutate(item.id)}
						>
							Mark as read
						</button>
					</PermissionAccess>
				)}
				<PermissionAccess
					permission={notificationsPermissions.notification.archive(facts)}
				>
					<button
						type="button"
						disabled={markAsRead.isPending || archive.isPending}
						onClick={() => archive.mutate(item.id)}
					>
						Archive
					</button>
				</PermissionAccess>
			</div>
			{error && (
				<p className="nt-error" role="alert">
					{error.message}
				</p>
			)}
		</li>
	);
}
