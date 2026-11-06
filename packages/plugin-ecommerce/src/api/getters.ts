import { getAssetById } from "@btst/plugin-media/api";
import type { DBAdapter as Adapter } from "@btst/db";
import { getAllContentItems, getContentItemBySlug } from "@btst/plugin-cms/api";
import {
	productSchema,
	PRODUCT_TYPE_SLUG,
	productsQuerySchema,
} from "../schemas";
import type {
	Product,
	ProductsFilters,
	ProductsPage,
	OrderRecord,
	DiscountCode,
	InventoryRecord,
} from "../types";

/** Read-only product projection; malformed and unpublished CMS items stay private. */
export async function listProducts(
	adapter: Adapter,
	filters: ProductsFilters = {},
	mediaAvailable = false,
): Promise<ProductsPage> {
	const input = productsQuerySchema.parse(filters);
	const products: Product[] = [];
	for (let offset = 0; ; offset += 500) {
		const page = await getAllContentItems(adapter, PRODUCT_TYPE_SLUG, {
			limit: 500,
			offset,
		});
		for (const item of page.items) {
			const parsed = productSchema.safeParse(item.parsedData);
			if (parsed.success && parsed.data.status === "published")
				products.push(
					await overlayInventory(adapter, {
						...parsed.data,
						id: item.id,
						slug: item.slug,
						createdAt: item.createdAt,
						updatedAt: item.updatedAt,
					}),
				);
		}
		if (page.items.length < 500) break;
	}
	const categories = [
		...new Set(
			products.flatMap((product) =>
				product.category ? [product.category] : [],
			),
		),
	].sort();
	const collections = [
		...new Set(products.flatMap((product) => product.collections)),
	].sort();
	const matching = products.filter((product) => {
		const prices = product.variants.length
			? product.variants.map((variant) => variant.price ?? product.price)
			: [product.price];
		const stock = product.variants.length
			? product.variants.reduce((sum, variant) => sum + variant.stock, 0)
			: product.stock;
		return (
			(!input.category || product.category === input.category) &&
			(!input.collection || product.collections.includes(input.collection)) &&
			(!input.search ||
				`${product.name} ${product.description} ${product.tags.join(" ")}`
					.toLowerCase()
					.includes(input.search.toLowerCase())) &&
			(input.minPrice === undefined ||
				prices.some(
					(price) =>
						price >= input.minPrice! &&
						(input.maxPrice === undefined || price <= input.maxPrice),
				)) &&
			(input.maxPrice === undefined ||
				prices.some(
					(price) =>
						price <= input.maxPrice! &&
						(input.minPrice === undefined || price >= input.minPrice),
				)) &&
			(input.inStock === undefined || stock > 0 === input.inStock)
		);
	});
	return {
		items: await Promise.all(
			matching
				.slice(input.offset, input.offset + input.limit)
				.map((product) =>
					resolveProductImages(adapter, product, mediaAvailable),
				),
		),
		total: matching.length,
		limit: input.limit,
		offset: input.offset,
		categories,
		collections,
	};
}
export async function getProduct(
	adapter: Adapter,
	slug: string,
	mediaAvailable = false,
): Promise<Product | null> {
	const item = await getContentItemBySlug(adapter, PRODUCT_TYPE_SLUG, slug);
	if (!item) return null;
	const parsed = productSchema.safeParse(item.parsedData);
	return parsed.success && parsed.data.status === "published"
		? resolveProductImages(
				adapter,
				await overlayInventory(adapter, {
					...parsed.data,
					id: item.id,
					slug: item.slug,
					createdAt: item.createdAt,
					updatedAt: item.updatedAt,
				}),
				mediaAvailable,
			)
		: null;
}
export async function getOrder(adapter: Adapter, id: string) {
	return adapter.findOne<OrderRecord>({
		model: "ecommerceOrder",
		where: [{ field: "id", value: id }],
	});
}
export async function listOrders(
	adapter: Adapter,
	options: {
		customerId?: string;
		status?: string;
		limit?: number;
		offset?: number;
	} = {},
) {
	const where = [
		...(options.customerId
			? [{ field: "customerId", value: options.customerId }]
			: []),
		...(options.status ? [{ field: "status", value: options.status }] : []),
	];
	const [items, total] = await Promise.all([
		adapter.findMany<OrderRecord>({
			model: "ecommerceOrder",
			where,
			limit: options.limit ?? 25,
			offset: options.offset ?? 0,
			sortBy: { field: "createdAt", direction: "desc" },
		}),
		adapter.count({ model: "ecommerceOrder", where }),
	]);
	return { items, total };
}
export async function getDiscountCode(adapter: Adapter, code: string) {
	return adapter.findOne<DiscountCode>({
		model: "ecommerceDiscountCode",
		where: [{ field: "code", value: code.trim().toUpperCase() }],
	});
}

/** Product authors explicitly publish selected media; missing assets are omitted. */
export async function resolveProductImages(
	adapter: Pick<Adapter, "findOne">,
	product: Product,
	mediaAvailable: boolean,
): Promise<Product> {
	if (!mediaAvailable) return product;
	const images = await Promise.all(
		product.images.map((image) =>
			resolveProductImage(adapter, image, mediaAvailable),
		),
	);
	return {
		...product,
		images: images.filter((image): image is string => Boolean(image)),
	};
}

/** Resolve published product media consistently in catalog responses and durable order snapshots. */
export async function resolveProductImage(
	adapter: Pick<Adapter, "findOne">,
	image: string | undefined,
	mediaAvailable: boolean,
): Promise<string | undefined> {
	if (
		!image ||
		!mediaAvailable ||
		/^https?:\/\//.test(image) ||
		(image.startsWith("/") && !image.startsWith("//"))
	)
		return image;
	return (await getAssetById(adapter, image))?.url;
}

/** Read the authoritative product/variant count without initializing or changing inventory. */
export async function getInventory(
	adapter: Pick<Adapter, "findOne">,
	productId: string,
	variantId?: string,
) {
	return adapter.findOne<InventoryRecord>({
		model: "ecommerceInventory",
		where: [
			{ field: "key", value: JSON.stringify([productId, variantId ?? null]) },
		],
	});
}
async function overlayInventory(
	adapter: Pick<Adapter, "findOne">,
	product: Product,
): Promise<Product> {
	const [inventory, variants] = await Promise.all([
		getInventory(adapter, product.id),
		Promise.all(
			product.variants.map(async (variant) => ({
				...variant,
				stock:
					(await getInventory(adapter, product.id, variant.id))?.stock ??
					variant.stock,
			})),
		),
	]);
	return { ...product, stock: inventory?.stock ?? product.stock, variants };
}
