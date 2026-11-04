import type { DBAdapter as Adapter } from "@btst/db";
import { OperationHttpError } from "@btst/stack/plugins/api";
import { createCMSContentItem } from "@btst/stack/plugins/cms/api";
import type { ContentItem } from "../../cms/types";
import { productSchema, PRODUCT_TYPE_SLUG } from "../schemas";
import type { CartItem, OrderLineItem } from "../types";

export function ecommerceError(status: number, message: string): never {
	throw new OperationHttpError(status, message, "ECOMMERCE_ERROR");
}
/** Money and inventory writes must share an isolated transaction, never the adapter's sequential fallback. */
export function requireAtomicTransactions(adapter: Adapter) {
	if (
		adapter.id === "memory" ||
		typeof adapter.options?.adapterConfig.transaction !== "function"
	)
		ecommerceError(
			500,
			"Ecommerce writes require an adapter with isolated transaction support",
		);
}
/** Lower-level CMS write; caller owns validation, authorization and CMS content-type synchronization. */
export async function createProduct(
	adapter: Adapter,
	slug: string,
	data: Record<string, unknown>,
) {
	return createCMSContentItem(adapter, PRODUCT_TYPE_SLUG, { slug, data });
}
/** Read a validated CMS record inside the caller's transaction. */
export async function productSnapshot(
	adapter: Pick<Adapter, "findOne">,
	productId: string,
) {
	const item = await adapter.findOne<ContentItem>({
		model: "contentItem",
		where: [{ field: "id", value: productId }],
	});
	if (!item) ecommerceError(404, "Product not found");
	const type = await adapter.findOne<{ slug: string }>({
		model: "contentType",
		where: [{ field: "id", value: item.contentTypeId }],
	});
	if (type?.slug !== PRODUCT_TYPE_SLUG)
		ecommerceError(404, "Product not found");
	const data = productSchema.parse(JSON.parse(item.data));
	if (data.status !== "published")
		ecommerceError(409, "Product is unavailable");
	return { item, data };
}
/** Atomically reserve stock using CMS JSON compare-and-set within an isolated transaction. */
export async function reserveInventory(
	adapter: Pick<Adapter, "findOne" | "update">,
	items: readonly Readonly<CartItem>[],
	currency: string,
): Promise<OrderLineItem[]> {
	const lines: OrderLineItem[] = [];
	for (const line of items) {
		const { item, data } = await productSnapshot(adapter, line.productId);
		if (data.currency !== currency)
			ecommerceError(400, "Cart currency does not match the store");
		const variant = line.variantId
			? data.variants.find((entry) => entry.id === line.variantId)
			: undefined;
		if ((data.variants.length && !variant) || (line.variantId && !variant))
			ecommerceError(400, "Choose a valid product variant");
		const inventory = variant ?? data;
		if (inventory.stock < line.quantity)
			ecommerceError(409, `${data.name} has insufficient stock`);
		inventory.stock -= line.quantity;
		const updated = await adapter.update({
			model: "contentItem",
			where: [
				{ field: "id", value: item.id },
				{ field: "data", value: item.data },
			],
			update: { data: JSON.stringify(data), updatedAt: new Date() },
		});
		if (!updated) ecommerceError(409, "Inventory changed; retry checkout");
		lines.push({
			productId: item.id,
			...(variant ? { variantId: variant.id, variantName: variant.name } : {}),
			name: data.name,
			quantity: line.quantity,
			price: variant?.price ?? data.price,
			image: data.images[0],
		});
	}
	return lines;
}
/** Release the exact reservation once; caller owns the order state transition and transaction. */
export async function releaseInventory(
	adapter: Pick<Adapter, "findOne" | "update">,
	lines: OrderLineItem[],
) {
	for (const line of lines) {
		const item = await adapter.findOne<ContentItem>({
			model: "contentItem",
			where: [{ field: "id", value: line.productId }],
		});
		if (!item) continue;
		const data = productSchema.parse(JSON.parse(item.data));
		const inventory = line.variantId
			? data.variants.find((entry) => entry.id === line.variantId)
			: data;
		if (!inventory)
			ecommerceError(
				409,
				"Reserved variant was removed; reconcile inventory before cancellation",
			);
		inventory.stock += line.quantity;
		const result = await adapter.update({
			model: "contentItem",
			where: [
				{ field: "id", value: item.id },
				{ field: "data", value: item.data },
			],
			update: { data: JSON.stringify(data), updatedAt: new Date() },
		});
		if (!result) ecommerceError(409, "Inventory changed; retry cancellation");
	}
}
