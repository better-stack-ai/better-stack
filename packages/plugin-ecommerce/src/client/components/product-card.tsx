"use client";
import {
	usePluginOverrides,
	usePluginSiteNavigation,
} from "@btst/stack/context";
import type { Product } from "../../types";
import { ECOMMERCE_PLUGIN_ID } from "../constants";
import type { EcommercePluginOverrides } from "../overrides";
import { ProductImage } from "./product-image";
import { formatMoney } from "./storefront";

export function ProductCard({
	page,
	product,
}: {
	product: Product;
	page?: "shop";
}) {
	const { pageOverrides } =
		usePluginOverrides<EcommercePluginOverrides>(ECOMMERCE_PLUGIN_ID);
	const Component =
		(page ? pageOverrides?.[page]?.ProductCard : undefined) ??
		DefaultProductCard;
	return <Component product={product} />;
}

function DefaultProductCard({ product }: { product: Product }) {
	const { Link, resolve } = usePluginSiteNavigation(ECOMMERCE_PLUGIN_ID);
	const available = product.variants.length
		? product.variants.some((variant) => variant.stock > 0)
		: product.stock > 0;
	return (
		<Link
			href={resolve(`/shop/products/${encodeURIComponent(product.slug)}`).href}
			className="group block rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
		>
			<div className="aspect-square overflow-hidden rounded-lg bg-muted">
				<ProductImage image={product.images[0]} alt={product.name} />
			</div>
			<div className="mt-4 flex items-start justify-between gap-4">
				<div>
					<h2 className="font-medium group-hover:underline">{product.name}</h2>
					{product.category ? (
						<p className="mt-1 text-sm text-muted-foreground">
							{product.category}
						</p>
					) : null}
				</div>
				<span className="shrink-0 font-medium tabular-nums">
					{product.variants.length ? "From " : ""}
					{formatMoney(
						product.variants.length
							? Math.min(
									...product.variants.map(
										(variant) => variant.price ?? product.price,
									),
								)
							: product.price,
						product.currency,
					)}
				</span>
			</div>
			{!available ? (
				<p className="mt-2 text-sm text-muted-foreground">Out of stock</p>
			) : null}
		</Link>
	);
}
