import { describe, expect, it, vi } from "vitest";
import {
	canDiscardCheckoutAttempt,
	reusableCheckoutAttempt,
} from "../client/checkout-attempt";

const attempt = {
	fingerprint: "same cart and shipping",
	key: "existing payment key",
	orderId: "existing order",
};

describe("checkout attempt reuse", () => {
	it("blocks changed details while a verified previous payment is pending", async () => {
		const verify = vi
			.fn()
			.mockResolvedValue({ status: "pending", paymentStatus: "pending" });
		await expect(
			reusableCheckoutAttempt(attempt, "changed shipping", verify),
		).rejects.toThrow(/previous payment/i);
		expect(verify).toHaveBeenCalledWith(attempt.orderId);
		expect(attempt.fingerprint).toBe("same cart and shipping");
	});
	it("allows changed details after the previous order is verified terminal", async () => {
		const verify = vi
			.fn()
			.mockResolvedValue({ status: "cancelled", paymentStatus: "pending" });
		expect(
			await reusableCheckoutAttempt(attempt, "changed shipping", verify),
		).toBeUndefined();
		expect(verify).toHaveBeenCalledWith(attempt.orderId);
	});
	it("retains ambiguous attempts and blocks changed details without another payment", async () => {
		const ambiguous = { fingerprint: attempt.fingerprint, key: attempt.key };
		const verify = vi.fn();
		await expect(
			reusableCheckoutAttempt(ambiguous, "changed shipping", verify),
		).rejects.toThrow(/previous payment/i);
		expect(ambiguous).toEqual({
			fingerprint: attempt.fingerprint,
			key: attempt.key,
		});
		expect(verify).not.toHaveBeenCalled();
	});
	it("reuses ambiguous attempts without requesting another order", async () => {
		const verify = vi.fn();
		const ambiguous = { fingerprint: attempt.fingerprint, key: attempt.key };
		expect(
			await reusableCheckoutAttempt(ambiguous, attempt.fingerprint, verify),
		).toBe(ambiguous);
		expect(verify).not.toHaveBeenCalled();
	});
	it("reuses a verified pending payment", async () => {
		const verify = vi
			.fn()
			.mockResolvedValue({ status: "pending", paymentStatus: "pending" });
		expect(
			await reusableCheckoutAttempt(attempt, attempt.fingerprint, verify),
		).toBe(attempt);
		expect(verify).toHaveBeenCalledWith(attempt.orderId);
	});
	it.each([
		{ status: "paid", paymentStatus: "paid" },
		{ status: "cancelled", paymentStatus: "pending" },
		{ status: "cancelled", paymentStatus: "failed" },
		{ status: "cancelled", paymentStatus: "refunded" },
	] as const)(
		"allows a new attempt only after verifying $status/$paymentStatus",
		async (order) => {
			expect(
				await reusableCheckoutAttempt(
					attempt,
					attempt.fingerprint,
					async () => order,
				),
			).toBeUndefined();
		},
	);
	it("retains the original attempt when verification is uncertain", async () => {
		await expect(
			reusableCheckoutAttempt(attempt, attempt.fingerprint, async () => {
				throw new Error("network unavailable");
			}),
		).rejects.toThrow("network unavailable");
		expect(attempt.key).toBe("existing payment key");
	});
});

describe("checkout rejection cleanup", () => {
	const fresh = { fingerprint: attempt.fingerprint, key: attempt.key };
	it("allows correction after a definitive rejection before any order was created", () => {
		expect(
			canDiscardCheckoutAttempt(fresh, fresh.key, "CHECKOUT_NOT_CREATED"),
		).toBe(true);
	});
	it("retains attempts after network errors and unknown provider outcomes", () => {
		expect(canDiscardCheckoutAttempt(fresh, fresh.key, undefined)).toBe(false);
	});
	it("retains a prior ambiguous attempt even if a later request is rejected", () => {
		expect(
			canDiscardCheckoutAttempt(
				{ ...fresh, uncertain: true },
				fresh.key,
				"CHECKOUT_NOT_CREATED",
			),
		).toBe(false);
	});
	it("retains known orders and a newer checkout attempt", () => {
		expect(
			canDiscardCheckoutAttempt(attempt, attempt.key, "CHECKOUT_NOT_CREATED"),
		).toBe(false);
		expect(
			canDiscardCheckoutAttempt(
				fresh,
				"different request key",
				"CHECKOUT_NOT_CREATED",
			),
		).toBe(false);
	});
});
