import { createHmac } from "node:crypto";
import { createMemoryAdapter } from "@btst/adapter-memory";
import type { DBAdapter, DatabaseDefinition } from "@btst/db";
import { createBackendStack } from "@btst/stack/api";
import { defineAuthorization } from "@btst/stack/authorization";
import { createServerAuth } from "@btst/stack/authorization/server";
import { stripeAdapter } from "@btst/stack/payments";
import { cmsBackendPlugin } from "@btst/plugin-cms/api";
import { cmsPermissions } from "@btst/plugin-cms/permissions";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
	ecommerceBackendPlugin,
	PRODUCT_CONTENT_TYPE,
} from "../../../plugin-ecommerce/src/api";
import { ecommercePermissions } from "../../../plugin-ecommerce/src/permissions";
import { schoolBackendPlugin } from "../../../plugin-school/src/api";
import { SCHOOL_COURSE_CONTENT_TYPE } from "../../../plugin-school/src/schemas";
import { schoolPermissions } from "../../../plugin-school/src/permissions";
import { calendarBackendPlugin } from "../../../plugin-calendar/src/api";
import { calendarPermissions } from "../../../plugin-calendar/src/permissions";
import { affiliateBackendPlugin } from "../api/plugin";
import { createAffiliateConversionHooks } from "../api/bridges";
import { affiliatePermissions } from "../permissions";

const secret = "bridge-test-webhook-secret";
const authorization = defineAuthorization({
	identity: z.object({ id: z.string() }),
	permissions: [
		cmsPermissions,
		affiliatePermissions,
		ecommercePermissions,
		schoolPermissions,
		calendarPermissions,
	],
	rules: ({ ecommerce, school, calendar }) => [
		ecommerce.checkout.create.allow(),
		school.enrollment.enroll.when(({ identity }) => identity !== null),
		calendar.booking.create.allow(),
		calendar.booking.read.when(({ facts }) => facts.tokenValid),
	],
});

// Give commerce the same serialized transaction guarantee as its existing test adapter.
function serializedMemory(db: DatabaseDefinition): DBAdapter {
	const memory = createMemoryAdapter(db)({});
	let tail = Promise.resolve();
	async function lock<T>(run: () => Promise<T>) {
		const previous = tail;
		let release = () => {};
		tail = new Promise<void>((resolve) => {
			release = resolve;
		});
		await previous;
		try {
			return await run();
		} finally {
			release();
		}
	}
	return {
		...memory,
		id: "serialized-bridge-test-memory",
		create: ((input) =>
			lock(() => memory.create(input))) as DBAdapter["create"],
		findOne: ((input) =>
			lock(() => memory.findOne(input))) as DBAdapter["findOne"],
		findMany: ((input) =>
			lock(() => memory.findMany(input))) as DBAdapter["findMany"],
		update: ((input) =>
			lock(() => memory.update(input))) as DBAdapter["update"],
		transaction: ((run) =>
			lock(() => memory.transaction(run))) as DBAdapter["transaction"],
	};
}

function webhook(path: string, orderId: string, amount: number, valid = true) {
	const timestamp = String(Math.floor(Date.now() / 1000));
	const body = JSON.stringify({
		type: "payment_intent.succeeded",
		data: {
			object: {
				id: `pi-${orderId}`,
				metadata: { orderId },
				amount_received: amount,
				currency: "usd",
			},
		},
	});
	const signature = createHmac("sha256", secret)
		.update(`${timestamp}.${body}`)
		.digest("hex");
	return new Request(
		`https://example.test/api/${path === "ecommerce" ? "shop" : path}/webhook`,
		{
			method: "POST",
			body,
			headers: {
				"content-type": "application/json",
				"stripe-signature": `t=${timestamp},v1=${valid ? signature : "00".repeat(32)}`,
			},
		},
	);
}

