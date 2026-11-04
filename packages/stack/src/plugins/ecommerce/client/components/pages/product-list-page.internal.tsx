"use client";
import { useDeferredValue, useState } from "react";
import { usePluginSiteNavigation, useStack } from "@btst/stack/context";
import { Input } from "@workspace/ui/components/input";
import { Button } from "@workspace/ui/components/button";
import { ECOMMERCE_PLUGIN_ID } from "../../constants";
import { useProducts } from "../../hooks/use-products";
import { ProductImage } from "../product-image";
import {
	ErrorMessage,
	Storefront,
	formatMoney,
	currencyScale,
} from "../storefront";

export function ProductListPage() {
	const { plugins } = useStack();
	const configuredCurrency = plugins?.[ECOMMERCE_PLUGIN_ID]?.config?.currency;
	const priceScale = currencyScale(
		typeof configuredCurrency === "string" ? configuredCurrency : "USD",
	);
	const [search, setSearch] = useState("");
	const [category, setCategory] = useState("");
	const [collection, setCollection] = useState("");
	const [minPrice, setMinPrice] = useState("");
	const [maxPrice, setMaxPrice] = useState("");
	const [inStock, setInStock] = useState(false);
	const [offset, setOffset] = useState(0);
	const filters = {
		search: useDeferredValue(search) || undefined,
		category: category || undefined,
		collection: collection || undefined,
		minPrice: minPrice ? Math.round(Number(minPrice) * priceScale) : undefined,
		maxPrice: maxPrice ? Math.round(Number(maxPrice) * priceScale) : undefined,
		inStock: inStock || undefined,
		limit: 24,
		offset,
	};
	const products = useProducts(filters);
	const { Link, resolve } = usePluginSiteNavigation(ECOMMERCE_PLUGIN_ID);
	const resetPage = () => setOffset(0);
	return (
		<Storefront>
			<header className="mb-8 flex items-end justify-between gap-4">
				<div>
					<h1 className="text-3xl font-semibold tracking-tight">Products</h1>
					<p className="mt-2 text-muted-foreground">
						Browse the catalog and choose what works for you.
					</p>
				</div>
				{products.data ? (
					<p className="text-sm text-muted-foreground">
						{products.data.total} products
					</p>
				) : null}
			</header>
			<form
				aria-label="Filter products"
				className="mb-8 grid gap-4 rounded-lg bg-muted/40 p-4 sm:grid-cols-2 lg:grid-cols-6"
				onSubmit={(event) => event.preventDefault()}
			>
				<label className="text-sm">
					Search
					<Input
						type="search"
						value={search}
						onChange={(event) => {
							setSearch(event.target.value);
							resetPage();
						}}
						className="mt-1"
						placeholder="Product name"
					/>
				</label>
				<label className="text-sm">
					Category
					<select
						className="mt-1 h-9 w-full rounded-md border bg-background px-2"
						value={category}
						onChange={(event) => {
							setCategory(event.target.value);
							resetPage();
						}}
					>
						<option value="">All categories</option>
						{products.data?.categories.map((value) => (
							<option key={value}>{value}</option>
						))}
					</select>
				</label>
				<label className="text-sm">
					Collection
					<select
						className="mt-1 h-9 w-full rounded-md border bg-background px-2"
						value={collection}
						onChange={(event) => {
							setCollection(event.target.value);
							resetPage();
						}}
					>
						<option value="">All collections</option>
						{products.data?.collections.map((value) => (
							<option key={value}>{value}</option>
						))}
					</select>
				</label>
				<label className="text-sm">
					Minimum price
					<Input
						className="mt-1"
						type="number"
						min={0}
						step={1 / priceScale}
						value={minPrice}
						onChange={(event) => {
							setMinPrice(event.target.value);
							resetPage();
						}}
					/>
				</label>
				<label className="text-sm">
					Maximum price
					<Input
						className="mt-1"
						type="number"
						min={0}
						step={1 / priceScale}
						value={maxPrice}
						onChange={(event) => {
							setMaxPrice(event.target.value);
							resetPage();
						}}
					/>
				</label>
				<label className="flex items-center gap-2 self-end py-2 text-sm">
					<input
						type="checkbox"
						checked={inStock}
						onChange={(event) => {
							setInStock(event.target.checked);
							resetPage();
						}}
					/>
					In stock only
				</label>
			</form>
			<ErrorMessage error={products.error} />
			{products.isPending ? (
				<p role="status" className="py-12 text-muted-foreground">
					Loading products…
				</p>
			) : null}
			{products.data?.items.length === 0 ? (
				<div className="py-16 text-center">
					<h2 className="text-xl font-medium">
						No products match your filters
					</h2>
					<p className="mt-2 text-muted-foreground">
						Try another category or a wider price range.
					</p>
				</div>
			) : null}
			<div className="grid grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
				{products.data?.items.map((product) => {
					const available = product.variants.length
						? product.variants.some((variant) => variant.stock > 0)
						: product.stock > 0;
					return (
						<Link
							key={product.id}
							href={resolve(`/shop/${encodeURIComponent(product.slug)}`).href}
							className="group block rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
						>
							<div className="aspect-square overflow-hidden rounded-lg bg-muted">
								<ProductImage image={product.images[0]} alt={product.name} />
							</div>
							<div className="mt-4 flex items-start justify-between gap-4">
								<div>
									<h2 className="font-medium group-hover:underline">
										{product.name}
									</h2>
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
								<p className="mt-2 text-sm text-muted-foreground">
									Out of stock
								</p>
							) : null}
						</Link>
					);
				})}
			</div>
			{products.data && products.data.total > 24 ? (
				<nav
					aria-label="Product pages"
					className="mt-10 flex items-center justify-between"
				>
					<Button
						variant="outline"
						disabled={offset === 0}
						onClick={() => setOffset(Math.max(0, offset - 24))}
					>
						Previous
					</Button>
					<span className="text-sm">Page {Math.floor(offset / 24) + 1}</span>
					<Button
						variant="outline"
						disabled={offset + 24 >= products.data.total}
						onClick={() => setOffset(offset + 24)}
					>
						Next
					</Button>
				</nav>
			) : null}
		</Storefront>
	);
}
