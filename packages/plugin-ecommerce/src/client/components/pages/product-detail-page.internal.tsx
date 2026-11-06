"use client";
import { useState } from "react";
import { usePluginSiteNavigation } from "@btst/stack/context";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { useSuspenseProduct } from "../../hooks/use-products";
import { useCart } from "../../hooks/use-cart";
import { ECOMMERCE_PLUGIN_ID } from "../../constants";
import { ProductImage } from "../product-image";
import { ErrorMessage, Storefront, formatMoney } from "../storefront";

export function ProductDetailPage({ slug }: { slug: string }) {
	const { data: product } = useSuspenseProduct(slug);
	const [selectedImage, setSelectedImage] = useState(0);
	const [variantId, setVariantId] = useState(product.variants[0]?.id ?? "");
	const [quantity, setQuantity] = useState(1);
	const [added, setAdded] = useState(false);
	const [error, setError] = useState<Error>();
	const cart = useCart();
	const variant = product.variants.find((entry) => entry.id === variantId);
	const stock = variant?.stock ?? product.stock;
	const price = variant?.price ?? product.price;
	const { Link, resolve } = usePluginSiteNavigation(ECOMMERCE_PLUGIN_ID);
	return (
		<Storefront>
			<Link
				className="mb-6 inline-block text-sm text-muted-foreground underline underline-offset-4"
				href={resolve("/shop").href}
			>
				All products
			</Link>
			<div className="grid items-start gap-8 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:gap-14">
				<div>
					<div className="aspect-square overflow-hidden rounded-xl bg-muted">
						<ProductImage
							image={product.images[selectedImage]}
							alt={product.name}
							priority
						/>
					</div>
					{product.images.length > 1 ? (
						<div className="mt-3 flex gap-3 overflow-auto">
							{product.images.map((image, index) => (
								<button
									key={`${image}:${index}`}
									type="button"
									aria-label={`View image ${index + 1}`}
									aria-pressed={selectedImage === index}
									className={`h-20 w-20 shrink-0 overflow-hidden rounded-md border-2 ${selectedImage === index ? "border-primary" : "border-transparent"}`}
									onClick={() => setSelectedImage(index)}
								>
									<ProductImage
										image={image}
										alt={`${product.name}, image ${index + 1}`}
									/>
								</button>
							))}
						</div>
					) : null}
				</div>
				<section className="md:sticky md:top-6">
					{product.category ? (
						<p className="mb-3 text-sm text-muted-foreground">
							{product.category}
						</p>
					) : null}
					<h1 className="text-3xl font-semibold tracking-tight">
						{product.name}
					</h1>
					<p className="mt-5 text-2xl font-medium tabular-nums">
						{formatMoney(price, product.currency)}
					</p>
					<p className="mt-2 text-sm text-muted-foreground">
						{stock > 0 ? `${stock} in stock` : "Out of stock"}
					</p>
					<form
						className="mt-8 space-y-5"
						onSubmit={(event) => {
							event.preventDefault();
							try {
								cart.addItem({
									productId: product.id,
									variantId: variant?.id,
									name: product.name,
									variantName: variant?.name,
									price,
									currency: product.currency,
									image: product.images[0],
									quantity,
								});
								setError(undefined);
								setAdded(true);
							} catch (cause) {
								setError(
									cause instanceof Error ? cause : new Error(String(cause)),
								);
							}
						}}
					>
						{product.variants.length ? (
							<label className="block text-sm font-medium">
								Variant
								<select
									className="mt-2 h-11 w-full rounded-md border bg-background px-3 font-normal"
									value={variantId}
									onChange={(event) => {
										setVariantId(event.target.value);
										setAdded(false);
										setQuantity(1);
									}}
								>
									{product.variants.map((entry) => (
										<option key={entry.id} value={entry.id}>
											{entry.name}
											{entry.stock === 0 ? " — out of stock" : ""}
										</option>
									))}
								</select>
							</label>
						) : null}
						<label className="block text-sm font-medium">
							Quantity
							<Input
								className="mt-2 w-24"
								type="number"
								min={1}
								max={Math.min(stock, 99)}
								value={quantity}
								onChange={(event) => {
									setQuantity(Number(event.target.value));
									setAdded(false);
								}}
							/>
						</label>
						<ErrorMessage error={error} />
						<Button
							className="h-11 w-full"
							type="submit"
							disabled={
								!cart.isHydrated ||
								stock === 0 ||
								quantity < 1 ||
								quantity > Math.min(stock, 99)
							}
						>
							Add to cart
						</Button>
						{added ? (
							<p role="status" className="text-sm">
								Added to your cart.{" "}
								<Link
									className="underline underline-offset-4"
									href={resolve("/shop/cart").href}
								>
									Review cart
								</Link>
							</p>
						) : null}
					</form>
					{product.description ? (
						<div className="mt-10 border-t pt-6">
							<h2 className="mb-3 text-lg font-medium">Details</h2>
							<p className="whitespace-pre-wrap text-sm leading-7 text-muted-foreground">
								{product.description}
							</p>
						</div>
					) : null}
				</section>
			</div>
		</Storefront>
	);
}
