import { definePermissions, permission } from "@btst/stack/authorization";
import { z } from "zod";

const notification = z.object({ id: z.string(), recipientId: z.string() });
export const notificationsPermissions = definePermissions("notifications", {
	inbox: { read: permission(), markAllAsRead: permission() },
	preferences: { read: permission(), update: permission() },
	notification: {
		markAsRead: permission(notification),
		archive: permission(notification),
		send: permission(
			z.object({ recipientId: z.string(), category: z.string() }),
		),
	},
});