function setup(failAfterConversion = false) {
	let adapter!: DBAdapter;
	let fail = failAfterConversion;
	const adapterForPayment = stripeAdapter("sk_test_local", secret);
	vi.spyOn(adapterForPayment, "createPayment").mockResolvedValue({
		redirectUrl: "https://pay.example.test/checkout",
	});
	const serverAuth = createServerAuth({
		authorization,
		getIdentity: ({ request }) => ({
			id: request.headers.get("x-user") ?? "student",
		}),
	});
	const bridge = createAffiliateConversionHooks({
		recordConversion: (input): Promise<unknown> =>
			stack.trusted.affiliate.createConversion(input),
	});
	const stack = createBackendStack({
		basePath: "/api",
		adapter: (db) => {
			adapter = serializedMemory(db);
			return adapter;
		},
		auth: serverAuth,
		plugins: {
			cms: cmsBackendPlugin({
				contentTypes: [PRODUCT_CONTENT_TYPE, SCHOOL_COURSE_CONTENT_TYPE],
			}),
			affiliate: affiliateBackendPlugin({
				defaultCommissionValue: 20,
				hooks: {
					onAfterConversion: () => {
						if (fail) {
							fail = false;
							throw new Error("Retry commission observer");
						}
					},
				},
			}),
			ecommerce: ecommerceBackendPlugin({
				paymentAdapter: adapterForPayment,
				hooks: bridge.ecommerce,
				shippingAmount: 300,
				calculateTax: () => 200,
			}),
			school: schoolBackendPlugin({
				paymentAdapter: adapterForPayment,
				hooks: bridge.school,
			}),
			calendar: calendarBackendPlugin({
				paymentAdapter: adapterForPayment,
				hooks: bridge.calendar,
			}),
		},
	});
	async function request(path: string, body?: unknown, cookie?: string) {
		return stack.handler(
			new Request(`https://example.test/api/${path}`, {
				method: body ? "POST" : "GET",
				headers: {
					...(body ? { "content-type": "application/json" } : {}),
					...(cookie ? { cookie } : {}),
				},
				...(body ? { body: JSON.stringify(body) } : {}),
			}),
		);
	}
	async function referral() {
		const partner = await stack.trusted.affiliate.createAffiliate({
			userId: "partner",
			name: "Partner",
			email: "partner@example.test",
			code: "test-partner",
		});
		await stack.trusted.affiliate.updateAffiliate({
			id: partner.id,
			data: { status: "approved" },
		});
		const response = await request("affiliate/track/test-partner?to=/shop");
		expect(response.status).toBe(302);
		const cookie = response.headers.get("set-cookie")!.split(";")[0]!;
		return { cookie, clickId: cookie.slice(cookie.indexOf("=") + 1) };
	}
	return { stack, request, referral, adapter: () => adapter };
}

