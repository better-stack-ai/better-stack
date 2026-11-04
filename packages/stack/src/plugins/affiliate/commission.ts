import type { CommissionType } from "./types";

/** Amounts are integer minor units; percentage values may have up to two decimals. */
export function calculateCommission(
	amount: number,
	type: CommissionType,
	value: number,
): number {
	if (
		!Number.isSafeInteger(amount) ||
		amount < 0 ||
		!Number.isFinite(value) ||
		value < 0
	) {
		throw new Error("Invalid commission amount or rule");
	}
	if (type === "flat") {
		if (!Number.isSafeInteger(value))
			throw new Error("Flat commissions require integer minor units");
		return value;
	}
	if (value > 100 || Math.abs(value * 100 - Math.round(value * 100)) > 1e-8) {
		throw new Error(
			"Commission percent must be between 0 and 100 with up to two decimal places",
		);
	}
	const basisPoints = BigInt(Math.round(value * 100));
	const result = Number((BigInt(amount) * basisPoints + 5000n) / 10000n);
	if (!Number.isSafeInteger(result))
		throw new Error("Commission exceeds safe integer range");
	return result;
}
