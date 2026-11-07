import { definePermissions, permission } from "@btst/stack/authorization";
import { z } from "zod";
const id = z.object({ id: z.string().optional() });
/** Public buying, authenticated customer history, and private administration are separate capabilities. */
export const ecommercePermissions = definePermissions("ecommerce", {
	product: {
		read: permission(z.object({ slug: z.string().optional() })),
		manage: permission(id),
	},
	checkout: {
		create: permission(z.object({})),
		webhook: permission(z.object({})),
	},
	discount: {
		validate: permission(z.object({})),
		manage: permission(z.object({})),
	},
	order: {
		read: permission(id),
		update: permission(id),
		readRefund: permission(id),
		refund: permission(id),
		reconcileRefund: permission(id),
		own: permission(z.object({ customerId: z.string() })),
		confirmation: permission(z.object({ id: z.string() })),
	},
});