describe("Affiliate verified payment bridges", () => {
	it.each(["ecommerce", "school", "calendar"] as const)(
		"persists the browser click and creates one %s commission after a signed webhook, including observer retry",
		async (source) => {
			const { stack, request, referral, adapter } = setup(true);
			const { cookie, clickId } = await referral();
			let id: string;
			let orderId: string;
			let paidAmount = 2000;
			const expectedRevenue = 2000;
			let lessonId: string | undefined;
			let response: Response;
			if (source === "ecommerce") {
				const product = await stack.trusted.ecommerce.createProduct({
					slug: "book",
					data: {
						name: "Book",
						price: 2500,
						currency: "USD",
						stock: 10,
						status: "published",
					},
				});
				await stack.trusted.ecommerce.createDiscountCode({
					code: "SAVE",
					type: "fixed",
					value: 500,
				});
				const body = {
					items: [{ productId: product.id, quantity: 1 }],
					email: "buyer@example.test",
					discountCode: "SAVE",
					idempotencyKey: "c3207b1e-7bea-4bdc-a5fd-6b3ebfc739db",
					shippingAddress: {
						name: "Buyer",
						line1: "1 Main St",
						city: "Boston",
						postalCode: "02101",
						country: "US",
					},
				};
				response = await request("shop/checkout", body, cookie);
				expect(response.status).toBe(200);
				const result = await response.json();
				id = result.orderId;
				orderId = id;
				paidAmount = 2500;
				expect(JSON.stringify(result)).not.toContain(clickId);
				const retried = await request(
					"shop/checkout",
					body,
					"btst_affiliate=other-click",
				);
				expect((await retried.json()).orderId).toBe(id);
			} else if (source === "school") {
				const course = await stack.trusted.school.createCourse({
					title: "Course",
					slug: "course",
					instructorId: "teacher",
					status: "published",
					price: 2000,
				});
				response = await request(
					`school/courses/${course.id}/enroll`,
					{},
					cookie,
				);
				expect(response.status).toBe(200);
				const result = await response.json();
				id = result.id;
				orderId = `school:${id}`;
				expect(JSON.stringify(result)).not.toContain(clickId);
				await stack.trusted.school.updateCourse({
					id: course.id,
					data: { price: 9999 },
				});
				const retried = await request(
					`school/courses/${course.id}/enroll`,
					{},
					"btst_affiliate=other-click",
				);
				expect((await retried.json()).id).toBe(id);
			} else {
				const tomorrow = new Date();
				tomorrow.setUTCDate(tomorrow.getUTCDate() + 2);
				tomorrow.setUTCHours(9, 0, 0, 0);
				const eventData = {
					slug: "consultation",
					name: "Consultation",
					duration: 30,
					timezone: "UTC",
					price: 2000,
					currency: "USD",
					weeklyAvailability: [
						{ dayOfWeek: tomorrow.getUTCDay(), start: "09:00", end: "12:00" },
					],
				};
				const event = await stack.trusted.calendar.createEventType({
					hostId: "host",
					...eventData,
				});
				response = await request(
					`calendar/book/${event.slug}`,
					{
						start: tomorrow.toISOString(),
						timezone: "UTC",
						name: "Buyer",
						email: "buyer@example.test",
					},
					cookie,
				);
				expect(response.status).toBe(200);
				const result = await response.json();
				id = result.id;
				orderId = `calendar:${id}`;
				const resumed = await request(
					`calendar/cancel/${result.cancelToken}/checkout`,
					{},
					"btst_affiliate=other-click",
				);
				expect(resumed.status).toBe(200);
				expect(JSON.stringify(await resumed.json())).not.toContain(clickId);
				expect(JSON.stringify(result)).not.toContain(clickId);
				await stack.trusted.calendar.updateEventType({
					id: event.id,
					data: { ...eventData, price: 9999 },
				});
			}
			expect((await stack.trusted.affiliate.listCommissions({})).total).toBe(0);
			const row = await adapter().findOne<Record<string, unknown>>({
				model:
					source === "ecommerce"
						? "ecommerceOrder"
						: source === "school"
							? "schoolEnrollment"
							: "calendarBooking",
				where: [{ field: "id", value: id! }],
			});
			expect(JSON.stringify(row)).toContain(clickId);
			expect(
				(await stack.handler(webhook(source, orderId!, paidAmount, false)))
					.status,
			).toBe(400);
			expect((await stack.trusted.affiliate.listCommissions({})).total).toBe(0);
			expect(
				(await stack.handler(webhook(source, orderId!, paidAmount))).status,
			).toBe(500);
			expect((await stack.trusted.affiliate.listCommissions({})).total).toBe(1);
			if (lessonId) {
				await stack.trusted.school.saveProgress({
					id: lessonId,
					userId: "student",
					data: { completed: true },
				});
				const completed = await adapter().findOne<{ status: string }>({
					model: "schoolEnrollment",
					where: [{ field: "id", value: id! }],
				});
				expect(completed?.status).toBe("completed");
			}
			expect(
				(await stack.handler(webhook(source, orderId!, paidAmount))).status,
			).toBe(200);
			expect(
				(await stack.handler(webhook(source, orderId!, paidAmount))).status,
			).toBe(200);
			const commissions = await stack.trusted.affiliate.listCommissions({});
			expect(commissions.total).toBe(1);
			expect(commissions.items[0]).toMatchObject({
				amount: expectedRevenue * 0.2,
				currency: "USD",
			});
			const conversions = await adapter().findMany<{
				externalRef: string;
				amount: number;
				clickId: string;
			}>({ model: "affiliateConversion" });
			expect(conversions).toHaveLength(1);
			expect(conversions[0]).toMatchObject({
				externalRef: `${source}:${id!}`,
				amount: expectedRevenue,
				clickId,
			});
		},
	);
	it("skips missing attribution, invalid browser values and unverified/free lifecycle notifications", async () => {
		const recordConversion = vi.fn();
		const bridge = createAffiliateConversionHooks({ recordConversion });
		expect(
			bridge.school.capturePaymentAttribution({
				request: new Request("https://example.test?ref=INVALID"),
			}),
		).toBeUndefined();
		await bridge.school.onAfterEnroll({ id: "free", status: "enrolled" }, {});
		await bridge.school.onAfterEnroll(
			{ id: "pending", status: "pending_payment" },
			{},
			{
				payment: {
					amount: 100,
					currency: "USD",
					attribution: { code: "test-partner" },
				},
			},
		);
		await bridge.calendar.onAfterConfirmBooking({
			id: "host-managed",
			status: "confirmed",
		});
		await bridge.calendar.onAfterConfirmBooking(
			{ id: "rescheduled", status: "confirmed" },
			{
				reason: "rescheduled",
				payment: {
					amount: 100,
					currency: "USD",
					attribution: { code: "test-partner" },
				},
			},
		);
		await bridge.ecommerce.onAfterOrderPaid(
			{
				id: "unpaid",
				paymentStatus: "pending",
				subtotal: 100,
				discount: 0,
				currency: "USD",
			},
			{ attribution: { code: "test-partner" } },
		);
		expect(recordConversion).not.toHaveBeenCalled();
	});
});
