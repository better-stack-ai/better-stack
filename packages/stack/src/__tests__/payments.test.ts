import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import * as api from "../api";
import * as root from "../index";
import {
	lemonSqueezyAdapter,
	paymentCheckoutSchema,
	paymentWebhookResultSchema,
	stripeAdapter,
	verifyHmac,
} from "../payments";

const secret = "webhook-secret";
const sign = (raw: string) =>
	createHmac("sha256", secret).update(raw).digest("hex");
const request = (raw: string, headers: Record<string, string>) =>
	new Request("https://test.local/webhook", {
		method: "POST",
		body: raw,
		headers,
	});

describe("Core payments", () => {
	it("exports shared payments through the root and API entries", () => {
		for (const entry of [root, api]) {
			expect(entry.stripeAdapter).toBe(stripeAdapter);
			expect(entry.lemonSqueezyAdapter).toBe(lemonSqueezyAdapter);
			expect(entry.verifyHmac).toBe(verifyHmac);
			expect(entry.paymentCheckoutSchema).toBe(paymentCheckoutSchema);
			expect(entry.paymentWebhookResultSchema).toBe(paymentWebhookResultSchema);
		}
	});

	it("verifies HMAC bytes and rejects malformed, wrong or tampered signatures", async () => {
		const raw = '{"amount":1800}';
		const digest = sign(raw);
		expect(await verifyHmac(secret, raw, digest)).toBe(true);
		expect(await verifyHmac(secret, raw, digest.toUpperCase())).toBe(true);
		for (const signature of [
			"",
			"invalid",
			digest.slice(2),
			"g".repeat(64),
			"0".repeat(64),
		])
			expect(await verifyHmac(secret, raw, signature)).toBe(false);
		expect(await verifyHmac("wrong-secret", raw, digest)).toBe(false);
		expect(await verifyHmac(secret, `${raw} `, digest)).toBe(false);
	});

	it("checks Stripe freshness, raw signatures, rotated keys and event mode", async () => {
		const adapter = stripeAdapter("sk_test_fixture", secret);
		const timestamp = Math.floor(Date.now() / 1000);
		const event = {
			type: "payment_intent.succeeded",
			livemode: false,
			data: {
				object: {
					id: "pi_1",
					metadata: { orderId: "order-1" },
					amount_received: 1800,
					currency: "usd",
				},
			},
		};
		const raw = JSON.stringify(event);
		const header = `t=${timestamp},v1=${"0".repeat(64)},v1=${sign(`${timestamp}.${raw}`)}`;
		await expect(
			adapter.handleWebhook(request(raw, { "stripe-signature": header })),
		).resolves.toEqual({
			orderId: "order-1",
			status: "paid",
			paymentRef: "pi_1",
			amount: 1800,
			currency: "usd",
		});
		await expect(
			adapter.handleWebhook(request(`${raw} `, { "stripe-signature": header })),
		).rejects.toThrow("signature");
		await expect(adapter.handleWebhook(request(raw, {}))).rejects.toThrow(
			"timestamp",
		);
		for (const time of [timestamp - 301, timestamp + 301])
			await expect(
				adapter.handleWebhook(
					request(raw, {
						"stripe-signature": `t=${time},v1=${sign(`${time}.${raw}`)}`,
					}),
				),
			).rejects.toThrow("timestamp");
		const live = JSON.stringify({ ...event, livemode: true });
		await expect(
			adapter.handleWebhook(
				request(live, {
					"stripe-signature": `t=${timestamp},v1=${sign(`${timestamp}.${live}`)}`,
				}),
			),
		).rejects.toThrow("mode mismatch");
	});

	it("checks Lemon Squeezy signatures, store, variant and mode", async () => {
		const adapter = lemonSqueezyAdapter("api-key", secret, {
			storeId: "1",
			variantId: "2",
			testMode: true,
		});
		const event = {
			meta: {
				event_name: "order_created",
				custom_data: { orderId: "order-1" },
			},
			data: {
				type: "orders",
				id: "ls_1",
				attributes: {
					store_id: 1,
					test_mode: true,
					status: "paid",
					total: 1800,
					currency: "USD",
					first_order_item: { variant_id: 2 },
				},
			},
		};
		const raw = JSON.stringify(event);
		await expect(
			adapter.handleWebhook(request(raw, { "x-signature": sign(raw) })),
		).resolves.toEqual({
			orderId: "order-1",
			status: "paid",
			paymentRef: "ls_1",
			amount: 1800,
			currency: "USD",
		});
		const invalidHeaders: Record<string, string>[] = [
			{},
			{ "x-signature": "invalid" },
			{ "x-signature": sign(`${raw} `) },
		];
		for (const headers of invalidHeaders)
			await expect(
				adapter.handleWebhook(request(raw, headers)),
			).rejects.toThrow("signature");
		for (const attributes of [
			{ store_id: 3 },
			{ test_mode: false },
			{ first_order_item: { variant_id: 3 } },
		]) {
			const changed = JSON.stringify({
				...event,
				data: {
					...event.data,
					attributes: { ...event.data.attributes, ...attributes },
				},
			});
			await expect(
				adapter.handleWebhook(
					request(changed, { "x-signature": sign(changed) }),
				),
			).rejects.toThrow("mismatch");
		}
	});
});

describe("Shared payment validation", () => {
	const event = {
		orderId: "order-1",
		status: "paid",
		paymentRef: "pi_1",
		amount: 1800,
		currency: "USD",
	};

	it("keeps amounts nonnegative safe integers and currencies three letters", () => {
		expect(paymentWebhookResultSchema.parse(event)).toEqual(event);
		expect(
			paymentWebhookResultSchema.safeParse({
				...event,
				amount: 0,
				currency: "usd",
			}).success,
		).toBe(true);
		for (const amount of [
			-1,
			0.5,
			NaN,
			Infinity,
			Number.MAX_SAFE_INTEGER + 1,
			"1800",
			null,
		])
			expect(
				paymentWebhookResultSchema.safeParse({ ...event, amount }).success,
			).toBe(false);
		for (const currency of ["", "US", "USDD", "123", " USD", null])
			expect(
				paymentWebhookResultSchema.safeParse({ ...event, currency }).success,
			).toBe(false);
		for (const invalid of [
			{ orderId: "" },
			{ paymentRef: "" },
			{ status: "pending" },
		])
			expect(
				paymentWebhookResultSchema.safeParse({ ...event, ...invalid }).success,
			).toBe(false);
	});

	it("requires an HTTP(S) URL or nonempty client secret without changing the secret", () => {
		for (const checkout of [
			{ clientSecret: " secret " },
			{ redirectUrl: "https://pay.example/checkout" },
			{ redirectUrl: "http://localhost:3000/pay" },
			{ clientSecret: "secret", redirectUrl: "https://pay.example" },
		])
			expect(paymentCheckoutSchema.parse(checkout)).toEqual(checkout);
		for (const checkout of [
			{},
			{ clientSecret: "" },
			{ clientSecret: "   " },
			{ redirectUrl: "/pay" },
			{ redirectUrl: "javascript:alert(1)" },
			{ redirectUrl: "data:text/html,test" },
			{ redirectUrl: "ftp://pay.example" },
			{ redirectUrl: "https://" },
			{ clientSecret: "secret", redirectUrl: "javascript:alert(1)" },
			{ clientSecret: "", redirectUrl: "https://pay.example" },
		])
			expect(paymentCheckoutSchema.safeParse(checkout).success).toBe(false);
	});
});
