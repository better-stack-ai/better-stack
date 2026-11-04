import { describe, expect, it, vi } from "vitest";
import { reusableCheckoutAttempt } from "../checkout-attempt";

const attempt = {
	fingerprint: "same cart and shipping",
	key: "existing payment key",
	orderId: "existing order",
};

describe("checkout attempt reuse", () => {
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
