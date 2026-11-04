import { createHmac } from "node:crypto";
import { expect, type APIRequestContext } from "@playwright/test";
import { mockAuthHeaders } from "./mock-auth";

/** Sample merchandise for the isolated generated applications, with no real payments. */
export async function seedEcommerce(request: APIRequestContext, suffix = "") {
	const headers = mockAuthHeaders();
	const synced = await request.get("/api/data/content-types", { headers });
	expect(synced.ok(), await synced.text()).toBe(true);
	const samples = [
		{
			slug: "field-notebook",
			data: {
				name: "Field notebook",
				description:
					"A stitched notebook for notes, sketches, and plans. Choose your cover colour.",
				price: 1800,
				currency: "USD",
				stock: 0,
				status: "published",
				category: "Stationery",
				collections: ["Everyday essentials"],
				images: [
					"https://images.unsplash.com/photo-1455390582262-044cdead277a?w=900&auto=format&fit=crop",
				],
				variants: [
					{ id: "navy", name: "Navy", options: { colour: "navy" }, stock: 12 },
					{
						id: "forest",
						name: "Forest",
						options: { colour: "forest" },
						price: 2100,
						stock: 8,
					},
				],
			},
		},
		{
			slug: "weekender-tote",
			data: {
				name: "Weekender tote",
				description: "A roomy carryall for a day's worth of essentials.",
				price: 4800,
				currency: "USD",
				stock: 10,
				status: "published",
				category: "Bags",
				collections: ["Everyday essentials"],
				images: [
					"https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=900&auto=format&fit=crop",
				],
			},
		},
		{
			slug: "stoneware-cup",
			data: {
				name: "Stoneware cup",
				description: "A simple cup for the morning coffee ritual.",
				price: 2400,
				currency: "USD",
				stock: 0,
				status: "published",
				category: "Home",
				images: [
					"https://images.unsplash.com/photo-1514228742587-6b1558fcca3d?w=900&auto=format&fit=crop",
				],
			},
		},
	];
	const products: { id: string; slug: string }[] = [];
	for (const original of samples) {
		const sample = { ...original, slug: `${original.slug}${suffix}` };
		const existing = await request.get(
			`/api/data/shop/products/${sample.slug}`,
		);
		if (existing.ok()) {
			products.push(await existing.json());
			continue;
		}
		const created = await request.post("/api/data/shop/products", {
			headers,
			data: sample,
		});
		expect(created.ok(), await created.text()).toBe(true);
		products.push(await created.json());
	}
	const discount = await request.post("/api/data/shop/discounts", {
		headers,
		data: { code: "WELCOME10", type: "percent", value: 10, maxUses: 100 },
	});
	expect([200, 201, 409]).toContain(discount.status());
	return products;
}

export async function payDemoOrder(
	request: APIRequestContext,
	input: { orderId: string; amount: number; currency: string },
) {
	const body = JSON.stringify({
		...input,
		status: "paid",
		paymentRef: `demo-${input.orderId}`,
	});
	const signature = createHmac("sha256", "btst-ecommerce-e2e-only")
		.update(body)
		.digest("hex");
	const response = await request.post("/api/data/shop/webhook", {
		data: body,
		headers: {
			"content-type": "application/json",
			"x-demo-signature": signature,
		},
	});
	expect(response.ok(), await response.text()).toBe(true);
}
