import type { Order, OrderRecord } from "../types";
/** Project the safe HTTP representation without guest tokens or checkout credentials. */
export function serializeOrder(record: OrderRecord): Order {
	return {
		id: record.id,
		email: record.email,
		customerId: record.customerId,
		status: record.status,
		lineItems: JSON.parse(record.lineItems),
		subtotal: record.subtotal,
		discount: record.discount,
		shipping: record.shipping,
		tax: record.tax ?? 0,
		total: record.total,
		currency: record.currency,
		shippingAddress: JSON.parse(record.shippingAddress),
		paymentProvider: record.paymentProvider,
		paymentRef: record.paymentRef,
		paymentStatus: record.paymentStatus,
		createdAt: new Date(record.createdAt).toISOString(),
		updatedAt: new Date(record.updatedAt).toISOString(),
	};
}
