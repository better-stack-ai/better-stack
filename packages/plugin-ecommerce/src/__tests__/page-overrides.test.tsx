import { ProductListPage } from "../client/components/pages/product-list-page.internal";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EcommercePluginOverrides } from "../client/overrides";
import { ProductCard } from "../client/components/product-card";

const state = vi.hoisted(() => ({ overrides: {} as EcommercePluginOverrides }));
vi.mock("@btst/stack/context", () => ({
	usePluginOverrides: () => state.overrides,
	useStack: () => ({ plugins: {} }),
	usePluginSiteNavigation: () => ({
		Link: "a",
		resolve: (...parts: string[]) => ({ href: `/pages/${parts.join("/")}` }),
	}),
	PermissionAccess: ({ children }: { children: ReactNode }) => children,
}));
import { productSchema } from "../schemas";
const product = {
	...productSchema.parse({
		name: "Handmade mug",
		price: 2500,
		stock: 2,
		status: "published",
	}),
	id: "product-1",
	slug: "mug",
	createdAt: "2026-11-06",
	updatedAt: "2026-11-06",
};
vi.mock("../client/hooks/use-products", () => ({
	useEcommerceEndpoint: () => ({ baseURL: "" }),
	useProducts: () => ({
		data: { items: [product], total: 1, categories: [], collections: [] },
	}),
}));
const props = { product };
const pages = ["shop"] as const;
const render = (page?: (typeof pages)[number]) =>
	renderToStaticMarkup(<ProductCard {...props} page={page} />);

beforeEach(() => {
	state.overrides = {};
});

describe("ecommerce page-scoped ProductCard", () => {
	it("selects the explicit page and forwards the existing presentation props", () => {
		for (const page of pages) {
			const slot = vi.fn((_: unknown) => (
				<section data-slot-override={page}>Custom presentation</section>
			));
			state.overrides = { pageOverrides: { [page]: { ProductCard: slot } } };
			expect(render(page)).toContain(`data-slot-override="${page}"`);
			const presentationProps = props;
			expect(slot.mock.calls[0]?.[0]).toEqual(presentationProps);
			for (const other of pages.filter((key) => key !== page)) {
				expect(render(other)).not.toContain("data-slot-override");
				expect(render(other)).toContain("Handmade mug");
			}
			expect(render()).not.toContain("data-slot-override");
			expect(render()).toContain("Handmade mug");
		}
	});
	it("preserves built-in presentation when no slot is configured or a page entry is empty", () => {
		for (const page of pages) {
			const unchanged = render(page);
			expect(unchanged).toContain("Handmade mug");
			state.overrides = { pageOverrides: { [page]: {} } };
			expect(render(page)).toBe(unchanged);
		}
	});
});

vi.mock("../client/components/storefront", async (original) => ({
	...(await original<typeof import("../client/components/storefront")>()),
	Storefront: ({ children }: { children: ReactNode }) => children,
}));
it("the built-in shop explicitly scopes catalog cards", () => {
	state.overrides = {
		pageOverrides: {
			shop: {
				ProductCard: ({ product }) => (
					<article data-built-in="shop">{product.name}</article>
				),
			},
		},
	};
	expect(renderToStaticMarkup(<ProductListPage />)).toContain(
		'data-built-in="shop"',
	);
});
